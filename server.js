const express = require('express');
const compression = require('compression');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cors = require('cors');
const { execSync } = require('child_process');
const archiver = require('archiver');
const crypto = require('crypto');

let app = null;
let server = null;
let currentConfig = { mode: 'full', pin: '', port: 3000, customDir: '', whitelistMode: false, whitelistIps: [] };

// 全局网络流量统计
let networkStats = {
    rxBytes: 0,
    txBytes: 0,
    rxSpeed: 0, // B/s
    txSpeed: 0  // B/s
};
let lastStatsUpdate = Date.now();
let lastRxBytes = 0;
let lastTxBytes = 0;

// 简易聊天/文本传输内存存储
let chatMessages = [];
let sseClients = [];

function broadcastMessage(msg) {
    const data = `data: ${JSON.stringify({ type: 'new', message: msg })}\n\n`;
    sseClients.forEach(client => {
        try {
            client.res.write(data);
        } catch (e) {}
    });
}

// 记录已连接设备
let connectedDevices = {};

// 文件分享链接存储: { shareId: { path: 'C:\\...', expiresAt: 123456789 } }
let sharedLinks = {};

function isSafePath(targetPath, sharedDir) {
    if (currentConfig.mode !== 'shared') return true;
    if (!targetPath) return false;
    const resolvedPath = path.resolve(targetPath);
    const resolvedShared = path.resolve(sharedDir);
    return resolvedPath === resolvedShared || resolvedPath.startsWith(resolvedShared + path.sep);
}

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    let backupIp = '127.0.0.1';
    
    // 优先寻找以 192.168. 或 10. 或 172. 开头的真实局域网 IP，避开虚拟网卡
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                // 排除一些常见的虚拟网卡段 (例如 198.18.x.x 往往是代理软件)
                if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
                    // 如果是 192.168.137.x 可能是热点，如果有更常见的 192.168.1.x 或 .0.x 优先用
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

let statsInterval = null;

