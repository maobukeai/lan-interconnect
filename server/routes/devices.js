const express = require('express');
const router = express.Router();
const { state, getCleanIp } = require('../config');

// 幂等探测：雷达跨主机扫描用 GET（桌面端 file:// 页面对其他主机的写请求会被来源防护拦截）
router.get('/verify', (req, res) => {
    res.json({ success: true, mode: state.currentConfig.mode });
});

router.post('/verify', (req, res) => {
    res.json({ success: true, mode: state.currentConfig.mode });
});

router.get('/devices', (req, res) => {
    const rawIp = req.ip || req.socket?.remoteAddress;
    const cleanIp = getCleanIp(rawIp);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    if (cleanIp) {
        state.connectedDevices[cleanIp] = {
            ip: cleanIp,
            userAgent: userAgent,
            alias: state.deviceAliases[cleanIp] || '',
            lastSeen: Date.now()
        };
    }

    // 清理超过 90 秒无活跃的设备 (适合局域网快速同步状态)
    const now = Date.now();
    for (const ip in state.connectedDevices) {
        if (now - state.connectedDevices[ip].lastSeen > 90 * 1000) {
            delete state.connectedDevices[ip];
        }
    }

    const deviceList = Object.values(state.connectedDevices);
    res.json({
        devices: deviceList,
        stats: state.networkStats,
        blockedIps: Array.from(state.blockedIps)
    });
});

module.exports = router;
