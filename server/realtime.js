/**
 * 猫步互联 Pro - 远程桌面实时通道 (Realtime)
 *
 * 基于 ws 的 WebSocket 端点 /api/remote/ws：
 *  - 下行 binary：屏幕 JPEG 帧（由常驻 PowerShell 截屏进程解析而来，4 字节小端长度前缀）
 *  - 下行 text：状态 JSON（如 {"type":"status","streaming":true}）
 *  - 上行 text：输入/控制事件 JSON（move/down/up/click/scroll/key/text/start/stop 等）
 *
 * 鉴权：upgrade 时 query 传 pin 或 token，校验逻辑与 checkAuth/checkSensitive 同标准；
 * 免密模式下仅本机连接可开流，与 HTTP 敏感接口安全模型一致。
 */
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { state, getCleanIp, isValidQrToken } = require('./config');
const { isAllowedApiOrigin, isLocalRequest } = require('./middleware/auth');

const WS_PATH = '/api/remote/ws';

const isPackaged = __dirname.includes('app.asar');
const psScriptPath = isPackaged
    ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'services', 'system-control.ps1')
    : path.join(__dirname, 'services', 'system-control.ps1');

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

// 每个客户端最多允许积压的未确认字节数，超过则跳帧（背压）
const MAX_BACKLOG = 2 * 1024 * 1024;

// 全局唯一的截图常驻进程（多客户端共享同一画面流）
let captureProc = null;
let captureProcParams = null;
let streamBuffer = Buffer.alloc(0);
let streamClients = new Set();

function killCaptureProc() {
    if (captureProc) {
        try { captureProc.kill(); } catch (e) {}
        try { captureProc.stdout.destroy(); } catch (e) {}
        captureProc = null;
        captureProcParams = null;
    }
    streamBuffer = Buffer.alloc(0);
}

function ensureCaptureProc(params) {
    if (process.platform !== 'win32') return false;
    const sig = JSON.stringify(params);
    if (captureProc && captureProcParams === sig) return true;
    killCaptureProc();

    const args = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', psScriptPath,
        '-Action', 'stream',
        '-Display', String(params.display || 0),
        '-Scale', String(params.scale || 0.6),
        '-Quality', String(params.quality || 60),
        '-Fps', String(params.fps || 10)
    ];

    try {
        captureProc = spawn('powershell.exe', args, { windowsHide: true });
    } catch (e) {
        captureProc = null;
        return false;
    }
    captureProcParams = sig;

    captureProc.stdout.on('data', (chunk) => {
        if (!captureProc) return;
        streamBuffer = Buffer.concat([streamBuffer, chunk]);
        // 逐帧切分并广播：4 字节小端长度前缀 + JPEG
        while (streamBuffer.length >= 4) {
            const frameLen = streamBuffer.readUInt32LE(0);
            if (frameLen > 20 * 1024 * 1024) { // 异常超长帧，防脏数据撑爆内存
                killCaptureProc();
                break;
            }
            if (streamBuffer.length < 4 + frameLen) break;
            const jpeg = streamBuffer.slice(4, 4 + frameLen);
            streamBuffer = streamBuffer.slice(4 + frameLen);
            broadcastFrame(jpeg);
        }
    });

    captureProc.on('exit', () => {
        captureProc = null;
        captureProcParams = null;
        streamBuffer = Buffer.alloc(0);
        // 进程意外退出时通知客户端回退 HTTP 轮询
        for (const client of streamClients) {
            try { client.ws.send(JSON.stringify({ type: 'status', streaming: false, reason: 'capture exited' })); } catch (e) {}
        }
    });

    captureProc.on('error', () => {
        killCaptureProc();
    });

    return true;
}

function broadcastFrame(jpeg) {
    for (const client of streamClients) {
        if (client.ws.readyState !== 1) continue;
        // 背压：该客户端积压过多则跳帧
        if (client.ws.bufferedAmount > MAX_BACKLOG) continue;
        try { client.ws.send(jpeg, { binary: true }); } catch (e) {}
    }
}

