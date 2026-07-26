const express = require('express');
const router = express.Router();
const { state, broadcastMessage, getCleanIp } = require('../config');

// 聊天/文本互传 API
router.get('/chat', (req, res) => {
    res.json(state.chatMessages);
});

// SSE 实时流
router.get('/chat/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now() + Math.random().toString();
    const cleanIp = getCleanIp(req.ip || req.socket?.remoteAddress);
    state.sseClients.push({ id: clientId, ip: cleanIp, res, req });

    // 初始加载所有消息
    res.write(`data: ${JSON.stringify({ type: 'init', messages: state.chatMessages })}\n\n`);

    req.on('close', () => {
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
    if (type === 'text') {
        if (String(text).length > 5000) {
            return res.status(400).json({ error: '消息内容过长，不能超过 5000 字符' });
        }
        text = String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    } else if (type === 'image') {
        if (!String(text).startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image data' });
        if (String(text).length > 15 * 1024 * 1024) return res.status(400).json({ error: '图片数据过大（限制 10MB）' });
    } else if (type === 'audio') {
        if (!String(text).startsWith('data:audio/')) return res.status(400).json({ error: 'Invalid audio data' });
        if (String(text).length > 15 * 1024 * 1024) return res.status(400).json({ error: '音频数据过大（限制 10MB）' });
    }

    const msg = {
        id: Date.now().toString() + Math.random().toString().substr(2, 4),
        text,
        sender: sender || getCleanIp(req.ip || req.socket?.remoteAddress) || 'Anonymous',
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
