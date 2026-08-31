/* 服务端冒烟测试：启动 server.js，验证 WS 通道与新 HTTP 端点。
 * 注意：真实执行类测试仅使用无害动作（move / scroll / 空白角落点击 / f15），
 * key 与 text 只验证参数校验拒绝路径，避免向用户当前焦点窗口注入输入。 */
const { spawn } = require('child_process');

const server = spawn(process.execPath, ['server.js'], { cwd: __dirname + '/..', stdio: ['ignore', 'pipe', 'pipe'] });
let serverOut = '';
server.stdout.on('data', d => { serverOut += d.toString(); });
server.stderr.on('data', d => { serverOut += d.toString(); });

let PORT = 0;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitPort() {
    for (let i = 0; i < 40; i++) {
        const m = serverOut.match(/Running on http:\/\/[^:]+:(\d+)/);
        if (m) { PORT = parseInt(m[1], 10); return true; }
        await delay(500);
    }
    return false;
}

async function main() {
    const ok = await waitPort();
    if (!ok) {
        console.error('SERVER FAILED TO START:\n' + serverOut);
        server.kill();
        process.exit(1);
    }
    console.log('[1] server started on port', PORT);

    // A. 新 HTTP 端点（无 PIN 免密模式 + 本机来源 = checkSensitive 放行）
    for (const [method, ep, body, expect] of [
        ['POST', '/api/remote/mouse/move', { x: 500, y: 300 }, 200],   // 无害移动
        ['POST', '/api/remote/mouse/down', { x: 5, y: 5 }, 200],       // 空白角落
        ['POST', '/api/remote/mouse/up', { x: 5, y: 5 }, 200],
        ['POST', '/api/remote/scroll', { delta: 1 }, 200],             // 轻滚一格
        ['POST', '/api/remote/key', { key: 'f15' }, 200],              // f15 无实际映射
        ['POST', '/api/remote/key', { key: '!!bad!!' }, 400],          // 校验拒绝
        ['POST', '/api/remote/text', { text: '' }, 400],               // 校验拒绝
    ]) {
        const res = await fetch(`http://127.0.0.1:${PORT}${ep}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const txt = await res.text();
        const flag = res.status === expect ? 'OK' : `MISMATCH(expect ${expect})`;
        console.log(`[HTTP] ${method} ${ep} ${JSON.stringify(body).slice(0, 40)} -> ${res.status} ${flag} ${txt.slice(0, 50)}`);
    }

    // B. WebSocket：本机无凭据应放行；错误 pin 应拒绝
    const WebSocket = require('ws');
    await new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/remote/ws`);
        ws.on('open', () => ws.send(JSON.stringify({ type: 'move', x: 500, y: 300 })));
        ws.on('message', (d, isBin) => {
            console.log('[WS] local no-cred connected, msg:', d.toString().slice(0, 60));
            ws.close(); resolve();
        });
        ws.on('error', (e) => { console.log('[WS] local no-cred error:', e.message); resolve(); });
        setTimeout(() => { console.log('[WS] local no-cred: connected, no reply (input ok)'); try { ws.close(); } catch(e){} resolve(); }, 6000);
    });

    await new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/remote/ws?pin=wrongpin`);
        ws.on('error', (e) => { console.log('[WS] wrong-pin rejected:', e.message.slice(0, 60)); resolve(); });
        ws.on('open', () => { console.log('[WS] wrong-pin ACCEPTED (BUG!)'); ws.close(); resolve(); });
        setTimeout(() => resolve(), 5000);
    });

    // C. WS 画面流：start 后应收到 status + binary JPEG 帧
    await new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/remote/ws`);
        let gotStatus = false, binFrames = 0, binBytes = 0, resolved = false;
        const done = () => {
            if (resolved) return; resolved = true;
            console.log(`[WS] stream frames=${binFrames} bytes=${binBytes} status=${gotStatus}`);
            try { ws.send(JSON.stringify({ type: 'stop' })); ws.close(); } catch (e) {}
            resolve();
        };
        ws.on('open', () => ws.send(JSON.stringify({ type: 'start', fps: 5, scale: 0.3, quality: 40 })));
        ws.on('message', (d, isBin) => {
            if (isBin) { binFrames++; binBytes += d.length; if (binFrames >= 3) done(); }
            else {
                const m = JSON.parse(d.toString());
                if (m.type === 'status') { gotStatus = true; console.log('[WS] stream status:', JSON.stringify(m)); }
            }
        });
        ws.on('error', (e) => { console.log('[WS] stream error:', e.message); done(); });
        setTimeout(done, 15000);
    });

    // D. 设置 PIN 后重启，验证 PIN 鉴权路径
    await fetch(`http://127.0.0.1:${PORT}/api/control/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '654321' })
    });
    await delay(2500);
    const authTests = [
        ['correct pin', `ws://127.0.0.1:${PORT}/api/remote/ws?pin=654321`, 'accept'],
        ['wrong pin', `ws://127.0.0.1:${PORT}/api/remote/ws?pin=wrong`, 'reject'],
        ['no cred', `ws://127.0.0.1:${PORT}/api/remote/ws`, 'reject'],
    ];
    for (const [name, url, expect] of authTests) {
        await new Promise((resolve) => {
            const ws = new WebSocket(url);
            let resolved = false;
            const finish = (result) => {
                if (resolved) return; resolved = true;
                const flag = result === expect ? 'OK' : `MISMATCH(expect ${expect})`;
                console.log(`[WS-auth] ${name} -> ${result} ${flag}`);
                try { ws.close(); } catch (e) {}
                resolve();
            };
            ws.on('open', () => finish('accept'));
            ws.on('error', () => finish('reject'));
            setTimeout(() => finish('timeout'), 5000);
        });
    }
    // HTTP 端点在 PIN 模式下错误 PIN 应 401
    const r401 = await fetch(`http://127.0.0.1:${PORT}/api/remote/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pin': '000000' },
        body: JSON.stringify({ key: 'a' })
    });
    console.log(`[HTTP-auth] key with wrong x-pin -> ${r401.status} ${r401.status === 401 ? 'OK' : 'MISMATCH'}`);

    // 恢复无 PIN 配置
    await fetch(`http://127.0.0.1:${PORT}/api/control/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pin': '654321' },
        body: JSON.stringify({ pin: '' })
    });
    await delay(1500);

    server.kill();
    await delay(500);
    console.log('SMOKE TEST DONE');
    process.exit(0);
}

main().catch(e => { console.error('SMOKE FAIL:', e); server.kill(); process.exit(1); });
