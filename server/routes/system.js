const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const { state, isSafePath } = require('../config');

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

let lastCpuTimesServer = null;
function getCpuUsageServer() {
    try {
        const cpus = os.cpus();
        if (!cpus || !cpus.length) return 0;
        let idle = 0, total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) total += cpu.times[type];
            idle += cpu.times.idle;
        }
        if (!lastCpuTimesServer) { lastCpuTimesServer = { idle, total }; return 0; }
        const idleDiff = idle - lastCpuTimesServer.idle;
        const totalDiff = total - lastCpuTimesServer.total;
        lastCpuTimesServer = { idle, total };
        const usage = totalDiff > 0 ? Math.round(100 * (1 - idleDiff / totalDiff)) : 0;
        return Math.min(100, Math.max(0, usage));
    } catch(e) { return 0; }
}

// 获取系统动态性能指标 API
// 磁盘查询优先走 fs.statfsSync（微秒级系统调用）；
// Node 版本过旧无 statfs 时才降级 PowerShell，且改为异步 + 5 秒缓存，避免阻塞事件循环。
let diskSpaceCache = { value: '', at: 0 };
let diskSpacePending = null;

function queryDiskSpaceFast() {
    try {
        if (fs.statfsSync) {
            const st = fs.statfsSync(process.platform === 'win32' ? 'C:\\' : '/');
            const free = (st.bsize * st.bfree / 1024 / 1024 / 1024).toFixed(1);
            const total = (st.bsize * st.blocks / 1024 / 1024 / 1024).toFixed(1);
            return `${free} GB 可用 / 共 ${total} GB`;
        }
    } catch (e) {}
    return null;
}

function queryDiskSpaceAsync() {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') return resolve('未知');
        const { exec } = require('child_process');
        exec('powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter \'DeviceID=\'\'C:\'\'\' | Select-Object Size, FreeSpace"',
            { timeout: 3000 }, (err, stdout) => {
                try {
                    const m = String(stdout || '').match(/(\d+)\s+(\d+)/);
                    if (m) {
                        const total = (parseInt(m[1], 10) / 1024 / 1024 / 1024).toFixed(1);
                        const free = (parseInt(m[2], 10) / 1024 / 1024 / 1024).toFixed(1);
                        return resolve(`${free} GB 可用 / 共 ${total} GB`);
                    }
                } catch (e) {}
                resolve('未知');
            });
    });
}

async function getDiskSpace() {
    const fast = queryDiskSpaceFast();
    if (fast) {
        diskSpaceCache = { value: fast, at: Date.now() };
        return fast;
    }
    if (Date.now() - diskSpaceCache.at < 5000) return diskSpaceCache.value;
    if (!diskSpacePending) {
        diskSpacePending = queryDiskSpaceAsync().then(v => {
            diskSpaceCache = { value: v, at: Date.now() };
            diskSpacePending = null;
            return v;
        });
    }
    return diskSpacePending;
}

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const APP_VERSION = '2.3.6';
function getAppVersion() {
    try {
        const pkgPath = path.join(ROOT_DIR, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.version) return pkg.version;
        }
    } catch (e) {}
    try {
        const verPath = path.join(ROOT_DIR, 'version.json');
        if (fs.existsSync(verPath)) {
            const ver = JSON.parse(fs.readFileSync(verPath, 'utf8'));
            if (ver.version) return ver.version;
        }
    } catch (e) {}
    return APP_VERSION;
}

// 局域网服务发现与心跳轻量探针 (无需登录鉴权)
router.get('/ping', (req, res) => {
    const osType = os.type();
    const osName = osType === 'Windows_NT' ? 'Windows' : (osType === 'Darwin' ? 'macOS' : (osType === 'Linux' ? 'Linux' : osType));
    res.json({
        app: '猫步互联 Pro',
        version: getAppVersion(),
        hostname: os.hostname(),
        os: osName,
        requiresPin: !!state.currentConfig.pin,
        mode: state.currentConfig.mode || 'full'
    });
});

router.get('/sys-info', async (req, res) => {
    const diskSpace = await getDiskSpace();

    res.json({
        cpu: (os.cpus() && os.cpus()[0]) ? os.cpus()[0].model : 'Central Processor',
        cpuUsage: getCpuUsageServer(),
        memTotal: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
        memFree: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
        uptime: os.uptime(),
        platform: os.platform(),
        diskSpace: diskSpace
    });
});