function startStreamFor(ws, params) {
    if (!ensureCaptureProc(params)) {
        ws.send(JSON.stringify({ type: 'status', streaming: false, reason: 'unsupported platform' }));
        return;
    }
    streamClients.add(ws.__client);
    ws.send(JSON.stringify({
        type: 'status',
        streaming: true,
        fps: params.fps,
        scale: params.scale,
        quality: params.quality
    }));
}

function stopStreamFor(ws) {
    streamClients.delete(ws.__client);
    try { ws.send(JSON.stringify({ type: 'status', streaming: false })); } catch (e) {}
    // 没有观看者时停掉常驻截屏进程省 CPU
    if (streamClients.size === 0 && captureProc) {
        killCaptureProc();
   }
}

// ---- 输入事件执行：与 HTTP 端点复用同一个 PowerShell 脚本 ----

let lastInputAt = 0;

function runInputAction(args) {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') return resolve(false);
        // 粗节流：输入事件最小间隔 15ms，防止事件洪泛打爆进程创建
        const now = Date.now();
        const wait = lastInputAt + 15 - now;
        lastInputAt = now;
        if (wait > 0) {
            setTimeout(() => runInputAction(args).then(resolve), wait);
            return;
        }
        const ps = spawn('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', psScriptPath,
            ...args
        ], { windowsHide: true, timeout: 10000 });
        ps.on('exit', () => resolve(true));
        ps.on('error', () => resolve(false));
    });
}

function parseCoord(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
}

async function handleInput(client, msg) {
    const type = String(msg.type || '');
    switch (type) {
        case 'move': {
            const x = parseCoord(msg.x), y = parseCoord(msg.y);
            if (x === null || y === null) return;
            await runInputAction(['-Action', 'move', '-MouseX', String(x), '-MouseY', String(y)]);
            break;
        }
        case 'down': {
            const x = parseCoord(msg.x), y = parseCoord(msg.y);
            if (x === null || y === null) return;
            const btn = (msg.button === 'right' || msg.button === 'middle') ? msg.button : 'left';
            await runInputAction(['-Action', 'mousedown', '-MouseX', String(x), '-MouseY', String(y), '-MouseButton', btn]);
            break;
        }
        case 'up': {
            const x = parseCoord(msg.x), y = parseCoord(msg.y);
            if (x === null || y === null) return;
            const btn = (msg.button === 'right' || msg.button === 'middle') ? msg.button : 'left';
            await runInputAction(['-Action', 'mouseup', '-MouseX', String(x), '-MouseY', String(y), '-MouseButton', btn]);
            break;
        }
        case 'click': {
            const x = parseCoord(msg.x), y = parseCoord(msg.y);
            if (x === null || y === null) return;
            const btn = (msg.button === 'right' || msg.button === 'double') ? msg.button : 'left';
            await runInputAction(['-Action', 'click', '-MouseX', String(x), '-MouseY', String(y), '-MouseButton', btn]);
            break;
        }
        case 'scroll': {
            const delta = Math.max(-50, Math.min(50, Math.round(Number(msg.delta) || 0)));
            if (!delta) return;
            const args = ['-Action', 'scroll', '-Delta', String(delta)];
            const x = parseCoord(msg.x), y = parseCoord(msg.y);
            if (x !== null && y !== null) args.push('-MouseX', String(x), '-MouseY', String(y));
            await runInputAction(args);
            break;
        }
        case 'key': {
            const key = String(msg.key || '').trim();
            if (!/^[a-zA-Z0-9]{1,12}$/.test(key)) return;
            const mods = Array.isArray(msg.modifiers)
                ? msg.modifiers.map(m => String(m).toLowerCase()).filter(m => ['ctrl', 'alt', 'shift', 'win'].includes(m)).join(',')
                : '';
            await runInputAction(['-Action', 'key', '-KeyName', key, '-Modifiers', mods]);
            break;
        }
        case 'text': {
            const text = String(msg.text || '');
            if (!text || text.length > 2000) return;
            await runInputAction(['-Action', 'text', '-Text', text]);
            break;
        }
    }
}