function startServer(config) {
    return new Promise((resolve, reject) => {
        if (server) {
            server.close();
        }
        currentConfig = Object.assign({}, currentConfig, config);
        
        const defaultSharedDir = path.join(os.homedir(), 'Downloads', 'LanDiskShared');
        const SHARED_DIR = currentConfig.customDir && fs.existsSync(currentConfig.customDir) 
            ? currentConfig.customDir 
            : defaultSharedDir;
            
        if (currentConfig.mode === 'shared' && !fs.existsSync(SHARED_DIR)) {
            try {
                fs.mkdirSync(SHARED_DIR, { recursive: true });
            } catch (err) {
                console.error("Failed to create SHARED_DIR", err);
            }
        }

        app = express();
        app.use(compression({ filter: shouldCompress })); // 开启 gzip 压缩
        app.use(cors());
        app.use(express.json({ limit: '50mb' }));
        app.use(express.urlencoded({ limit: '50mb', extended: true }));

        // 计算实时网速的定时器
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = setInterval(() => {
            const now = Date.now();
            const timeDiff = (now - lastStatsUpdate) / 1000;
            if (timeDiff > 0) {
                networkStats.rxSpeed = (networkStats.rxBytes - lastRxBytes) / timeDiff;
                networkStats.txSpeed = (networkStats.txBytes - lastTxBytes) / timeDiff;
            }
            lastRxBytes = networkStats.rxBytes;
            lastTxBytes = networkStats.txBytes;
            lastStatsUpdate = now;
        }, 1000);

        // 流量统计中间件
        app.use((req, res, next) => {
            // 记录接收到的数据量
            if (req.socket) {
                const rxTracker = () => {
                    networkStats.rxBytes += req.socket.bytesRead - (req.socket._lastRx || 0);
                    req.socket._lastRx = req.socket.bytesRead;
                };
                req.socket.on('data', rxTracker);
                
                // 记录发送的数据量
                const originalWrite = res.write;
                const originalEnd = res.end;
                
                res.write = function(chunk, encoding, callback) {
                    if (chunk) networkStats.txBytes += chunk.length;
                    originalWrite.call(res, chunk, encoding, callback);
                };
                
                res.end = function(chunk, encoding, callback) {
                    if (chunk && typeof chunk !== 'function') networkStats.txBytes += chunk.length;
                    originalEnd.call(res, chunk, encoding, callback);
                };
            }
            next();
        });

        // 决定哪些请求需要压缩 (排除视频流，因为视频已经是高压缩格式，再压缩反而消耗 CPU)
        function shouldCompress(req, res) {
            if (req.path.startsWith('/api/stream') || req.path.startsWith('/api/download') || req.path.startsWith('/api/chat/stream')) {
                return false;
            }
            return compression.filter(req, res);
        }

        app.use((req, res, next) => {
            const ip = req.ip || req.socket.remoteAddress;
            const userAgent = req.headers['user-agent'] || 'Unknown Device';
            if (ip) {
                connectedDevices[ip] = {
                    ip: ip.replace(/^.*:/, ''), // 简单的处理 IPv6 to IPv4
                    userAgent: userAgent,
                    lastSeen: Date.now()
                };
            }
            next();
        });

        // 获取在线设备列表
        app.get('/api/devices', (req, res) => {
            // 清理超过5分钟没活跃的设备
            const now = Date.now();
            for (const ip in connectedDevices) {
                if (now - connectedDevices[ip].lastSeen > 5 * 60 * 1000) {
                    delete connectedDevices[ip];
                }
            }
            res.json({
                devices: Object.values(connectedDevices),
                stats: networkStats
            });
        });

        // 身份验证中间件
        function checkAuth(req, res, next) {
            // Disable caching for the main HTML to ensure updates propagate
            if (req.path === '/' || req.path === '/index.html') {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }

            // 白名单检查
            if (currentConfig.whitelistMode) {
                const clientIp = req.ip || req.socket.remoteAddress;
                const cleanIp = clientIp ? clientIp.replace(/^.*:/, '') : '';
                // 允许本地回环地址
                if (cleanIp !== '127.0.0.1' && cleanIp !== '::1' && !currentConfig.whitelistIps.includes(cleanIp)) {
                    return res.status(403).json({ error: 'Access Denied: IP not in whitelist' });
                }
            }

            if (req.path === '/' || req.path.startsWith('/index.html') || req.path.startsWith('/favicon.ico') || req.path.startsWith('/api/shared/download/')) {
                return next();
            }
            if (!currentConfig.pin) {
                return next(); // 免密模式
            }
            
            const pin = req.headers['x-pin'] || req.query.pin;
            if (pin === currentConfig.pin) {
                next();
            } else {
                res.status(401).json({ error: 'Unauthorized', requireAuth: true });
            }
        }

        const isPackaged = __dirname.includes('app.asar');
        const publicDir = isPackaged 
            ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'public') 
            : path.join(__dirname, 'public');
            
        app.use(express.static(publicDir));
        app.use('/api', checkAuth);

        // 敏感操作保护中间件：当未设置 PIN 时，仅允许本机(localhost)访问终端、进程管理、剪贴板等高危 API
        function checkSensitive(req, res, next) {
            if (currentConfig.pin) {
                // 已设置 PIN，鉴权由 checkAuth 保证，放行
                return next();
            }
            // 免密模式下，检查来源是否为本机
            const clientIp = (req.ip || req.socket.remoteAddress || '').replace(/^.*:/, '');
            if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '1') {
                return next();
            }
            return res.status(403).json({ error: '安全限制：免密模式下，该操作仅允许从本机发起。请设置访问密码后再从远程使用。' });
        }

        app.use('/api/terminal', checkSensitive);
        app.use('/api/processes', checkSensitive);
        app.use('/api/kill-process', checkSensitive);
        app.use('/api/clipboard', checkSensitive);
        app.use('/api/tools/kick-devices', checkSensitive);

        // 设置 Multer 文件上传
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                let targetPath = req.headers['x-upload-dir'] ? decodeURIComponent(req.headers['x-upload-dir']) : SHARED_DIR;
                if (currentConfig.mode === 'shared') {
                    // 强制在共享目录下
                    if (!isSafePath(targetPath, SHARED_DIR)) {
                        targetPath = SHARED_DIR;
                    }
                }
                if (!fs.existsSync(targetPath)) {
                    try {
                        fs.mkdirSync(targetPath, { recursive: true });
                    } catch (err) {
                        return cb(new Error('权限不足，无法在当前目录创建文件夹或写入文件'));
                    }
                }
                cb(null, targetPath);
            },
            filename: (req, file, cb) => {
                let fileName = file.originalname;
                if (req.headers['x-file-name']) {
                    try {
                        fileName = decodeURIComponent(req.headers['x-file-name']);
                    } catch(e) {}
                } else {
                    try {
                        // Multer 2.x 以后有些环境还是可能需要这层转换，但加了 try-catch 防止崩溃
                        fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
                    } catch(e) {}
                }
                
                // 清理可能导致 Windows 报错的非法字符
                fileName = fileName.replace(/[/\\?%*:|"<>]/g, '-');
                cb(null, fileName);
            }
        });
        const upload = multer({ storage });

        app.post('/api/verify', (req, res) => {
            res.json({ success: true, mode: currentConfig.mode });
        });

        // -------------------------
        // 高级工具箱 API
        // -------------------------
        // 清理所有过期的分享链接
        app.post('/api/tools/clean-links', (req, res) => {
            let cleaned = 0;
            const now = Date.now();
            Object.keys(sharedLinks).forEach(id => {
                if (sharedLinks[id].expiresAt < now) {
                    delete sharedLinks[id];
                    cleaned++;
                }
            });
            res.json({ success: true, cleaned });
        });

        // 强制断开所有已连接设备
        app.post('/api/tools/kick-devices', (req, res) => {
            const count = Object.keys(connectedDevices).length;
            connectedDevices = {};
            sseClients.forEach(client => {
                try { client.res.end(); } catch (e) {}
            });
            sseClients = [];
            res.json({ success: true, kicked: count });
        });

        // -------------------------
        // 分享链接相关 API
        // -------------------------
        app.post('/api/share', (req, res) => {
            const { path: targetPath, expireHours = 1 } = req.body;
            if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).json({ error: 'File not found' });
            if (!isSafePath(targetPath, SHARED_DIR)) return res.status(403).json({ error: 'Forbidden' });

            // 生成随机 Share ID
            const shareId = crypto.randomBytes(8).toString('hex');
            const expiresAt = Date.now() + (expireHours * 60 * 60 * 1000);
            
            sharedLinks[shareId] = {
                path: targetPath,
                expiresAt: expiresAt
            };

            // 自动清理过期链接
            Object.keys(sharedLinks).forEach(id => {
                if (sharedLinks[id].expiresAt < Date.now()) delete sharedLinks[id];
            });

            res.json({ shareId, expiresAt });
        });

        // 公开的分享下载接口 (无鉴权，靠 shareId 保护)
        app.get('/api/shared/download/:shareId', (req, res) => {
            const shareId = req.params.shareId;
            const shareInfo = sharedLinks[shareId];
            
            if (!shareInfo) return res.status(404).send('链接不存在或已失效');
            if (Date.now() > shareInfo.expiresAt) {
                delete sharedLinks[shareId];
                return res.status(403).send('分享链接已过期');
            }
            if (!fs.existsSync(shareInfo.path)) return res.status(404).send('文件已被删除');

            res.download(shareInfo.path);
        });

        // 执行终端命令
        app.post('/api/terminal', (req, res) => {
            const { command, cwd } = req.body;
            if (!command) return res.status(400).json({ error: 'Command required' });
            // 安全限制：如果处于仅分享模式，禁止执行命令
            if (currentConfig.mode === 'shared') {
                return res.status(403).json({ error: 'Terminal disabled in shared mode' });
            }

            const { exec } = require('child_process');
            exec(command, { 
                cwd: cwd || 'C:\\', 
                encoding: 'utf8',
                timeout: 10000 // 限制10秒超时
            }, (error, stdout, stderr) => {
                if (error) {
                    res.json({ output: stdout || '', error: stderr || error.message });
                } else {
                    res.json({ output: stdout });
                }
            });
        });
        app.get('/api/sysinfo', (req, res) => {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            
            res.json({
                hostname: os.hostname(),
                platform: os.platform(),
                arch: os.arch(),
                uptime: os.uptime(),
                memory: {
                    total: totalMem,
                    free: freeMem,
                    used: usedMem,
                    usagePercent: Math.round((usedMem / totalMem) * 100)
                },
                cpus: os.cpus().map(cpu => cpu.model)[0] || 'Unknown',
                cores: os.cpus().length
            });
        });

        // 常见进程名称的中英文对照字典
        const processNameMap = {
            'chrome': '谷歌浏览器', 'msedge': 'Edge浏览器', 'firefox': '火狐浏览器',
            'explorer': '资源管理器', 'Taskmgr': '任务管理器', 'Code': 'VS Code',
            'Trae': 'Trae 编辑器', 'svchost': '系统服务', 'System': '系统进程',
            'Registry': '系统注册表', 'cmd': '命令提示符', 'powershell': 'PowerShell',
            'conhost': '控制台主机', 'SearchHost': 'Windows搜索', 'StartMenuExperienceHost': '开始菜单',
            'TextInputHost': '输入法宿主', 'dwm': '桌面窗口管理器', 'winlogon': 'Windows登录程序',
            'fontdrvhost': '字体驱动', 'csrss': '客户端服务器运行时', 'lsass': '本地安全机构',
            'services': '服务控制器', 'smss': '会话管理器', 'spoolsv': '打印后台处理服务',
            'sihost': '系统基础结构主机', 'RuntimeBroker': '运行代理', 'ctfmon': 'CTF加载程序',
            'Memory Compression': '内存压缩', 'ApplicationFrameHost': '应用框架宿主',
            'dllhost': 'COM Surrogate', 'WeChat': '微信', 'QQ': 'QQ', 'WXWork': '企业微信',
            'DingTalk': '钉钉', 'wps': 'WPS Office', 'wpp': 'WPS 演示', 'et': 'WPS 表格',
            'wpscloudsvr': 'WPS 云服务', 'vmms': '虚拟机管理', 'SearchIndexer': '搜索索引器',
            'audiodg': '音频设备图形隔离', 'SecurityHealthService': '安全中心服务',
            'notepad': '记事本', 'mspaint': '画图', 'calc': '计算器', 'iexplore': 'IE浏览器'
        };

        // 进程管理 API
        app.get('/api/processes', (req, res) => {
            if (currentConfig.mode === 'shared') return res.status(403).json({ error: 'Forbidden' });
            const { exec } = require('child_process');
            
            if (process.platform === 'win32') {
                exec('powershell -NoProfile -Command "Get-Process | Select-Object Id, ProcessName, Description, MainWindowTitle, @{Name=\'WorkingSetSize\';Expression={$_.WS}} | ConvertTo-Json -Compress"', { maxBuffer: 1024 * 1024 * 5 }, (error, stdout) => {
                    if (error) return res.status(500).json({ error: 'Failed to fetch processes' });
                    try {
                        const list = JSON.parse(stdout);
                        const processes = (Array.isArray(list) ? list : [list]).map(p => {
                            let zhName = processNameMap[p.ProcessName];
                            let displayName = zhName ? `${zhName} (${p.ProcessName})` : p.ProcessName;
                            let desc = p.Description || '';
                            
                            if (p.MainWindowTitle && p.MainWindowTitle.trim()) {
                                desc = desc ? `${desc} | 窗口: ${p.MainWindowTitle}` : `窗口: ${p.MainWindowTitle}`;
                            }
                            
                            return {
                                pid: p.Id,
                                name: displayName,
                                desc: desc || p.ProcessName,
                                mem: p.WorkingSetSize || 0
                            };
                        });
                        res.json(processes);
                    } catch (e) {
                        res.status(500).json({ error: 'Failed to parse processes' });
                    }
                });
            } else {
                exec('ps -ax -o pid,rss,comm', (error, stdout) => {
                    if (error) return res.status(500).json({ error: 'Failed to fetch processes' });
                    try {
                        const lines = stdout.split('\n').slice(1);
                        const processes = lines.filter(l => l.trim()).map(l => {
                            const parts = l.trim().split(/\s+/);
                            return { pid: parts[0], mem: parseInt(parts[1]) * 1024, name: parts.slice(2).join(' '), desc: parts.slice(2).join(' ') };
                        });
                        res.json(processes);
                    } catch (e) {
                        res.status(500).json({ error: 'Failed to parse processes' });
                    }
                });
            }
        });

        app.post('/api/kill-process', (req, res) => {
            if (currentConfig.mode === 'shared') return res.status(403).json({ error: 'Forbidden' });
            const { pid } = req.body;
            if (!pid) return res.status(400).json({ error: 'PID required' });
            // 严格校验 PID 必须为正整数，防止命令注入
            const safePid = parseInt(pid, 10);
            if (isNaN(safePid) || safePid <= 0 || String(safePid) !== String(pid)) {
                return res.status(400).json({ error: 'Invalid PID format' });
            }
            try {
                process.kill(safePid, 'SIGKILL');
                res.json({ success: true });
            } catch (e) {
                try {
                    if (process.platform === 'win32') {
                        execSync(`taskkill /F /PID ${safePid}`);
                        res.json({ success: true });
                    } else {
                        execSync(`kill -9 ${safePid}`);
                        res.json({ success: true });
                    }
                } catch(err) {
                    res.status(500).json({ error: 'Failed to kill process' });
                }
            }
        });

        // 剪贴板同步 (Node.js 层面跨平台读写剪贴板)
        app.get('/api/clipboard', (req, res) => {
            try {
                let text = '';
                try {
                    // 优先使用 Electron 原生剪贴板 API，100% 解决各种奇怪的乱码问题
                    const { clipboard } = require('electron');
                    text = clipboard.readText() || '';
                } catch (electronErr) {
                    // 退级方案 (非 Electron 环境)
                    if (process.platform === 'win32') {
                        const tmpFile = path.join(os.tmpdir(), `clipboard_${Date.now()}.txt`);
                        try {
                            execSync(`powershell -NoProfile -Command "Get-Clipboard -Raw | Out-File -FilePath '${tmpFile}' -Encoding utf8"`);
                            if (fs.existsSync(tmpFile)) {
                                text = fs.readFileSync(tmpFile, 'utf8').replace(/^\uFEFF/, '').trim();
                                fs.unlinkSync(tmpFile);
                            }
                        } catch (err) {
                            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
                        }
                    } else if (process.platform === 'darwin') {
                        text = execSync('pbpaste').toString().trim();
                    }
                }
                res.json({ text });
            } catch (e) {
                res.json({ text: '' });
            }
        });

        app.post('/api/clipboard', (req, res) => {
            const { text } = req.body;
            if (typeof text !== 'string') return res.status(400).json({ error: 'Text required' });
            
            try {
                try {
                    // 优先使用 Electron 原生剪贴板 API
                    const { clipboard } = require('electron');
                    clipboard.writeText(text);
                    return res.json({ success: true });
                } catch (electronErr) {
                    // 退级方案
                    if (process.platform === 'win32') {
                        if (!text) {
                            execSync(`powershell -NoProfile -Command "Set-Clipboard -Value $null"`);
                        } else {
                            const tmpFile = path.join(os.tmpdir(), `clipboard_set_${Date.now()}.txt`);
                            fs.writeFileSync(tmpFile, text, 'utf8');
                            try {
                                execSync(`powershell -NoProfile -Command "Get-Content -Path '${tmpFile}' -Encoding utf8 | Set-Clipboard"`);
                            } finally {
                                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
                            }
                        }
                    } else if (process.platform === 'darwin') {
                        execSync(`pbcopy`, { input: text });
                    }
                    res.json({ success: true });
                }
            } catch (e) {
                res.status(500).json({ error: 'Failed to set clipboard' });
            }
        });

        // 获取驱动器列表
        app.get('/api/drives', (req, res) => {
            if (currentConfig.mode === 'shared') {
                return res.json([{ path: SHARED_DIR, name: '共享文件夹 (互传目录)', free: 0, total: 0 }]);
            }
            const { exec } = require('child_process');
            exec('powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, FreeSpace, Size | ConvertTo-Json -Compress"', (error, stdout) => {
                try {
                    if (error) throw error;
                    let disks = JSON.parse(stdout);
                    if (!Array.isArray(disks)) disks = [disks];
                    
                    const drives = disks.filter(d => d.DeviceID).map(d => ({
                        path: d.DeviceID + '\\',
                        name: `本地磁盘 (${d.DeviceID})`,
                        free: parseInt(d.FreeSpace) || 0,
                        total: parseInt(d.Size) || 0
                    }));
                    res.json(drives);
                } catch (e) {
                    // 回退方案
                    res.json([{ path: 'C:\\', name: '本地磁盘 (C:)', free: 0, total: 0 }]);
                }
            });
        });

        // 获取文件列表
        app.get('/api/files', (req, res) => {
            let targetPath = req.query.path || (currentConfig.mode === 'shared' ? SHARED_DIR : 'C:\\');

            if (!isSafePath(targetPath, SHARED_DIR)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            if (!fs.existsSync(targetPath)) {
                return res.status(404).json({ error: 'Path not found' });
            }

            try {
                const stats = fs.statSync(targetPath);
                if (!stats.isDirectory()) {
                    return res.status(400).json({ error: 'Not a directory' });
                }

                const files = fs.readdirSync(targetPath);
                const fileList = [];
                for (const file of files) {
                    try {
                        const filePath = path.join(targetPath, file);
                        const fileStats = fs.statSync(filePath);
                        fileList.push({
                            name: file,
                            path: filePath,
                            size: fileStats.size,
                            isDirectory: fileStats.isDirectory(),
                            mtime: fileStats.mtime
                        });
                    } catch (e) {}
                }
                
                fileList.sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                });
                
                res.json({ 
                    currentPath: targetPath, 
                    files: fileList, 
                    rootPath: currentConfig.mode === 'shared' ? SHARED_DIR : null 
                });
            } catch (err) {
                res.status(500).json({ error: 'Failed to read directory' });
            }
        });

        // 下载文件
        app.get('/api/download', (req, res) => {
            const targetPath = req.query.path;
            if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).send('Not found');
            if (!isSafePath(targetPath, SHARED_DIR)) return res.status(403).send('Forbidden');
            
            res.download(targetPath);
        });

        // 批量打包下载
        app.post('/api/download/batch', (req, res) => {
            let { files, folderName } = req.body;
            if (!files) return res.status(400).json({ error: 'No files specified' });
            if (!Array.isArray(files)) files = [files];
            if (files.length === 0) {
                return res.status(400).json({ error: 'No files specified' });
            }

            const archive = archiver('zip', { zlib: { level: 1 } }); // 1 级压缩，追求速度
            res.attachment(`${folderName || 'batch_download'}.zip`);
            
            archive.on('error', (err) => {
                res.status(500).send({ error: err.message });
            });

            archive.pipe(res);

            for (const file of files) {
                if (!isSafePath(file, SHARED_DIR)) continue;
                if (fs.existsSync(file)) {
                    const stats = fs.statSync(file);
                    const name = path.basename(file);
                    if (stats.isDirectory()) {
                        archive.directory(file, name);
                    } else {
                        archive.file(file, { name: name });
                    }
                }
            }

            archive.finalize();
        });

        // 视频流式播放支持 (终极 sendfile 零拷贝优化版)
        app.get('/api/stream', (req, res) => {
            const targetPath = req.query.path;
            if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).send('Not found');
            if (!isSafePath(targetPath, SHARED_DIR)) return res.status(403).send('Forbidden');

            // 禁用缓存协商，强制重新获取
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            // 使用 Express 自带的 sendFile 方法，
            // 它的底层会自动调用操作系统的 sendfile() 系统调用 (真正的内核级零拷贝)，
            // 速度远超任何手动 fs.read() 或 stream.pipe()。
            // 它会自动处理 Range 请求、MIME 类型推断和 Socket 缓冲区背压(Backpressure)。
            res.sendFile(path.resolve(targetPath), {
                dotfiles: 'allow',
                acceptRanges: true,
                cacheControl: false,
                lastModified: false,
                etag: false
            }, (err) => {
                if (err) {
                    // 客户端主动断开连接引起的错误是正常的，不需要打印堆栈
                    if (err.code !== 'ECONNABORTED' && err.code !== 'EPIPE') {
                        console.error('sendFile error:', err.message);
                    }
                    if (!res.headersSent) {
                        res.status(500).end();
                    }
                }
            });
        });

        // 聊天/文本互传 API
        app.get('/api/chat', (req, res) => {
            res.json(chatMessages);
        });

        // SSE 实时流
        app.get('/api/chat/stream', (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const clientId = Date.now() + Math.random().toString();
            sseClients.push({ id: clientId, res });

            // 初始加载所有消息
            res.write(`data: ${JSON.stringify({ type: 'init', messages: chatMessages })}\n\n`);

            req.on('close', () => {
                sseClients = sseClients.filter(c => c.id !== clientId);
            });
        });

        app.post('/api/chat', (req, res) => {
            let { text, sender, type, action } = req.body; // type can be 'text' or 'image' or 'audio'
            
            if (action === 'clear') {
                chatMessages = [];
                broadcastMessage({ id: 'clear', type: 'clear', text: '聊天记录已清空', sender: 'system', time: new Date().toISOString() });
                return res.json({ success: true });
            }

            if (!text) return res.status(400).json({ error: 'Text/Data is required' });
            
            // XSS 防护与数据验证
            type = type || 'text';
            if (type === 'text') {
                // 转义 HTML 特殊字符
                text = String(text)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            } else if (type === 'image') {
                if (!String(text).startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image data' });
            } else if (type === 'audio') {
                if (!String(text).startsWith('data:audio/')) return res.status(400).json({ error: 'Invalid audio data' });
            }
            
            const clientIp = req.ip || req.socket.remoteAddress;
            const cleanIp = clientIp ? clientIp.replace(/^.*:/, '') : 'Unknown';

            const msg = {
                id: Date.now().toString(),
                type: type || 'text',
                text: text,
                sender: sender || 'Unknown',
                senderIp: cleanIp,
                time: new Date().toISOString()
            };
            
            chatMessages.push(msg);
            // 仅保留最近的 50 条消息
            if (chatMessages.length > 50) chatMessages.shift();
            
            // 广播给所有客户端
            broadcastMessage(msg);

            res.json({ success: true, message: msg });
        });

        // 纯二进制流上传 (绕过 multer 的所有兼容性问题)
        app.post('/api/upload/raw', (req, res) => {
            try {
                let targetPath = req.headers['x-upload-dir'] ? decodeURIComponent(req.headers['x-upload-dir']) : SHARED_DIR;
                let fileName = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : `upload_${Date.now()}`;
                
                // 清理非法字符
                fileName = fileName.replace(/[/\\?%*:|"<>]/g, '-');
                
                if (!isSafePath(targetPath, SHARED_DIR)) {
                    return res.status(403).json({ error: 'Forbidden' });
                }

                if (!fs.existsSync(targetPath)) {
                    fs.mkdirSync(targetPath, { recursive: true });
                }

                const fullPath = path.join(targetPath, fileName);
                const writeStream = fs.createWriteStream(fullPath);

                req.pipe(writeStream);

                req.on('end', () => {
                    res.json({ message: 'File uploaded successfully', filename: fileName });
                });

                req.on('error', (err) => {
                    writeStream.close();
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                    if (!res.headersSent) {
                        res.status(500).json({ error: err.message });
                    }
                });
                
                writeStream.on('error', (err) => {
                    if (!res.headersSent) {
                        res.status(500).json({ error: '写入文件失败: ' + err.message });
                    }
                });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // 传统上传文件
        app.post('/api/upload', (req, res) => {
            upload.single('file')(req, res, function (err) {
                if (err) {
                    console.error("Upload error:", err);
                    return res.status(500).json({ error: err.message || '上传失败，可能是权限不足或磁盘已满' });
                }
                if (!req.file) {
                    return res.status(400).json({ error: '没有接收到文件' });
                }
                res.json({ message: 'File uploaded successfully', filename: req.file.filename });
            });
        });

        // 保存文本文件
        app.post('/api/save-text', (req, res) => {
            const { path: targetPath, content } = req.body;
            if (!targetPath || content === undefined) return res.status(400).json({ error: 'Path and content required' });
            if (!isSafePath(targetPath, SHARED_DIR)) return res.status(403).json({ error: 'Forbidden' });

            try {
                fs.writeFileSync(targetPath, content, 'utf8');
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: 'Failed to save file' });
            }
        });

        // 接收 Base64 画板图片上传
        app.post('/api/upload/base64', (req, res) => {
            const { image, filename, path: targetPath } = req.body;
            if (!image || !filename || !targetPath) return res.status(400).json({ error: 'Missing data' });
            if (!isSafePath(targetPath, SHARED_DIR)) return res.status(403).json({ error: 'Forbidden' });

            try {
                const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
                const dataBuffer = Buffer.from(base64Data, 'base64');
                const fullPath = path.join(targetPath, filename);
                fs.writeFileSync(fullPath, dataBuffer);
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ error: 'Failed to save image' });
            }
        });

        // 新建文件夹
        app.post('/api/mkdir', (req, res) => {
            let targetPath = req.query.path;
            if (!targetPath) return res.status(400).json({ error: 'Path required' });
            
            if (!isSafePath(targetPath, SHARED_DIR)) return res.status(403).json({ error: 'Forbidden' });
            
            try {
                if (!fs.existsSync(targetPath)) {
                    fs.mkdirSync(targetPath, { recursive: true });
                    res.json({ success: true });
                } else {
                    res.status(400).json({ error: 'Directory already exists' });
                }
            } catch (err) {
                console.error("mkdir error:", err);
                if (err.code === 'EPERM' || err.code === 'EACCES') {
                    res.status(500).json({ error: '权限不足，无法在当前目录(如C盘根目录)创建文件夹' });
                } else {
                    res.status(500).json({ error: '新建失败: ' + err.message });
                }
            }
        });

        // 重命名文件/文件夹
        app.post('/api/rename', (req, res) => {
            const { oldPath, newPath } = req.body;
            if (!oldPath || !newPath) return res.status(400).json({ error: 'Paths required' });
            if (!isSafePath(oldPath, SHARED_DIR) || !isSafePath(newPath, SHARED_DIR)) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            
            try {
                if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Original file not found' });
                if (fs.existsSync(newPath)) return res.status(400).json({ error: 'Target name already exists' });
                fs.renameSync(oldPath, newPath);
                res.json({ success: true });
            } catch (err) {
                console.error('Rename error:', err);
                res.status(500).json({ error: 'Failed to rename: ' + err.message });
            }
        });

        // 移动文件 (剪切/粘贴)
        app.post('/api/move', (req, res) => {
            const { source, destination } = req.body;
            if (!source || !destination) return res.status(400).json({ error: 'Paths required' });
            if (!isSafePath(source, SHARED_DIR) || !isSafePath(destination, SHARED_DIR)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            try {
                if (!fs.existsSync(source)) return res.status(404).json({ error: 'Source not found' });
                if (fs.existsSync(destination)) return res.status(400).json({ error: 'Destination already exists' });
                fs.renameSync(source, destination);
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: 'Failed to move: ' + err.message });
            }
        });

        // 复制文件
        app.post('/api/copy', (req, res) => {
            const { source, destination } = req.body;
            if (!source || !destination) return res.status(400).json({ error: 'Paths required' });
            if (!isSafePath(source, SHARED_DIR) || !isSafePath(destination, SHARED_DIR)) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            try {
                if (!fs.existsSync(source)) return res.status(404).json({ error: 'Source not found' });
                if (fs.existsSync(destination)) return res.status(400).json({ error: 'Destination already exists' });
                fs.copyFileSync(source, destination);
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: 'Failed to copy: ' + err.message });
            }
        });

        // 删除文件
        app.delete('/api/files', (req, res) => {
            const targetPath = req.query.path;
            if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).send('Not found');
            if (!isSafePath(targetPath, SHARED_DIR)) return res.status(403).send('Forbidden');

            try {
                const stats = fs.statSync(targetPath);
                if (stats.isDirectory()) {
                    fs.rmSync(targetPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(targetPath);
                }
                res.json({ message: 'Deleted successfully' });
            } catch (err) {
                res.status(500).json({ error: 'Failed to delete' });
            }
        });

        const port = parseInt(currentConfig.port) || 3000;
        server = app.listen(port, '0.0.0.0', () => {
            resolve({ ip: getLocalIpAddress(), port: port });
        });
        
        server.on('error', (err) => {
            reject(err);
        });
    });
}

function stopServer() {
    if (server) {
        server.close();
        server = null;
    }
    if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
    }
    // 关闭所有活动的 SSE 客户端，确保进程能正常退出
    sseClients.forEach(client => {
        try { client.res.end(); } catch (e) {}
    });
    sseClients = [];
}

module.exports = { startServer, stopServer };