router.get('/sysinfo', (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    res.json({
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptime: os.uptime(),
        homeDir: os.homedir(),
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

router.get('/network-info', (req, res) => {
    const interfaces = os.networkInterfaces();
    const result = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                result.push({ name, ip: iface.address });
            }
        }
    }
    res.json(result);
});

// 进程列表缓存（2.5 秒 TTL + 并发去重）：双端每 3 秒轮询，避免狂开 PowerShell 子进程
const PROCESS_CACHE_TTL = 2500;
let processCache = { value: null, at: 0 };
let processPending = null;

function fetchProcessList() {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            const psCmd = 'powershell -NoProfile -Command "Get-Process -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Description, MainWindowTitle, WorkingSet64 | ConvertTo-Json -Compress"';
            exec(psCmd, { maxBuffer: 1024 * 1024 * 10, timeout: 5000 }, (error, stdout) => {
                if (!error && stdout && stdout.trim()) {
                    try {
                        const list = JSON.parse(stdout);
                        const processes = (Array.isArray(list) ? list : [list])
                            .filter(p => p && p.ProcessName && p.ProcessName.trim() && p.ProcessName.toLowerCase() !== 'idle' && p.ProcessName !== 'System Idle Process')
                            .map(p => {
                                const procName = p.ProcessName.trim();
                                let zhName = processNameMap[procName];
                                let displayName = zhName ? `${zhName} (${procName})` : procName;
                                let desc = p.Description || '';
                                if (p.MainWindowTitle && p.MainWindowTitle.trim()) {
                                    desc = desc ? `${desc} | 窗口: ${p.MainWindowTitle}` : `窗口: ${p.MainWindowTitle}`;
                                }
                                return {
                                    pid: p.Id,
                                    name: displayName,
                                    desc: desc || procName,
                                    mem: p.WorkingSet64 || 0
                                };
                            })
                            .filter(p => p.name && p.mem > 1024 * 512);
                        return resolve(processes);
                    } catch (e) {}
                }

                exec('tasklist /fo csv /nh', { maxBuffer: 1024 * 1024 * 5, timeout: 5000 }, (tErr, tStdout) => {
                    if (tErr || !tStdout) return resolve([]);
                    try {
                        const lines = tStdout.split('\r\n').filter(l => l.trim());
                        const processes = lines.map(line => {
                            const cols = line.split('","').map(c => c.replace(/"/g, ''));
                            if (cols.length >= 5) {
                                const name = cols[0];
                                const pid = parseInt(cols[1]);
                                const memStr = cols[4].replace(/[^0-9]/g, '');
                                const mem = (parseInt(memStr) || 0) * 1024;
                                let zhName = processNameMap[name.replace(/\.exe$/i, '')];
                                return {
                                    pid: pid,
                                    name: zhName ? `${zhName} (${name})` : name,
                                    desc: name,
                                    mem: mem
                                };
                            }
                            return null;
                        }).filter(Boolean);
                        resolve(processes);
                    } catch (e) {
                        resolve([]);
                    }
                });
            });
        } else {
            exec('ps -ax -o pid,rss,comm', (error, stdout) => {
                if (error || !stdout) return resolve([]);
                try {
                    const lines = stdout.split('\n').slice(1);
                    const processes = lines.filter(l => l.trim()).map(l => {
                        const parts = l.trim().split(/\s+/);
                        return { pid: parseInt(parts[0]), mem: (parseInt(parts[1]) || 0) * 1024, name: parts.slice(2).join(' '), desc: parts.slice(2).join(' ') };
                    });
                    resolve(processes);
                } catch (e) {
                    resolve([]);
                }
            });
        }
    });
}

// 进程管理 API
router.get('/processes', (req, res) => {
    if (state.currentConfig.mode === 'shared') return res.json([]);

    if (processCache.value && Date.now() - processCache.at < PROCESS_CACHE_TTL) {
        return res.json(processCache.value);
    }
    if (!processPending) {
        processPending = fetchProcessList().then(list => {
            processCache = { value: list, at: Date.now() };
            processPending = null;
            return list;
        }).catch(() => {
            processPending = null;
            return [];
        });
    }
    processPending.then(list => res.json(list)).catch(() => res.json([]));
});

