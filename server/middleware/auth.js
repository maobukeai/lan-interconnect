const os = require('os');
const { state, getCleanIp } = require('../config');

function checkAuth(req, res, next) {
    if (req.path === '/' || req.path === '/index.html') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

    if (state.currentConfig.whitelistMode) {
        const rawIp = req.ip || req.socket?.remoteAddress;
        const cleanIp = getCleanIp(rawIp);
        if (cleanIp !== '127.0.0.1' && cleanIp !== '::1' && !state.currentConfig.whitelistIps.includes(cleanIp)) {
            return res.status(403).json({ error: 'Access Denied: IP not in whitelist' });
        }
    }

    if (req.path === '/' || req.path.startsWith('/index.html') || req.path.startsWith('/favicon.ico') || req.path.startsWith('/api/shared/download/')) {
        return next();
    }
    if (!state.currentConfig.pin) {
        return next(); // 免密模式
    }
    
    const pin = req.headers['x-pin'] || req.query.pin;
    if (pin === state.currentConfig.pin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized', requireAuth: true });
    }
}

function checkSensitive(req, res, next) {
    if (state.currentConfig.pin) {
        return next();
    }
    const rawIp = req.ip || req.socket?.remoteAddress;
    const cleanIp = getCleanIp(rawIp);
    const localIps = ['127.0.0.1', '::1'];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4') localIps.push(iface.address);
        }
    }
    if (localIps.includes(cleanIp)) {
        return next();
    }
    return res.status(403).json({ error: '安全限制：免密模式下该操作仅允许本机访问。如需从远程客户端操控，请先在控制面板设置 PIN 访问密码。' });
}

module.exports = {
    checkAuth,
    checkSensitive
};
