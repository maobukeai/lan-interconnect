const express = require('express');
const router = express.Router();
const { state, savePersistedSecurityData } = require('../config');

// 清理所有过期的分享链接
router.post('/tools/clean-links', (req, res) => {
    let cleaned = 0;
    const now = Date.now();
    Object.keys(state.sharedLinks).forEach(id => {
        if (state.sharedLinks[id] && state.sharedLinks[id].expiresAt < now) {
            delete state.sharedLinks[id];
            cleaned++;
        }
    });
    res.json({ success: true, cleaned });
});

// 强制断开所有已连接设备
router.post('/tools/kick-devices', (req, res) => {
    const count = Object.keys(state.connectedDevices).length;
    state.connectedDevices = {};
    state.sseClients.forEach(client => {
        try { client.res.end(); } catch (e) {}
    });
    state.sseClients = [];
    res.json({ success: true, kicked: count });
});

// 强制断开单个指定设备
router.post('/tools/kick-device', (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: '缺少 IP 参数' });
    delete state.connectedDevices[ip];
    state.sseClients = state.sseClients.filter(client => {
        if (client && client.ip === ip) {
            try { client.res.end(); } catch (e) {}
            return false;
        }
        return true;
    });
    res.json({ success: true, ip });
});

// IPv4 格式校验，防止把任意字符串写进黑名单持久化文件
function isValidIPv4(ip) {
    return typeof ip === 'string' && /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) &&
        ip.split('.').every(part => parseInt(part, 10) >= 0 && parseInt(part, 10) <= 255);
}

// 拉黑指定 IP (踢出并屏蔽访问)
router.post('/tools/block-ip', (req, res) => {
    const { ip } = req.body;
    if (!isValidIPv4(ip)) return res.status(400).json({ error: 'IP 格式不合法' });
    if (ip === '127.0.0.1') return res.status(400).json({ error: '无法封禁本机回环地址 (127.0.0.1)' });
    state.blockedIps.add(ip);
    delete state.connectedDevices[ip];
    state.sseClients = state.sseClients.filter(client => {
        if (client && client.ip === ip) {
            try { client.res.end(); } catch (e) {}
            return false;
        }
        return true;
    });
    savePersistedSecurityData();
    res.json({ success: true, ip, blockedIps: Array.from(state.blockedIps) });
});

// 解封指定 IP
router.post('/tools/unblock-ip', (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: '缺少 IP 参数' });
    state.blockedIps.delete(ip);
    savePersistedSecurityData();
    res.json({ success: true, ip, blockedIps: Array.from(state.blockedIps) });
});

// 设置设备备注别名
router.post('/tools/set-device-alias', (req, res) => {
    const { ip, alias } = req.body;
    if (!ip) return res.status(400).json({ error: '缺少 IP 参数' });
    state.deviceAliases[ip] = (alias || '').trim();
    if (state.connectedDevices[ip]) {
        state.connectedDevices[ip].alias = state.deviceAliases[ip];
    }
    savePersistedSecurityData();
    res.json({ success: true, ip, alias: state.deviceAliases[ip] });
});

module.exports = router;
