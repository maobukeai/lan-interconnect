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
router.get('/sys-info', (req, res) => {
    let diskSpace = '未知';
    try {
        if (process.platform === 'win32') {
            let output = '';
            try {
                output = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object Caption, Size, FreeSpace"', { timeout: 3000 }).toString();
            } catch (psErr) {
                try { output = execSync('wmic logicaldisk get size,freespace,caption', { timeout: 3000 }).toString(); } catch (wmicErr) { output = ''; }
            }

            if (output) {
                const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 1) {
                    const cLine = lines.find(l => l.includes('C:'));
                    if (cLine) {
                        const parts = cLine.split(/\s+/);
                        if (parts.length >= 3) {
                            const headerLine = lines[0].toLowerCase();
                            const num1 = parseInt(parts[1], 10);
                            const num2 = parseInt(parts[2], 10);
                            if (!isNaN(num1) && !isNaN(num2)) {
                                let freeBytes = 0, totalBytes = 0;
                                if (headerLine.includes('freespace') && headerLine.indexOf('freespace') < headerLine.indexOf('size')) {
                                    freeBytes = num1; totalBytes = num2;
                                } else {
                                    totalBytes = num1; freeBytes = num2;
                                }
                                const free = (freeBytes / 1024 / 1024 / 1024).toFixed(1);
                                const total = (totalBytes / 1024 / 1024 / 1024).toFixed(1);
                                diskSpace = `${free} GB 可用 / 共 ${total} GB`;
                            }
                        }
                    }
                }
            }

            if (diskSpace === '未知' && fs.statfsSync) {
                try {
                    const stats = fs.statfsSync('C:\\');
                    const free = ((stats.bsize * stats.bfree) / 1024 / 1024 / 1024).toFixed(1);
                    const total = ((stats.bsize * stats.blocks) / 1024 / 1024 / 1024).toFixed(1);
                    diskSpace = `${free} GB 可用 / 共 ${total} GB`;
                } catch (fsErr) {}
            }
        } else if (fs.statfsSync) {
            try {
                const stats = fs.statfsSync('/');
                const free = ((stats.bsize * stats.bfree) / 1024 / 1024 / 1024).toFixed(1);
                const total = ((stats.bsize * stats.blocks) / 1024 / 1024 / 1024).toFixed(1);
                diskSpace = `${free} GB 可用 / 共 ${total} GB`;
            } catch (fsErr) {}
        }
    } catch (e) {}

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

// 进程管理 API
router.get('/processes', (req, res) => {
    if (state.currentConfig.mode === 'shared') return res.json([]);
    
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
                    return res.json(processes);
                } catch (e) {}
            }

            exec('tasklist /fo csv /nh', { maxBuffer: 1024 * 1024 * 5, timeout: 5000 }, (tErr, tStdout) => {
                if (tErr || !tStdout) return res.json([]);
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
                    res.json(processes);
                } catch (e) {
                    res.json([]);
                }
            });
        });
    } else {
        exec('ps -ax -o pid,rss,comm', (error, stdout) => {
            if (error || !stdout) return res.json([]);
            try {
                const lines = stdout.split('\n').slice(1);
                const processes = lines.filter(l => l.trim()).map(l => {
                    const parts = l.trim().split(/\s+/);
                    return { pid: parseInt(parts[0]), mem: (parseInt(parts[1]) || 0) * 1024, name: parts.slice(2).join(' '), desc: parts.slice(2).join(' ') };
                });
                res.json(processes);
            } catch (e) {
                res.json([]);
            }
        });
    }
});

router.post('/kill-process', (req, res) => {
    if (state.currentConfig.mode === 'shared') return res.status(403).json({ error: 'Forbidden' });
    const { pid } = req.body;
    if (!pid) return res.status(400).json({ error: 'PID required' });
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

// 执行终端命令
router.post('/terminal', (req, res) => {
    const { command, cwd } = req.body;
    if (!command) return res.status(400).json({ error: 'Command required' });
    if (state.currentConfig.mode === 'shared') {
        return res.status(403).json({ error: 'Terminal disabled in shared mode' });
    }

    const cmdToRun = process.platform === 'win32' ? `chcp 65001 >nul && ${command}` : command;

    exec(cmdToRun, { 
        cwd: cwd || 'C:\\', 
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