router.post('/kill-process', (req, res) => {
    if (state.currentConfig.mode === 'shared') return res.status(403).json({ error: 'Forbidden' });
    const { pid } = req.body;
    if (!pid) return res.status(400).json({ error: 'PID required' });
    const safePid = parseInt(pid, 10);
    if (isNaN(safePid) || safePid <= 0 || String(safePid) !== String(pid)) {
        return res.status(400).json({ error: 'Invalid PID format' });
    }
    // 保护本服务进程与父进程（Electron 主进程），避免远程误杀导致服务崩溃
    if (safePid === process.pid || safePid === process.ppid) {
        return res.status(403).json({ error: '无法结束本服务自身的进程' });
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

// 执行终端命令
router.post('/terminal', (req, res) => {
    const { command, cwd } = req.body;
    if (!command) return res.status(400).json({ error: 'Command required' });
    if (state.currentConfig.mode === 'shared') {
        return res.status(403).json({ error: 'Terminal disabled in shared mode' });
    }

    const cmdToRun = process.platform === 'win32' ? `chcp 65001 >nul && ${command}` : command;

    exec(cmdToRun, {
        cwd: cwd || (process.platform === 'win32' ? 'C:\\' : os.homedir()),
        encoding: 'buffer',
        timeout: 10000
    }, (error, stdoutBuf, stderrBuf) => {
        const decode = (buf) => {
            if (!buf || !buf.length) return '';
            try {
                const str = buf.toString('utf8');
                if (!str.includes('\uFFFD')) return str;
            } catch (e) {}
            try {
                if (typeof TextDecoder !== 'undefined') {
                    return new TextDecoder('gbk').decode(buf);
                }
            } catch (e) {}
            return buf.toString('utf8');
        };

        const stdout = decode(stdoutBuf);
        const stderr = decode(stderrBuf);

        if (error) {
            res.json({ output: stdout || '', error: stderr || error.message });
        } else {
            res.json({ output: stdout });
        }
    });
});

// 剪贴板同步（支持图文双向互通）
router.get('/clipboard', (req, res) => {
    try {
        let text = '';
        let image = null;

        if (process.platform === 'win32') {
            const tmpFile = path.join(os.tmpdir(), `clipboard_${Date.now()}.txt`);
            const tmpImg = path.join(os.tmpdir(), `clipboard_${Date.now()}.png`);
            try {
                const psScript = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; if ([System.Windows.Forms.Clipboard]::ContainsImage()) { $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $img.Save('${tmpImg.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png); $img.Dispose(); } } if ([System.Windows.Forms.Clipboard]::ContainsText()) { [System.Windows.Forms.Clipboard]::GetText() | Out-File -FilePath '${tmpFile.replace(/\\/g, '\\\\')}' -Encoding utf8; }`;
                execSync(`powershell -NoProfile -Command "${psScript}"`, { timeout: 3000 });
                if (fs.existsSync(tmpFile)) {
                    text = fs.readFileSync(tmpFile, 'utf8').replace(/^\uFEFF/, '').trim();
                    fs.unlinkSync(tmpFile);
                }
                if (fs.existsSync(tmpImg)) {
                    const imgBuf = fs.readFileSync(tmpImg);
                    image = `data:image/png;base64,${imgBuf.toString('base64')}`;
                    fs.unlinkSync(tmpImg);
                }
            } catch (err) {
                if (fs.existsSync(tmpFile)) try { fs.unlinkSync(tmpFile); } catch(e){}
                if (fs.existsSync(tmpImg)) try { fs.unlinkSync(tmpImg); } catch(e){}
            }
        } else if (process.platform === 'darwin') {
            try { text = execSync('pbpaste').toString().trim(); } catch (e) {}
        }

        res.json({
            text: text || '',
            image: image || null,
            type: image ? 'image' : 'text',
            hasImage: !!image
        });
    } catch (e) {
        res.json({ text: '', image: null, type: 'text', hasImage: false });
    }
});

router.post('/clipboard', (req, res) => {
    const { text, image } = req.body || {};
    if (typeof text !== 'string' && typeof image !== 'string') {
        return res.status(400).json({ error: 'Text or image data required' });
    }
    
    try {
        if (process.platform === 'win32') {
            if (image && typeof image === 'string' && image.startsWith('data:image/')) {
                const base64Data = image.split(',')[1];
                if (base64Data) {
                    const tmpImg = path.join(os.tmpdir(), `clipboard_set_${Date.now()}.png`);
                    fs.writeFileSync(tmpImg, Buffer.from(base64Data, 'base64'));
                    try {
                        const ps = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${tmpImg.replace(/\\/g, '\\\\')}'); [System.Windows.Forms.Clipboard]::SetImage($img); $img.Dispose();`;
                        execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 3000 });
                        return res.json({ success: true, type: 'image' });
                    } finally {
                        if (fs.existsSync(tmpImg)) try { fs.unlinkSync(tmpImg); } catch (e) {}
                    }
                }
            }
            if (typeof text === 'string') {
                if (!text) {
                    execSync(`powershell -NoProfile -Command "Set-Clipboard -Value $null"`);
                } else {
                    const tmpFile = path.join(os.tmpdir(), `clipboard_set_${Date.now()}.txt`);
                    fs.writeFileSync(tmpFile, text, 'utf8');
                    try {
                        execSync(`powershell -NoProfile -Command "Get-Content -Path '${tmpFile.replace(/\\/g, '\\\\')}' -Encoding utf8 | Set-Clipboard"`);
                    } finally {
                        if (fs.existsSync(tmpFile)) try { fs.unlinkSync(tmpFile); } catch (e) {}
                    }
                }
                return res.json({ success: true, type: 'text' });
            }
        } else if (process.platform === 'darwin') {
            if (typeof text === 'string') {
                execSync(`pbcopy`, { input: text });
                return res.json({ success: true, type: 'text' });
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to set clipboard: ' + e.message });
    }
});

/* ---------- 关于信息与自动更新服务 ---------- */

function compareVersions(v1, v2) {
    const clean1 = String(v1 || '').replace(/^[vV]/, '').trim();
    const clean2 = String(v2 || '').replace(/^[vV]/, '').trim();
    const p1 = clean1.split(/[-.]/).map(n => parseInt(n, 10) || 0);
    const p2 = clean2.split(/[-.]/).map(n => parseInt(n, 10) || 0);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
        const a = p1[i] || 0;
        const b = p2[i] || 0;
        if (a > b) return 1;
        if (a < b) return -1;
    }
    return 0;
}

router.get('/system/version', (req, res) => {
    const curVer = getAppVersion();
    let releaseDate = '2026-09-13';
    let releaseNotes = '';
    try {
        const vJsonPath = path.join(ROOT_DIR, 'version.json');
        if (fs.existsSync(vJsonPath)) {
            const vData = JSON.parse(fs.readFileSync(vJsonPath, 'utf8'));
            if (vData.release_date) releaseDate = vData.release_date;
            if (vData.release_notes) releaseNotes = vData.release_notes;
        }
    } catch (e) {}

    res.json({
        name: '猫步互联 Pro',
        version: curVer,
        author: '猫步可爱 (maobukeai)',
        releaseDate,
        releaseNotes,
        repoUrl: 'https://github.com/maobukeai/lan-interconnect',
        releasesUrl: 'https://github.com/maobukeai/lan-interconnect/releases'
    });
});

// 服务端多源 CDN 探针与版本检查
router.get('/system/check-update', async (req, res) => {
    const currentVer = getAppVersion();
    const cdnUrls = [
        'https://ghfast.top/https://raw.githubusercontent.com/maobukeai/lan-interconnect/main/version.json',
        'https://ghproxy.net/https://raw.githubusercontent.com/maobukeai/lan-interconnect/main/version.json',
        'https://cdn.jsdelivr.net/gh/maobukeai/lan-interconnect@main/version.json',
        'https://fastly.jsdelivr.net/gh/maobukeai/lan-interconnect@main/version.json',
        'https://cdn.jsdelivr.net/gh/maobukeai/lan-interconnect@main/package.json',
        'https://fastly.jsdelivr.net/gh/maobukeai/lan-interconnect@main/package.json'
    ];

    const https = require('https');
    const http = require('http');

    function fetchUrl(url, timeoutMs = 6000) {
        return new Promise((resolve, reject) => {
            try {
                const client = url.startsWith('https:') ? https : http;
                const reqObj = client.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 LanDiskPro/' + currentVer, 'Accept': 'application/json' },
                    timeout: timeoutMs
                }, (resp) => {
                    if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                        return fetchUrl(resp.headers.location, timeoutMs).then(resolve).catch(reject);
                    }
                    if (resp.statusCode < 200 || resp.statusCode >= 300) {
                        return reject(new Error('HTTP ' + resp.statusCode));
                    }
                    let data = '';
                    resp.on('data', chunk => data += chunk);
                    resp.on('end', () => resolve(data));
                });
                reqObj.on('error', reject);
                reqObj.on('timeout', () => { reqObj.destroy(); reject(new Error('Timeout')); });
            } catch (err) {
                reject(err);
            }
        });
    }

    // 1. 尝试多源 CDN
    for (const cdnUrl of cdnUrls) {
        try {
            const body = await fetchUrl(cdnUrl);
            const trimmed = (body || '').trim();
            if (!trimmed.startsWith('{')) continue;
            const json = JSON.parse(trimmed);
            const ver = String(json.version || '').replace(/^[vV]/, '').trim();
            if (ver) {
                const hasUpdate = compareVersions(ver, currentVer) > 0;
                return res.json({
                    latest: {
                        version: ver,
                        release_date: json.release_date || '',
                        download_url: json.download_url || `https://github.com/maobukeai/lan-interconnect/releases/tag/v${ver}`,
                        release_notes: json.release_notes || (hasUpdate ? `发现新版本 v${ver}（免限流高速 CDN 通道）` : '当前已是最新版本'),
                        assets: (Array.isArray(json.assets) && json.assets.length > 0 ? json.assets : [
                            {
                                name: `LanDisk-Pro-${ver}-Setup.exe`,
                                url: `https://github.com/maobukeai/lan-interconnect/releases/download/v${ver}/LanDisk-Pro-${ver}-Setup.exe`,
                                size: 28248518,
                                sha256: null
                            },
                            {
                                name: `LanDisk-Pro-${ver}.apk`,
                                url: `https://github.com/maobukeai/lan-interconnect/releases/download/v${ver}/LanDisk-Pro-${ver}.apk`,
                                size: 9027600,
                                sha256: null
                            }
                        ]).map(a => {
                            let u = a.url || '';
                            if (u.includes('%E7%8C%AB%E6%AD%A5%E4%BA%92%E8%81%94Pro_') || u.includes('猫步互联Pro_')) {
                                u = u.replace(/(?:%E7%8C%AB%E6%AD%A5%E4%BA%92%E8%81%94Pro_|猫步互联Pro_)([\d\.]+)(?:_x64-setup)?\.exe/i, 'LanDisk-Pro-$1-Setup.exe');
                                u = u.replace(/(?:%E7%8C%AB%E6%AD%A5%E4%BA%92%E8%81%94Pro_|猫步互联Pro_)([\d\.]+)\.apk/i, 'LanDisk-Pro-$1.apk');
                            }
                            let name = a.name || '';
                            if (name.includes('猫步互联Pro_')) {
                                name = name.replace(/猫步互联Pro_([\d\.]+)(?:_x64-setup)?\.exe/i, 'LanDisk-Pro-$1-Setup.exe');
                                name = name.replace(/猫步互联Pro_([\d\.]+)\.apk/i, 'LanDisk-Pro-$1.apk');
                            }
                            return { ...a, name, url: u };
                        })
                    },
                    has_update: hasUpdate,
                    current_version: currentVer,
                    error: null
                });
            }
        } catch (e) {
            // 继续尝试下一 CDN 镜像
        }
    }

    // 2. 备用尝试 GitHub API
    try {
        const ghApiUrl = 'https://api.github.com/repos/maobukeai/lan-interconnect/releases/latest';
        const body = await fetchUrl(ghApiUrl);
        const trimmed = (body || '').trim();
        if (!trimmed.startsWith('{')) throw new Error('GitHub API 返回非 JSON 格式');
        const json = JSON.parse(trimmed);
        const ver = String(json.tag_name || '').replace(/^[vV]/, '').trim();
        const hasUpdate = compareVersions(ver, currentVer) > 0;
        return res.json({
            latest: {
                version: ver || currentVer,
                release_date: json.published_at || '',
                download_url: json.html_url || 'https://github.com/maobukeai/lan-interconnect/releases',
                release_notes: json.body || '',
                assets: (json.assets || []).map(a => ({
                    name: a.name,
                    url: a.browser_download_url,
                    size: a.size || 0,
                    sha256: null
                }))
            },
            has_update: hasUpdate,
            current_version: currentVer,
            error: null
        });
    } catch (err) {
        // 3. 全网探针失败时回退至本地 version.json 元数据
        try {
            const vJsonPath = path.join(ROOT_DIR, 'version.json');
            if (fs.existsSync(vJsonPath)) {
                const localData = JSON.parse(fs.readFileSync(vJsonPath, 'utf8'));
                const ver = localData.version || currentVer;
                return res.json({
                    latest: localData,
                    has_update: compareVersions(ver, currentVer) > 0,
                    current_version: currentVer,
                    error: null
                });
            }
        } catch (e) {}

        return res.json({
            latest: null,
            has_update: false,
            current_version: currentVer,
            error: '检查更新超时或网络不可达，请稍后重试或访问 GitHub Releases 页面'
        });
    }
});

// 下载任务全局状态
let downloadTask = {
    active: false,
    percentage: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speedBytesPerSec: 0,
    stage: 'idle',
    error: null,
    filePath: null,
    isLocalFallback: false
};

router.get('/system/update-progress', (req, res) => {
    res.json(downloadTask);
});

router.post('/system/download-update', (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return res.status(400).json({ success: false, error: '缺少有效的安装包下载地址' });
    }

    if (downloadTask.active) {
        return res.json({ success: true, message: '已有下载任务进行中', task: downloadTask });
    }

    const https = require('https');
    const http = require('http');
    const targetFile = path.join(os.tmpdir(), `landisk-update-${Date.now()}.exe`);

    downloadTask = {
        active: true,
        percentage: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedBytesPerSec: 0,
        stage: 'downloading',
        error: null,
        filePath: targetFile,
        isLocalFallback: false
    };

    res.json({ success: true, message: '下载任务已启动', task: downloadTask });

    // 异步流式下载与回退保障引擎
    (async () => {
        // 查找本地构建输出中可用于测试升级的安装包（当云端404或离线测试时自动回退）
        function findLocalFallbackInstaller() {
            const candidateDirs = [
                path.join(ROOT_DIR, 'dist_output'),
                ROOT_DIR
            ];
            for (const dir of candidateDirs) {
                if (!fs.existsSync(dir)) continue;
                try {
                    const files = fs.readdirSync(dir);
                    const setupFiles = files
                        .filter(f => f.toLowerCase().endsWith('-setup.exe') || f.toLowerCase().endsWith('setup.exe'))
                        .sort((a, b) => {
                            try {
                                return fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs;
                            } catch (e) { return 0; }
                        });
                    if (setupFiles.length > 0) return path.join(dir, setupFiles[0]);
                    const anyExes = files
                        .filter(f => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('server'))
                        .sort((a, b) => {
                            try {
                                return fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs;
                            } catch (e) { return 0; }
                        });
                    if (anyExes.length > 0) return path.join(dir, anyExes[0]);
                } catch (e) {}
            }
            return null;
        }

        // 模拟本地测试安装包平滑流式写入（保障本地测试能完整体验 0%->100% 进度与静默安装全流程）
        function streamLocalFallback(localPath) {
            try {
                const stat = fs.statSync(localPath);
                const total = stat.size;
                downloadTask.totalBytes = total;
                downloadTask.downloadedBytes = 0;
                downloadTask.isLocalFallback = true;

                const chunkSize = 512 * 1024; // 512KB per chunk
                const fdIn = fs.openSync(localPath, 'r');
                const fdOut = fs.openSync(targetFile, 'w');
                const buf = Buffer.alloc(chunkSize);

                let offset = 0;
                let lastTick = Date.now();

                const interval = setInterval(() => {
                    if (offset >= total) {
                        clearInterval(interval);
                        try { fs.closeSync(fdIn); } catch (e) {}
                        try { fs.closeSync(fdOut); } catch (e) {}
                        downloadTask.percentage = 100;
                        downloadTask.downloadedBytes = total;
                        downloadTask.speedBytesPerSec = 0;
                        downloadTask.active = false;
                        downloadTask.stage = 'done';
                        return;
                    }

                    const bytesToRead = Math.min(chunkSize, total - offset);
                    const bytesRead = fs.readSync(fdIn, buf, 0, bytesToRead, offset);
                    if (bytesRead > 0) {
                        fs.writeSync(fdOut, buf, 0, bytesRead);
                        offset += bytesRead;
                        downloadTask.downloadedBytes = offset;
                        downloadTask.percentage = parseFloat(((offset / total) * 100).toFixed(1));

                        const now = Date.now();
                        const dt = (now - lastTick) / 1000;
                        if (dt >= 0.15) {
                            downloadTask.speedBytesPerSec = Math.round(chunkSize * 15 / (dt || 0.15));
                            lastTick = now;
                        }
                    }
                }, 25);
            } catch (err) {
                downloadTask.active = false;
                downloadTask.stage = 'error';
                downloadTask.error = '本地安装包读取失败: ' + err.message;
            }
        }

        function handleTargetNotFound() {
            const localFallback = findLocalFallbackInstaller();
            if (localFallback) {
                return streamLocalFallback(localFallback);
            }
            downloadTask.active = false;
            downloadTask.stage = 'error';
            downloadTask.error = '云端发布包尚未在 GitHub Releases 正式上线 (HTTP 404)，请稍后或前往 Releases 页面查看';
        }

        // 自动规范化发布包地址（将历史遗留的中文产物名映射为 GitHub Releases 实际构建产物名）
        function normalizeReleaseUrl(u) {
            if (!u || typeof u !== 'string') return u;
            let decoded = u;
            try { decoded = decodeURIComponent(u); } catch (e) {}

            const verMatch = decoded.match(/v?(\d+\.\d+\.\d+)/);
            const ver = verMatch ? verMatch[1] : null;
            if (ver && (decoded.includes('猫步互联Pro') || decoded.includes('LanDisk-Pro') || decoded.includes('lan-interconnect'))) {
                if (decoded.endsWith('.apk')) {
                    return `https://github.com/maobukeai/lan-interconnect/releases/download/v${ver}/LanDisk-Pro-${ver}.apk`;
                }
                if (decoded.endsWith('.exe')) {
                    return `https://github.com/maobukeai/lan-interconnect/releases/download/v${ver}/LanDisk-Pro-${ver}-Setup.exe`;
                }
            }
            return u;
        }

        const normalizedUrl = normalizeReleaseUrl(url);

        // 整理下载源：国内优先免翻墙 CDN 高速镜像，并保留规范化直连与原地址
        const downloadTargets = [];
        if (normalizedUrl.includes('github.com') && normalizedUrl.includes('/releases/download/')) {
            downloadTargets.push('https://ghfast.top/' + normalizedUrl);
            downloadTargets.push('https://ghproxy.net/' + normalizedUrl);
        }
        downloadTargets.push(normalizedUrl);
        if (url !== normalizedUrl) {
            downloadTargets.push(url);
        }

        let lastTime = Date.now();
        let lastDownloaded = 0;
        let attemptIdx = 0;

        function tryNextTarget() {
            if (attemptIdx >= downloadTargets.length) {
                const localFallback = findLocalFallbackInstaller();
                if (localFallback) {
                    return streamLocalFallback(localFallback);
                }
                downloadTask.active = false;
                downloadTask.stage = 'error';
                downloadTask.error = '网络连接超时或无法访问云端发布服务器，建议前往 Releases 页面手动下载';
                return;
            }

            const currentTarget = downloadTargets[attemptIdx++];
            const client = currentTarget.startsWith('https:') ? https : http;

            try {
                const reqStream = client.get(currentTarget, {
                    headers: { 'User-Agent': 'Mozilla/5.0 LanDiskPro' },
                    timeout: 6000
                }, (resp) => {
                    if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                        return startDirectDownload(resp.headers.location);
                    }
                    // 404 明确表示该版本资源尚未在 GitHub 仓库发布，无需重复尝试代理，立即启用本地回退或提示
                    if (resp.statusCode === 404) {
                        return handleTargetNotFound();
                    }
                    if (resp.statusCode < 200 || resp.statusCode >= 300) {
                        if (attemptIdx < downloadTargets.length) return tryNextTarget();
                        const localFallback = findLocalFallbackInstaller();
                        if (localFallback) return streamLocalFallback(localFallback);

                        downloadTask.active = false;
                        downloadTask.stage = 'error';
                        downloadTask.error = `云端服务器返回异常 (HTTP ${resp.statusCode})，建议前往 Releases 页面手动下载`;
                        return;
                    }

                    // 正常流式接收
                    pipeResponse(resp);
                });

                reqStream.on('error', () => {
                    if (attemptIdx < downloadTargets.length) return tryNextTarget();
                    const localFallback = findLocalFallbackInstaller();
                    if (localFallback) return streamLocalFallback(localFallback);

                    downloadTask.active = false;
                    downloadTask.stage = 'error';
                    downloadTask.error = '网络连接超时或无法访问云端服务器，请检查网络或前往 Releases 页面手动下载';
                });

                reqStream.on('timeout', () => {
                    reqStream.destroy();
                    if (attemptIdx < downloadTargets.length) return tryNextTarget();
                    const localFallback = findLocalFallbackInstaller();
                    if (localFallback) return streamLocalFallback(localFallback);

                    downloadTask.active = false;
                    downloadTask.stage = 'error';
                    downloadTask.error = '下载连接超时，建议稍后重试或前往 Releases 页面手动下载';
                });
            } catch (err) {
                if (attemptIdx < downloadTargets.length) return tryNextTarget();
                const localFallback = findLocalFallbackInstaller();
                if (localFallback) return streamLocalFallback(localFallback);

                downloadTask.active = false;
                downloadTask.stage = 'error';
                downloadTask.error = '启动下载异常: ' + err.message;
            }
        }

        function startDirectDownload(redirectUrl) {
            const client = redirectUrl.startsWith('https:') ? https : http;
            const rStream = client.get(redirectUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 LanDiskPro' }
            }, (resp) => {
                if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                    return startDirectDownload(resp.headers.location);
                }
                if (resp.statusCode === 404) {
                    return handleTargetNotFound();
                }
                if (resp.statusCode < 200 || resp.statusCode >= 300) {
                    return tryNextTarget();
                }
                pipeResponse(resp);
            });
            rStream.on('error', () => tryNextTarget());
        }

        function pipeResponse(resp) {
            downloadTask.totalBytes = parseInt(resp.headers['content-length'], 10) || 0;
            const fileOut = fs.createWriteStream(targetFile);

            resp.on('data', (chunk) => {
                downloadTask.downloadedBytes += chunk.length;
                if (downloadTask.totalBytes > 0) {
                    downloadTask.percentage = parseFloat(((downloadTask.downloadedBytes / downloadTask.totalBytes) * 100).toFixed(1));
                }
                const now = Date.now();
                const diffTime = (now - lastTime) / 1000;
                if (diffTime >= 0.4) {
                    downloadTask.speedBytesPerSec = Math.round((downloadTask.downloadedBytes - lastDownloaded) / diffTime);
                    lastDownloaded = downloadTask.downloadedBytes;
                    lastTime = now;
                }
            });

            resp.pipe(fileOut);

            fileOut.on('finish', () => {
                fileOut.close(() => {
                    downloadTask.active = false;
                    downloadTask.percentage = 100;
                    downloadTask.stage = 'done';
                });
            });

            fileOut.on('error', (err) => {
                try { fs.unlinkSync(targetFile); } catch (e) {}
                downloadTask.active = false;
                downloadTask.stage = 'error';
                downloadTask.error = '写入本地安装包失败: ' + err.message;
            });
        }

        tryNextTarget();
    })();
});

