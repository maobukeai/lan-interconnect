const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// 扫码 Token 有效期（毫秒）：12 小时后过期
const QR_TOKEN_TTL = 12 * 60 * 60 * 1000;
const MAX_VALID_TOKENS = 50;

// 统一数据目录：家目录下 ~/.landisk。
// 不能放在项目根目录 —— asar 打包后项目根在压缩包内，写入会静默失败。
const DATA_DIR = path.join(os.homedir(), '.landisk');
const TRASH_DIR = path.join(DATA_DIR, 'trash');
if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

function resolveDataFile(name, legacyPath) {
    const target = path.join(DATA_DIR, name);
    try {
        if (!fs.existsSync(target) && legacyPath && fs.existsSync(legacyPath)) {
            fs.copyFileSync(legacyPath, target);
        }
    } catch (e) {}
    return target;
}

// 全局配置与运行状态
const state = {
    app: null,
    server: null,
    activeSockets: new Set(),
    currentConfig: { mode: 'full', pin: '', port: 3000, customDir: '', whitelistMode: false, whitelistIps: [], bindIp: '' },
    sharedDir: '',
    qrToken: '',
    validTokens: new Map(), // token -> 过期时间戳
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

const BLOCKED_IPS_FILE = resolveDataFile('blocked_ips.json', path.join(__dirname, '..', 'blocked_ips.json'));
const DEVICE_ALIASES_FILE = resolveDataFile('device_aliases.json', path.join(__dirname, '..', 'device_aliases.json'));

function generateQrToken() {
    state.qrToken = crypto.randomBytes(16).toString('hex');
    state.validTokens.set(state.qrToken, Date.now() + QR_TOKEN_TTL);
    // 超出上限时淘汰最早的 token
    while (state.validTokens.size > MAX_VALID_TOKENS) {
        const oldest = state.validTokens.keys().next().value;
        state.validTokens.delete(oldest);
    }
    return state.qrToken;
}

function isValidQrToken(token) {
    if (!token || typeof token !== 'string') return false;
    const expiresAt = state.validTokens.get(token);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        state.validTokens.delete(token);
        return false;
    }
    return true;
}

function cleanupExpiredTokens() {
    const now = Date.now();
    for (const [token, expiresAt] of state.validTokens) {
        if (expiresAt < now) state.validTokens.delete(token);
    }
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

function isSafePath(targetPath, forWrite) {
    if (!targetPath || typeof targetPath !== 'string') return false;
    // 拒绝 UNC 网络路径（防止横向访问内网其他主机的 SMB 共享）
    if (/^\\\\[^\\]/.test(targetPath) || targetPath.startsWith(path.sep + path.sep)) return false;

    const resolvedPath = path.resolve(targetPath);
    // 正斜杠写法（//host/share）会绕过上面的原始串检查，但 resolve 后仍是 UNC，必须在归一化后再拦一次
    if (process.platform === 'win32' && resolvedPath.startsWith('\\\\')) return false;
    if (state.currentConfig.mode === 'shared') {
        const resolvedShared = path.resolve(state.sharedDir);
        const a = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
        const b = process.platform === 'win32' ? resolvedShared.toLowerCase() : resolvedShared;
        return a === b || a.startsWith(b + path.sep);
    }
    if (process.platform === 'win32') {
        const lower = resolvedPath.toLowerCase();
        if (forWrite) {
            // 拒绝盘符根目录（如 C:\），防止误删整盘或把文件写到根
            if (/^[a-z]:\\?$/.test(lower)) return false;
            // 写操作额外屏蔽系统关键目录，防止覆盖启动项/系统文件
            const protectedPrefixes = [
                path.join(process.env.SystemRoot || 'C:\\Windows').toLowerCase(),
                'c:\\program files',
                'c:\\program files (x86)',
                'c:\\programdata\\microsoft\\windows\\start menu'
            ];
            const appData = process.env.APPDATA ? process.env.APPDATA.toLowerCase() : '';
            if (appData) {
                protectedPrefixes.push(path.join(appData, 'Microsoft\\Windows\\Start Menu').toLowerCase());
            }
            for (const prefix of protectedPrefixes) {
                if (lower === prefix || lower.startsWith(prefix + '\\')) return false;
            }
            return true;
        }
        const sys32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32').toLowerCase();
        if (lower.startsWith(sys32)) {
            return false;
        }
    }
    return true;
}

// 净化用户提供的文件名：剥离路径分隔符与 Windows 非法字符，防止路径遍历
function sanitizeFileName(name) {
    if (!name || typeof name !== 'string') return '';
    const base = path.basename(name).replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '-').trim();
    return base === '' || base === '.' || base === '..' ? '' : base;
}

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    let bestIp = '';
    let backupIp = '127.0.0.1';

    for (const name of Object.keys(interfaces)) {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('vethernet') || 
            lowerName.includes('vmware') || 
            lowerName.includes('virtual') || 
            lowerName.includes('wsl') || 
            lowerName.includes('bluetooth') || 
            lowerName.includes('loopback')) {
            continue;
        }

        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                const ip = iface.address;
                if (ip.startsWith('192.168.') && !ip.startsWith('192.168.137.') && !ip.startsWith('192.168.56.')) {
                    return ip;
                }
                if (ip.startsWith('10.') || (ip.startsWith('172.') && !ip.startsWith('172.17.') && !ip.startsWith('172.18.') && !ip.startsWith('172.20.'))) {
                    if (!bestIp) bestIp = ip;
                } else if (backupIp === '127.0.0.1') {
                    backupIp = ip;
                }
            }
        }
    }
    return bestIp || backupIp;
}

function shouldCompress(req, res) {
    if (req.headers['x-no-compression']) {
        return false;
    }
    // 音视频媒体流、下载与大文件严禁压缩，保证 Range 206 毫秒级直通与 0ms 拖拽
    if (req.path && (req.path.includes('/stream') || req.path.includes('/download') || req.path.includes('/media'))) {
        return false;
    }
    if (res && res.getHeader) {
        const ct = (res.getHeader('Content-Type') || '').toLowerCase();
        if (ct.startsWith('video/') || ct.startsWith('audio/') || ct === 'text/event-stream') {
            return false;
        }
    }
    // SSE 流不能压缩缓冲，否则实时消息会被 gzip 攒住不下发
    if (req.headers.accept === 'text/event-stream') {
        return false;
    }
    return true;
}

module.exports = {
    state,
    DATA_DIR,
    TRASH_DIR,
    generateQrToken,
    isValidQrToken,
    cleanupExpiredTokens,
    loadPersistedSecurityData,
    savePersistedSecurityData,
    broadcastMessage,
    getCleanIp,
    isSafePath,
    sanitizeFileName,
    getLocalIpAddress,
    shouldCompress
};