// ---- upgrade 鉴权与连接管理 ----

function verifyUpgrade(req) {
    const rawIp = req.socket?.remoteAddress;
    const cleanIp = getCleanIp(rawIp);

    if (state.blockedIps.has(cleanIp)) return false;

    // 来源白名单（浏览器 WS 一定带 Origin）
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
        try {
            const o = new URL(origin);
            const hostname = o.hostname.replace(/^\[|\]$/g, '');
            const allowed = o.protocol === 'capacitor:' || o.protocol === 'ionic:' || o.protocol === 'file:' || o.protocol === 'app:' || o.protocol === 'vscode-webview:'
                || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || /\.local$/i.test(hostname)
                || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.|169\.254\.)/.test(hostname)
                || /^f[cd][0-9a-f]{2}:/.test(hostname) || /^fe[89ab]:/.test(hostname)
                || o.host === (req.headers.host || '');
            if (!allowed) return false;
        } catch (e) {
            return false;
        }
    }

    // 凭据：query 的 token 或 pin；免密模式下仅本机可连（与 checkSensitive 同标准）
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token && (isValidQrToken(token) || safeEqual(token, state.qrToken))) return true;

    if (state.currentConfig.pin) {
        const pin = url.searchParams.get('pin');
        if (pin !== null && safeEqual(pin, state.currentConfig.pin)) return true;
        return false;
    }
    return isLocalRequest({ socket: req.socket });
}

function attachRealtime(server) {
    const WebSocket = require('ws');
    const wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        let urlPath = '';
        try {
            urlPath = new URL(req.url, 'http://localhost').pathname;
        } catch (e) {}
        if (urlPath !== WS_PATH) {
            // 非本模块路径：不响应也不销毁，留给其他 upgrade 处理者（当前项目无其他 WS）
            return;
        }
        if (!verifyUpgrade(req)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    wss.on('connection', (ws, req) => {
        ws.__client = { ws, isLocal: isLocalRequest({ socket: req.socket }) };
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', async (data, isBinary) => {
            if (isBinary) return; // 本通道上行只收文本控制事件
            let msg;
            try { msg = JSON.parse(data.toString()); } catch (e) { return; }

            // 控制指令：开始/停止画面流
            if (msg.type === 'start') {
                const fps = Math.max(2, Math.min(30, parseInt(msg.fps, 10) || 10));
                const scale = Math.max(0.2, Math.min(1.0, parseFloat(msg.scale) || 0.6));
                const quality = Math.max(20, Math.min(90, parseInt(msg.quality, 10) || 60));
                startStreamFor(ws, { display: parseInt(msg.display, 10) || 0, fps, scale, quality });
                return;
            }
            if (msg.type === 'stop') {
                stopStreamFor(ws);
                return;
            }
            if (msg.type === 'ping') {
                try { ws.send(JSON.stringify({ type: 'pong', t: Date.now() })); } catch (e) {}
                return;
            }
            await handleInput(ws.__client, msg);
        });

        ws.on('close', () => {
            stopStreamFor(ws);
        });

        ws.on('error', () => {});
    });

    // 心跳：15s 无响应断开
    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) {
            if (ws.isAlive === false) {
                try { ws.terminate(); } catch (e) {}
                continue;
            }
            ws.isAlive = false;
            try { ws.ping(); } catch (e) {}
        }
    }, 15000);
    heartbeat.unref();

    return {
        close() {
            clearInterval(heartbeat);
            killCaptureProc();
            for (const ws of wss.clients) {
                try { ws.terminate(); } catch (e) {}
            }
            try { wss.close(); } catch (e) {}
        }
    };
}

module.exports = { attachRealtime, WS_PATH };
