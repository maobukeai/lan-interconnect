const express = require('express');
const router = express.Router();
const dlnaService = require('../services/dlna');

// 获取或扫描局域网 DLNA 设备列表
router.get('/dlna/devices', async (req, res) => {
    try {
        const needScan = req.query.scan === '1' || req.query.scan === 'true';
        let devices = dlnaService.getDevices();

        if (needScan || devices.length === 0) {
            const timeout = Math.min(Math.max(parseInt(req.query.timeout, 10) || 2000, 500), 5000);
            devices = await dlnaService.discover(timeout);
        }

        res.json({ success: true, devices });
    } catch (err) {
        res.status(500).json({ error: '获取 DLNA 设备失败: ' + err.message });
    }
});

// 向指定 DLNA 设备推送视频播放
router.post('/dlna/play', async (req, res) => {
    const { deviceId, videoUrl, title } = req.body || {};
    if (!deviceId || !videoUrl) {
        return res.status(400).json({ error: '缺少 deviceId 或 videoUrl 参数' });
    }

    try {
        const result = await dlnaService.castPlay(deviceId, videoUrl, title);
        res.json({ success: true, message: '投屏指令已发送', detail: result });
    } catch (err) {
        res.status(500).json({ error: '投屏播放失败: ' + err.message });
    }
});

// 控制 DLNA 播放动作（play, pause, stop）
router.post('/dlna/control', async (req, res) => {
    const { deviceId, action } = req.body || {};
    if (!deviceId || !action) {
        return res.status(400).json({ error: '缺少 deviceId 或 action 参数' });
    }

    try {
        const result = await dlnaService.control(deviceId, action);
        res.json({ success: true, action, detail: result });
    } catch (err) {
        res.status(500).json({ error: '控制指令下发失败: ' + err.message });
    }
});

// DLNA 进度跳转
router.post('/dlna/seek', async (req, res) => {
    const { deviceId, time } = req.body || {};
    if (!deviceId || !time) {
        return res.status(400).json({ error: '缺少 deviceId 或 time 参数' });
    }

    try {
        const result = await dlnaService.seek(deviceId, time);
        res.json({ success: true, time, detail: result });
    } catch (err) {
        res.status(500).json({ error: '进度调整失败: ' + err.message });
    }
});

module.exports = router;
