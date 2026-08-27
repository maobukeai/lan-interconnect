const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const trashService = require('../services/trash');
const { cleanupTempChunks } = require('./upload');

// 1. Ping 延迟测试
router.get('/speedtest/ping', (req, res) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
    });
    res.json({
        serverTime: Date.now(),
        clientEcho: req.query.t || 0
    });
});

// 2. 下行测速数据流 (支持自定义大小，默认 10MB)
router.get('/speedtest/download', (req, res) => {
    const sizeMb = Math.min(50, Math.max(1, parseFloat(req.query.size) || 10));
    const totalBytes = Math.round(sizeMb * 1024 * 1024);

    res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': totalBytes,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
    });

    const chunk = crypto.randomBytes(64 * 1024); // 64KB chunk
    let sent = 0;

    function sendNext() {
        while (sent < totalBytes) {
            const toSend = Math.min(chunk.length, totalBytes - sent);
            const buf = toSend === chunk.length ? chunk : chunk.slice(0, toSend);
            sent += toSend;
            const ok = res.write(buf);
            if (!ok) {
                res.once('drain', sendNext);
                return;
            }
        }
        res.end();
    }

    sendNext();
});

// 3. 上行测速数据流接收
router.post('/speedtest/upload', (req, res) => {
    let receivedBytes = 0;
    const startTime = Date.now();

    req.on('data', (chunk) => {
        receivedBytes += chunk.length;
    });

    req.on('end', () => {
        const durationSec = Math.max(0.001, (Date.now() - startTime) / 1000);
        const speedMbps = (receivedBytes * 8 / 1000 / 1000) / durationSec;
        const speedMBs = (receivedBytes / 1024 / 1024) / durationSec;

        res.json({
            receivedBytes,
            durationSec: parseFloat(durationSec.toFixed(3)),
            speedMbps: parseFloat(speedMbps.toFixed(2)),
            speedMBs: parseFloat(speedMBs.toFixed(2))
        });
    });

    req.on('error', (err) => {
        res.status(500).json({ error: err.message });
    });
});

// 4. 一键清理临时上传切片与回收站过期文件
router.post('/tools/clean-storage', (req, res) => {
    try {
        const chunkCount = cleanupTempChunks ? cleanupTempChunks() : 0;
        const trashCleaned = trashService && trashService.cleanupExpired ? trashService.cleanupExpired() : 0;
        res.json({
            success: true,
            message: '清理完成',
            cleanedChunks: chunkCount,
            cleanedTrash: trashCleaned
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
