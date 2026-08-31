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

// 局域网服务发现与心跳轻量探针 (无需登录鉴权)
router.get('/ping', (req, res) => {
    const osType = os.type();
    const osName = osType === 'Windows_NT' ? 'Windows' : (osType === 'Darwin' ? 'macOS' : (osType === 'Linux' ? 'Linux' : osType));
    res.json({
        app: '猫步互联 Pro',
        version: '1.8.2',
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

// 剪贴板同步
router.get('/clipboard', (req, res) => {
    try {
        let text = '';
        try {
            const { clipboard } = require('electron');
            text = clipboard.readText() || '';
        } catch (electronErr) {
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

router.post('/clipboard', (req, res) => {
    const { text } = req.body;
    if (typeof text !== 'string') return res.status(400).json({ error: 'Text required' });
    
    try {
        try {
            const { clipboard } = require('electron');
            clipboard.writeText(text);
            return res.json({ success: true });
        } catch (electronErr) {
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

module.exports = router;
