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
    if (req.path === '/' || req.path === '/index.html') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

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

module.exports = {
    checkAuth,
    checkSensitive,
    isLocalRequest
};
