const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { state, broadcastMessage, getCleanIp } = require('../config');

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 聊天/文本互传 API
router.get('/chat', (req, res) => {
    res.json(state.chatMessages);
});

// SSE 实时流
router.get('/chat/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const clientId = Date.now() + crypto.randomBytes(6).toString('hex');
    const cleanIp = getCleanIp(req.ip || req.socket?.remoteAddress);
    state.sseClients.push({ id: clientId, ip: cleanIp, res, req });

    // 心跳注释行：防止中间层因空闲断开连接
    const heartbeat = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (e) {}
    }, 25000);

    // 初始加载所有消息
    res.write(`data: ${JSON.stringify({ type: 'init', messages: state.chatMessages })}\n\n`);

    req.on('close', () => {
        clearInterval(heartbeat);
        state.sseClients = state.sseClients.filter(c => c.id !== clientId);
    });
});

router.post('/chat', (req, res) => {
    let { text, sender, type, action } = req.body;
    
    if (action === 'clear') {
        state.chatMessages = [];
        broadcastMessage({ id: 'clear', type: 'clear', text: '聊天记录已清空', sender: 'system', time: new Date().toISOString() });
        return res.json({ success: true });
    }

    if (!text) return res.status(400).json({ error: 'Text/Data is required' });

    // XSS 防护与数据验证
    type = type || 'text';
    if (!['text', 'image', 'audio'].includes(type)) type = 'text';
    if (type === 'text') {
        if (String(text).length > 5000) {
            return res.status(400).json({ error: '消息内容过长，不能超过 5000 字符' });
        }
        text = escapeHtml(text);
    } else if (type === 'image') {
        if (!/^data:image\/[\w.+-]+;base64,/.test(String(text))) return res.status(400).json({ error: 'Invalid image data' });
        if (!/^[A-Za-z0-9+/=\s]+$/.test(String(text).split(',')[1] || '')) return res.status(400).json({ error: 'Invalid image data' });
        if (String(text).length > 8 * 1024 * 1024) return res.status(400).json({ error: '图片数据过大（限制 6MB）' });
    } else if (type === 'audio') {
        // 容忍 MediaRecorder 带参数的 dataURL（如 data:audio/webm;codecs=opus;base64,…）
        if (!/^data:audio\/[\w.+-]+(;[^;,]+)*;base64,/i.test(String(text))) return res.status(400).json({ error: 'Invalid audio data' });
        if (!/^[A-Za-z0-9+/=\s]+$/.test(String(text).split(',')[1] || '')) return res.status(400).json({ error: 'Invalid audio data' });
        if (String(text).length > 8 * 1024 * 1024) return res.status(400).json({ error: '音频数据过大（限制 6MB）' });
    }

    const msg = {
        id: Date.now().toString(36) + crypto.randomBytes(4).toString('hex'),
        text,
        sender: escapeHtml(String(sender || '').slice(0, 60)) || getCleanIp(req.ip || req.socket?.remoteAddress) || 'Anonymous',
        type,
        time: new Date().toISOString()
    };
    
    state.chatMessages.push(msg);
    if (state.chatMessages.length > 500) {
        state.chatMessages.shift();
    }
    
    broadcastMessage(msg);
    res.json({ success: true, message: msg });
});

module.exports = router;