router.post('/system/install-update', (req, res) => {
    const { filePath, silent } = req.body || {};
    const target = filePath || downloadTask.filePath;
    if (!target || !fs.existsSync(target)) {
        return res.status(400).json({ success: false, error: '安装包不存在或尚未下载完成' });
    }

    if (process.platform !== 'win32') {
        return res.status(400).json({ success: false, error: '软件内自动执行升级仅支持 Windows 平台' });
    }

    const { spawn } = require('child_process');
    try {
        // 检测当前正在运行的应用路径，按优先级：客户端传参 > 环境变量 > Sidecar同级 > 标准安装路径
        let runningExePath = '';
        if (req.body && req.body.currentExe && typeof req.body.currentExe === 'string' && fs.existsSync(req.body.currentExe)) {
            runningExePath = req.body.currentExe;
        } else if (process.env.LAN_DISK_MAIN_EXE && fs.existsSync(process.env.LAN_DISK_MAIN_EXE)) {
            runningExePath = process.env.LAN_DISK_MAIN_EXE;
        } else if (process.execPath && process.execPath.toLowerCase().includes('lan-disk-server')) {
            const siblingExe = path.join(path.dirname(process.execPath), 'lan-disk.exe');
            if (fs.existsSync(siblingExe)) runningExePath = siblingExe;
        }

        // 生成专用的独立脱壳升级与自动重启批处理脚本
        const updaterBat = path.join(os.tmpdir(), `landisk-updater-${Date.now()}.bat`);
        const isSilent = silent ? '1' : '0';
        const targetExeName = path.basename(target);
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const defaultInstalledExe = path.join(localAppData, '猫步互联 Pro', 'lan-disk.exe');
        const programsInstalledExe = path.join(localAppData, 'Programs', '猫步互联 Pro', 'lan-disk.exe');
        const programFilesExe = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', '猫步互联 Pro', 'lan-disk.exe');
        const programFilesX86Exe = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', '猫步互联 Pro', 'lan-disk.exe');

        const batLines = [
            '@echo off',
            'chcp 65001 >nul',
            'title 猫步互联 Pro 升级安装与自动重启服务',
            'echo ==================================================',
            'echo   正在执行 猫步互联 Pro 自动升级与自动重启...',
            'echo ==================================================',
            '',
            ':: 1. 等待主窗口优雅关闭，并清理残留进程以彻底释放文件锁',
            'timeout /t 2 /nobreak >nul',
            'taskkill /f /im lan-disk.exe >nul 2>&1',
            'taskkill /f /im lan-disk-server.exe >nul 2>&1',
            'taskkill /f /im LanDisk-Pro*.exe >nul 2>&1',
            'timeout /t 1 /nobreak >nul',
            '',
            ':: 2. 执行安装程序并确保其完全退出',
            `echo [Updater] 正在运行安装包: "${target}"`,
            `if "${isSilent}"=="1" (`,
            `    start /wait "" "${target}" /S`,
            `) else (`,
            `    start /wait "" "${target}"`,
            `)`,
            '',
            ':: 循环等待安装程序子进程完全结束（防 NSIS 提权解包未完成）',
            `:wait_installer`,
            `timeout /t 1 /nobreak >nul`,
            `tasklist /fi "imagename eq ${targetExeName}" 2>nul | find /i "${targetExeName}" >nul`,
            `if not errorlevel 1 goto :wait_installer`,
            '',
            ':: 等待磁盘写入与文件句柄释放',
            'timeout /t 2 /nobreak >nul',
            '',
            ':: 3. 智能拉起新版本客户端（若安装程序已勾选直接运行则无需重复启动）',
            'tasklist /fi "imagename eq lan-disk.exe" 2>nul | find /i "lan-disk.exe" >nul',
            'if not errorlevel 1 (',
            '    echo [Updater] 新版本客户端已在运行中，无需重复拉起。',
            '    goto :cleanup',
            ')',
            '',
            runningExePath ? `if exist "${runningExePath}" (` : '',
            runningExePath ? `    echo [Updater] 成功启动新版客户端: "${runningExePath}"` : '',
            runningExePath ? `    start "" /D "${path.dirname(runningExePath)}" "${runningExePath}"` : '',
            runningExePath ? `    goto :cleanup` : '',
            runningExePath ? `)` : '',
            `if exist "${defaultInstalledExe}" (`,
            `    echo [Updater] 成功启动新版客户端: "${defaultInstalledExe}"`,
            `    start "" /D "${path.dirname(defaultInstalledExe)}" "${defaultInstalledExe}"`,
            `    goto :cleanup`,
            `)`,
            `if exist "${programsInstalledExe}" (`,
            `    echo [Updater] 成功启动新版客户端: "${programsInstalledExe}"`,
            `    start "" /D "${path.dirname(programsInstalledExe)}" "${programsInstalledExe}"`,
            `    goto :cleanup`,
            `)`,
            `if exist "${programFilesExe}" (`,
            `    echo [Updater] 成功启动新版客户端: "${programFilesExe}"`,
            `    start "" /D "${path.dirname(programFilesExe)}" "${programFilesExe}"`,
            `    goto :cleanup`,
            `)`,
            `if exist "${programFilesX86Exe}" (`,
            `    echo [Updater] 成功启动新版客户端: "${programFilesX86Exe}"`,
            `    start "" /D "${path.dirname(programFilesX86Exe)}" "${programFilesX86Exe}"`,
            `    goto :cleanup`,
            `)`,
            '',
            ':cleanup',
            ':: 4. 延迟清理自身批处理脚本与临时安装包',
            'timeout /t 3 /nobreak >nul',
            `del /f /q "${target}" >nul 2>&1`,
            '(goto) 2>nul & del "%~f0" >nul 2>&1',
            'exit /b 0'
        ].filter(line => line !== undefined && line !== null && line !== '');

        fs.writeFileSync(updaterBat, batLines.join('\r\n'), 'utf8');

        // 独立脱壳启动升级批处理，脱离当前进程生命周期
        const child = spawn('cmd.exe', ['/c', updaterBat], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        res.json({ success: true, message: '升级安装与重启服务已成功启动，软件即将关闭并自动重新开启新版本' });

        // 延时让出资源给批处理脚本
        setTimeout(() => {
            process.exit(0);
        }, 1200);
    } catch (err) {
        res.status(500).json({ success: false, error: '启动自动升级重启服务失败: ' + err.message });
    }
});

module.exports = router;
