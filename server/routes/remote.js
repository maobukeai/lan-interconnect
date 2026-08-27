const express = require('express');
const router = express.Router();
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec, execFile } = require('child_process');
const { state } = require('../config');

const isPackaged = __dirname.includes('app.asar');
const psScriptPath = isPackaged
    ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'services', 'system-control.ps1')
    : path.join(__dirname, '..', 'services', 'system-control.ps1');

// 音量与屏幕信息简易缓存，减少频繁轮询开销
let volumeCache = { value: null, at: 0 };
let screenCache = { value: null, at: 0 };

function runPsControl(args, isBinaryOutput = false) {
    return new Promise((resolve, reject) => {
        if (process.platform !== 'win32') {
            return resolve(isBinaryOutput ? Buffer.alloc(0) : '{}');
        }

        const psArgs = [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', psScriptPath,
            ...args
        ];

        const options = {
            timeout: 10000,
            maxBuffer: 1024 * 1024 * 15
        };

        if (isBinaryOutput) {
            options.encoding = 'buffer';
        }

        execFile('powershell.exe', psArgs, options, (err, stdout, stderr) => {
            if (err) {
                return reject(err);
            }
            resolve(stdout);
        });
    });
}

// 1. 获取音量状态
router.get('/remote/volume', async (req, res) => {
    try {
        const now = Date.now();
        if (volumeCache.value && now - volumeCache.at < 600) {
            return res.json(volumeCache.value);
        }

        const raw = await runPsControl(['-Action', 'get-volume']);
        try {
            const data = JSON.parse(String(raw).trim());
            const result = {
                volume: Math.round(Number(data.volume) || 0),
                muted: String(data.muted).toLowerCase() === 'true'
            };
            volumeCache = { value: result, at: now };
            res.json(result);
        } catch (e) {
            res.json({ volume: 50, muted: false });
        }
    } catch (err) {
        res.json({ volume: 50, muted: false });
    }
});

// 2. 设置音量与静音
router.post('/remote/volume', async (req, res) => {
    try {
        const { volume, mute } = req.body;
        const args = ['-Action', 'set-volume'];
        
        if (typeof volume === 'number' && !isNaN(volume)) {
            const safeVol = Math.max(0, Math.min(100, Math.round(volume)));
            args.push('-Volume', String(safeVol));
        }

        if (mute === true || mute === 'true') {
            args.push('-Mute', 'true');
        } else if (mute === false || mute === 'false') {
            args.push('-Mute', 'false');
        } else if (mute === 'toggle') {
            args.push('-Mute', 'toggle');
        }

        const raw = await runPsControl(args);
        try {
            const data = JSON.parse(String(raw).trim());
            const result = {
                volume: Math.round(Number(data.volume) || 0),
                muted: String(data.muted).toLowerCase() === 'true'
            };
            volumeCache = { value: result, at: Date.now() };
            res.json({ success: true, ...result });
        } catch (e) {
            res.json({ success: true, volume: Number(volume) || 50, muted: !!mute });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. 获取屏幕信息
router.get('/remote/screen/info', async (req, res) => {
    try {
        const now = Date.now();
        if (screenCache.value && now - screenCache.at < 5000) {
            return res.json(screenCache.value);
        }

        const raw = await runPsControl(['-Action', 'screens']);
        try {
            const list = JSON.parse(String(raw).trim());
            const screens = Array.isArray(list) ? list : [list];
            const result = { screens };
            screenCache = { value: result, at: now };
            res.json(result);
        } catch (e) {
            res.json({
                screens: [{
                    index: 0,
                    deviceName: 'Primary Display',
                    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
                    primary: true
                }]
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. 实时屏幕截屏流
router.get('/remote/screen/capture', async (req, res) => {
    try {
        const display = parseInt(req.query.display, 10) || 0;
        const scale = Math.max(0.2, Math.min(1.0, parseFloat(req.query.scale) || 0.6));
        const quality = Math.max(20, Math.min(90, parseInt(req.query.quality, 10) || 60));

        // 写入独立随机临时文件，避免 stdout 二进制流在部分环境中的编码污染
        const tmpFile = path.join(os.tmpdir(), `landisk_cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`);

        const args = [
            '-Action', 'capture',
            '-Display', String(display),
            '-Scale', String(scale),
            '-Quality', String(quality),
            '-OutPath', tmpFile
        ];

        await runPsControl(args);

        if (fs.existsSync(tmpFile)) {
            const imgBuffer = fs.readFileSync(tmpFile);
            fs.unlink(tmpFile, () => {}); // 异步删除临时文件

            res.set({
                'Content-Type': 'image/jpeg',
                'Content-Length': imgBuffer.length,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            return res.end(imgBuffer);
        } else {
            return res.status(500).json({ error: 'Screen capture failed: File not generated' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. 模拟鼠标点击
router.post('/remote/mouse/click', async (req, res) => {
    try {
        const { x, y, button } = req.body;
        if (typeof x !== 'number' || typeof y !== 'number') {
            return res.status(400).json({ error: 'Coordinates x and y are required' });
        }

        const safeBtn = (button === 'right' || button === 'double') ? button : 'left';
        await runPsControl([
            '-Action', 'click',
            '-MouseX', String(Math.round(x)),
            '-MouseY', String(Math.round(y)),
            '-MouseButton', safeBtn
        ]);

        res.json({ success: true, x: Math.round(x), y: Math.round(y), button: safeBtn });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. 系统电源总控
router.post('/remote/power', (req, res) => {
    if (state.currentConfig.mode === 'shared') {
        return res.status(403).json({ error: '电源控制在只读共享模式下已被禁用' });
    }

    const { action, seconds } = req.body;
    if (!action) {
        return res.status(400).json({ error: 'Action is required' });
    }

    if (process.platform !== 'win32') {
        return res.status(501).json({ error: 'Power controls only supported on Windows' });
    }

    let cmd = '';
    let actionDesc = '';

    switch (action) {
        case 'lock':
            cmd = 'rundll32.exe user32.dll,LockWorkStation';
            actionDesc = '系统已锁定';
            break;
        case 'sleep':
            cmd = 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0';
            actionDesc = '系统进入睡眠';
            break;
        case 'restart':
            cmd = 'shutdown /r /t 0';
            actionDesc = '系统正在重启';
            break;
        case 'shutdown':
            cmd = 'shutdown /s /t 0';
            actionDesc = '系统正在关机';
            break;
        case 'schedule':
            const sec = Math.max(1, Math.min(86400 * 7, parseInt(seconds, 10) || 3600));
            cmd = `shutdown /s /t ${sec}`;
            actionDesc = `已设置 ${Math.round(sec / 60)} 分钟后自动关机`;
            break;
        case 'abort':
            cmd = 'shutdown /a';
            actionDesc = '已取消定时关机计划';
            break;
        default:
            return res.status(400).json({ error: 'Invalid power action' });
    }

    exec(cmd, (err) => {
        if (err && action !== 'abort') {
            return res.status(500).json({ error: '执行失败: ' + err.message });
        }
        res.json({ success: true, action, message: actionDesc });
    });
});

module.exports = router;
