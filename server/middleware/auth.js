const os = require('os');
const crypto = require('crypto');
const { state, getCleanIp, isValidQrToken } = require('../config');

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

// PIN 试错限流：每 IP 5 分钟窗口内最多 20 次失败，超出直接 429
const AUTH_FAIL_LIMIT = 20;
const AUTH_FAIL_WINDOW = 5 * 60 * 1000;
const authFailures = new Map(); // ip -> { count, resetAt }

function registerAuthFailure(ip) {
    const now = Date.now();
    const entry = authFailures.get(ip);
    if (!entry || now > entry.resetAt) {
        authFailures.set(ip, { count: 1, resetAt: now + AUTH_FAIL_WINDOW });
    } else {
        entry.count++;
    }
    // 顺手清理过期条目，防止 Map 无限膨胀
    if (authFailures.size > 1000) {
        for (const [key, val] of authFailures) {
            if (now > val.resetAt) authFailures.delete(key);
        }
    }
}

function isAuthRateLimited(ip) {
    const entry = authFailures.get(ip);
    return !!(entry && Date.now() <= entry.resetAt && entry.count >= AUTH_FAIL_LIMIT);
}

function clearAuthFailures(ip) {
    authFailures.delete(ip);
}

function getLocalIpList() {
    const localIps = ['127.0.0.1', '::1'];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' || iface.family === 'IPv6') localIps.push(iface.address);
        }
    }
    return localIps;
}

function checkAuth(req, res, next) {
    const rawIp = req.ip || req.socket?.remoteAddress;
    const cleanIp = getCleanIp(rawIp);

    // IP 黑名单强制拦截（对静态页面之外的所有请求生效）
    if (state.blockedIps.has(cleanIp)) {
        return res.status(403).json({ error: 'Access Denied: IP 已被封禁' });
    }

    if (state.currentConfig.whitelistMode) {
        if (cleanIp !== '127.0.0.1' && cleanIp !== '::1' && !state.currentConfig.whitelistIps.includes(cleanIp)) {
            return res.status(403).json({ error: 'Access Denied: IP not in whitelist' });
        }
    }

    // 跨站来源防护：浏览器请求若来自互联网公网网页（恶意站点 drive-by），一律拒绝。
    // 放行范围：无 Origin（curl/原生客户端）、file:// 桌面端（Origin: null）、
    // 同 Host（含 landisk.local）、本机回环、Capacitor(http://localhost)、私有网段来源。
    if (!isAllowedApiOrigin(req)) {
        return res.status(403).json({ error: 'Access Denied: 跨站来源不被允许' });
    }

    if (req.path === '/' || req.path.startsWith('/index.html') || req.path.startsWith('/favicon.ico') || req.path.startsWith('/shared/download/') || req.path === '/ping' || req.path === '/api/ping') {
        return next();
    }

    // 检查扫码免密 Token 鉴权 (若请求包含二维码分配的 token)
    const token = req.headers['x-qr-token'] || req.query.token;
    if (token && (isValidQrToken(token) || safeEqual(token, state.qrToken))) {
        clearAuthFailures(cleanIp);
        return next();
    }

    if (!state.currentConfig.pin) {
        // 免密模式下 file:// 桌面端（Origin: null）的写请求必须持有效扫码 Token：
        // 能走到这里说明 Token 缺失或无效，一律拒绝写操作（防沙箱 iframe 借 Origin:null 写入/执行命令）
        if (req.headers.origin === 'null' && req.method !== 'GET' && req.method !== 'HEAD') {
            return res.status(403).json({ error: 'Access Denied: 免密模式下该操作需要凭据' });
        }
        return next(); // 免密模式
    }

    if (isAuthRateLimited(cleanIp)) {
        return res.status(429).json({ error: '尝试次数过多，请 5 分钟后再试' });
    }

    const pin = req.headers['x-pin'] || req.query.pin;
    if (pin !== undefined && pin !== null && safeEqual(pin, state.currentConfig.pin)) {
        clearAuthFailures(cleanIp);
        next();
    } else {
        registerAuthFailure(cleanIp);
        res.status(401).json({ error: 'Unauthorized', requireAuth: true });
    }
}

function isLocalRequest(req) {
    const rawIp = req.ip || req.socket?.remoteAddress;
    const cleanIp = getCleanIp(rawIp);
    return getLocalIpList().includes(cleanIp);
}

// 浏览器来源白名单：同 Host（含 landisk.local）、本机回环、Capacitor 打包页(http://localhost)、
// 私有网段（跨设备网页互访与局域网雷达）。互联网公网来源返回 false。
function isAllowedApiOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true; // 无 Origin（curl / 原生客户端 / 媒体播放器）
    if (origin === 'null') return true; // file:// 桌面端 (Electron 壳)
    try {
        const o = new URL(origin);
        // 打包壳内协商方案（Capacitor iOS/Tauri 等），均为应用自己持有的受限上下文
        if (o.protocol === 'capacitor:' || o.protocol === 'ionic:' || o.protocol === 'file:' || o.protocol === 'app:' || o.protocol === 'vscode-webview:') return true;
        if (o.protocol !== 'http:' && o.protocol !== 'https:') return false;
        if (o.host === (req.headers.host || '')) return true;
        const hostname = o.hostname.replace(/^\[|\]$/g, '');
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || /\.local$/i.test(hostname)) return true;
        if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.|169\.254\.)/.test(hostname)) return true;
        // IPv6 唯一本地地址 (fc00::/7) 与链路本地地址 (fe80::/10)
        if (/^f[cd][0-9a-f]{2}:/.test(hostname) || /^fe[89ab]:/.test(hostname)) return true;
        return false;
    } catch (e) {
        return false;
    }
}

function checkSensitive(req, res, next) {
    // 若匹配有效扫码 Token 允许访问敏感控制 API
    const token = req.headers['x-qr-token'] || req.query.token;
    if (token && (isValidQrToken(token) || safeEqual(token, state.qrToken))) {
        return next();
    }

    if (state.currentConfig.pin) {
        return next();
    }
    if (isLocalRequest(req)) {
        return next();
    }
    return res.status(403).json({ error: '安全限制：免密模式下该操作仅允许本机访问。如需从远程客户端操控，请先在控制面板设置 PIN 访问密码。' });
}

// 远程控制类接口（/api/remote/*）的宽松校验：
// 免密模式下放行局域网与 Tailscale（100.64/10）网段来源——这些网络本身即用户私有，
// checkAuth 已拦截公网 Origin 与 IP 黑名单，此处再按源 IP 网段复核一道。
// 设置了 PIN 时行为与 checkSensitive 一致（PIN 已在 checkAuth 校验）。
function checkRemoteControl(req, res, next) {
    const token = req.headers['x-qr-token'] || req.query.token;
    if (token && (isValidQrToken(token) || safeEqual(token, state.qrToken))) {
        return next();
    }

    if (state.currentConfig.pin) {
        return next();
    }
    if (isLocalRequest(req)) {
        return next();
    }
    const cleanIp = getCleanIp(req.ip || req.socket?.remoteAddress);
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.|169\.254\.)/.test(cleanIp)) {
        return next();
    }
    return res.status(403).json({ error: '安全限制：免密模式下远程控制仅允许局域网/Tailscale 设备使用；来自公网的访问请设置 PIN 访问密码。' });
}

module.exports = {
    checkAuth,
    checkSensitive,
    checkRemoteControl,
    isLocalRequest,
    isAllowedApiOrigin
};
