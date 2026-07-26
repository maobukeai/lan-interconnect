const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// 全局配置与运行状态
const state = {
    app: null,
    server: null,
    activeSockets: new Set(),
    currentConfig: { mode: 'full', pin: '', port: 3000, customDir: '', whitelistMode: false, whitelistIps: [], bindIp: '' },
    sharedDir: '',
    qrToken: '',
    validTokens: new Set(),
    networkStats: {
        rxBytes: 0,
        txBytes: 0,
        rxSpeed: 0, // B/s
        txSpeed: 0  // B/s
    },
    lastStatsUpdate: Date.now(),
    lastRxBytes: 0,
    lastTxBytes: 0,
    chatMessages: [],
    sseClients: [],
    connectedDevices: {},
    blockedIps: new Set(),
    deviceAliases: {},
    sharedLinks: {},
    statsInterval: null,
    autoCleanupInterval: null
};

const BLOCKED_IPS_FILE = path.join(__dirname, '..', 'blocked_ips.json');
const DEVICE_ALIASES_FILE = path.join(__dirname, '..', 'device_aliases.json');

function generateQrToken() {
    state.qrToken = crypto.randomBytes(8).toString('hex');
    state.validTokens.add(state.qrToken);
    return state.qrToken;
}

function loadPersistedSecurityData() {
    try {
        if (fs.existsSync(BLOCKED_IPS_FILE)) {
            const arr = JSON.parse(fs.readFileSync(BLOCKED_IPS_FILE, 'utf8'));
            if (Array.isArray(arr)) state.blockedIps = new Set(arr);
        }
    } catch(e) {}
    try {
        if (fs.existsSync(DEVICE_ALIASES_FILE)) {
            state.deviceAliases = JSON.parse(fs.readFileSync(DEVICE_ALIASES_FILE, 'utf8'));
        }
    } catch(e) {}
}

function savePersistedSecurityData() {
    try {
        fs.writeFileSync(BLOCKED_IPS_FILE, JSON.stringify(Array.from(state.blockedIps)), 'utf8');
    } catch(e) {}
    try {
        fs.writeFileSync(DEVICE_ALIASES_FILE, JSON.stringify(state.deviceAliases), 'utf8');
    } catch(e) {}
}

loadPersistedSecurityData();

function broadcastMessage(msg) {
    const data = `data: ${JSON.stringify({ type: 'new', message: msg })}\n\n`;
    state.sseClients.forEach(client => {
        try {
            client.res.write(data);
        } catch (e) {}
    });
}

function getCleanIp(rawIp) {
    if (!rawIp) return '';
    let ip = rawIp;
    if (ip.includes('::ffff:')) {
        ip = ip.split('::ffff:')[1];
    }
    return ip === '::1' ? '127.0.0.1' : ip;
}

function isSafePath(targetPath) {
    if (!targetPath) return false;
    const resolvedPath = path.resolve(targetPath);
    if (state.currentConfig.mode === 'shared') {
        const resolvedShared = path.resolve(state.sharedDir);
        return resolvedPath === resolvedShared || resolvedPath.startsWith(resolvedShared + path.sep);
    }
    if (process.platform === 'win32') {
        const lower = resolvedPath.toLowerCase();
        const sys32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32').toLowerCase();
        if (lower.startsWith(sys32)) {
            return false;
        }
    }
    return true;
}

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    let backupIp = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
                    if (!backupIp.startsWith('192.168.') || backupIp.startsWith('192.168.137.')) {
                        backupIp = iface.address;
                    }
                } else if (backupIp === '127.0.0.1') {
                    backupIp = iface.address;
                }
            }
        }
    }
    return backupIp;
}

function shouldCompress(req, res) {
    if (req.headers['x-no-compression']) {
        return false;
    }
    return true;
}

module.exports = {
    state,
    generateQrToken,
    loadPersistedSecurityData,
    savePersistedSecurityData,
    broadcastMessage,
    getCleanIp,
    isSafePath,
    getLocalIpAddress,
    shouldCompress
};
