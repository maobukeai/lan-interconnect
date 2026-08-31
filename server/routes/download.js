const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const crypto = require('crypto');
const { state, isSafePath, getCleanIp, getLocalIpAddress } = require('../config');
const { checkSensitive } = require('../middleware/auth');
const historyService = require('../services/history');

// 下载单文件
router.get('/download', (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).send('Not found');
    if (!isSafePath(targetPath)) return res.status(403).send('Forbidden');

    let size = 0;
    try { size = fs.statSync(targetPath).size; } catch (e) {}
    historyService.recordTransfer('download', {
        name: path.basename(targetPath),
        size,
        path: targetPath,
        ip: getCleanIp(req.ip || req.socket?.remoteAddress)
    });

    res.download(targetPath);
});

// 批量打包下载
router.post('/download/batch', (req, res) => {
    let { files, folderName } = req.body;
    if (!files) return res.status(400).json({ error: 'No files specified' });
    if (!Array.isArray(files)) files = [files];
    if (files.length === 0) {
        return res.status(400).json({ error: 'No files specified' });
    }

    historyService.recordTransfer('download', {
        name: `${(folderName || 'batch_download').replace(/[/\\?%*:|"<>]/g, '-')}.zip (${files.length} 项打包)`,
        size: 0,
        detail: `${files.length} 项`,
        ip: getCleanIp(req.ip || req.socket?.remoteAddress)
    });

    const archive = archiver('zip', { zlib: { level: 1 } });
    res.attachment(`${(folderName || 'batch_download').replace(/[/\\?%*:|"<>]/g, '-')}.zip`);

    archive.on('error', (err) => {
        if (res.headersSent) {
            res.destroy();
        } else {
            res.status(500).send({ error: err.message });
        }
    });

    archive.pipe(res);

    // 客户端中途断开时中止打包，避免 archiver 继续读完全部文件写向已销毁的 socket
    req.on('close', () => {
        try { archive.abort(); } catch (e) {}
    });

    for (const file of files) {
        if (!isSafePath(file)) continue;
        if (fs.existsSync(file)) {
            const stats = fs.statSync(file);
            const name = path.basename(file);
            if (stats.isDirectory()) {
                archive.directory(file, name);
            } else {
                archive.file(file, { name: name });
            }
        }
    }

    archive.finalize();
});

// 媒体 MIME 类型映射字典（与 shared/media-types.js 的白名单保持同一覆盖面）
const MEDIA_MIME_TYPES = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.flv': 'video/x-flv',
    '.ts': 'video/mp2t',
    '.m2ts': 'video/mp2t',
    '.wmv': 'video/x-ms-wmv',
    '.3gp': 'video/3gpp',
    '.3g2': 'video/3gpp2',
    '.mpg': 'video/mpeg',
    '.mpeg': 'video/mpeg',
    '.ogv': 'video/ogg',
    '.rm': 'application/vnd.rn-realmedia',
    '.rmvb': 'application/vnd.rn-realmedia-vbr',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.opus': 'audio/opus',
    '.wma': 'audio/x-ms-wma'
};

// 局域网极致秒开流式传输引擎 (Zero-latency LAN Media Streamer)
const handleStream = (req, res, isHead = false) => {
    const targetPath = req.query.path;
    if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).send('Not found');
    if (!isSafePath(targetPath)) return res.status(403).send('Forbidden');

    const resolved = path.resolve(targetPath);
    let stat;
    try {
        stat = fs.statSync(resolved);
    } catch (e) {
        return res.status(404).send('Not found');
    }

    if (stat.isDirectory()) return res.status(400).send('Cannot stream directory');

    const fileSize = stat.size;
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MEDIA_MIME_TYPES[ext] || 'application/octet-stream';

    // 禁用 TCP Nagle 算法，消除网络数据包排队延迟，实现局域网 0ms 发送
    if (res.socket && typeof res.socket.setNoDelay === 'function') {
        res.socket.setNoDelay(true);
    }

    const range = req.headers.range;

    // 允许客户端强缓存已请求的视频切片（拖拽后退 0 耗时秒开）
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    res.setHeader('Connection', 'keep-alive');

    if (isHead) {
        res.setHeader('Content-Length', fileSize);
        return res.status(200).end();
    }

    if (range) {
        // 解析 Range: bytes=start-end
        let parts = range.replace(/bytes=/, "").split("-");
        let start = parseInt(parts[0], 10);
        let end = parts[1] !== undefined ? parseInt(parts[1], 10) : NaN;

        // 后缀 Range (bytes=-500)：请求最后 500 字节
        if (isNaN(start) && !isNaN(end) && parts[0].trim() === '') {
            start = Math.max(0, fileSize - end);
            end = fileSize - 1;
        }

        if (isNaN(start) || start >= fileSize) {
            res.setHeader('Content-Range', `bytes */${fileSize}`);
            return res.status(416).end();
        }

        // 开放式 Range (如 Range: bytes=0-) 限制每次响应最大 2MB~4MB 切片：
        // 客户端 15ms~25ms 即收齐首批关键帧瞬间起播，同时避免预取/拖拽把整部视频
        // 写进 Service Worker 缓存（cache key 只按 Range 头区分，不截断等于全量下载）
        if (isNaN(end) || parts[1].trim() === '') {
            const maxChunk = start === 0 ? 2 * 1024 * 1024 : 4 * 1024 * 1024;
            end = Math.min(fileSize - 1, start + maxChunk - 1);
        } else if (end >= fileSize) {
            end = fileSize - 1;
        }

        const chunksize = (end - start) + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunksize);

        // 使用 1MB 高性能流式直通缓冲区，千兆局域网可达到 100MB/s+ 吞吐
        const stream = fs.createReadStream(resolved, {
            start,
            end,
            highWaterMark: 1024 * 1024
        });

        stream.on('error', (err) => {
            if (!res.headersSent) res.status(500).end();
            else res.destroy();
        });

        req.on('close', () => {
            stream.destroy();
        });

        stream.pipe(res);
    } else {
        // 全量请求
        res.setHeader('Content-Length', fileSize);
        res.status(200);

        const stream = fs.createReadStream(resolved, {
            highWaterMark: 1024 * 1024
        });

        stream.on('error', (err) => {
            if (!res.headersSent) res.status(500).end();
            else res.destroy();
        });

        req.on('close', () => {
            stream.destroy();
        });

        stream.pipe(res);
    }
};

router.head('/stream', (req, res) => handleStream(req, res, true));
router.get('/stream', (req, res) => handleStream(req, res, false));

// 生成分享链接（附二维码）
router.post('/share', async (req, res) => {
    const { path: targetPath, expireHours } = req.body;
    if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).json({ error: '文件不存在' });
    if (!isSafePath(targetPath)) return res.status(403).json({ error: 'Forbidden' });

    // 64 位熵分享码 + 有效期上限 7 天，防止在线爆破与永久链接
    const shareId = crypto.randomBytes(8).toString('hex');
    const hours = Math.min(Math.max(parseInt(expireHours, 10) || 24, 1), 168);
    const expiresAt = Date.now() + hours * 3600 * 1000;

    state.sharedLinks[shareId] = {
        path: targetPath,
        expiresAt,
        fileName: path.basename(targetPath)
    };

    const ip = state.currentConfig.bindIp && state.currentConfig.bindIp !== '0.0.0.0'
        ? state.currentConfig.bindIp
        : getLocalIpAddress();
    const port = state.currentConfig.port || 3000;
    const shareUrl = `http://${ip}:${port}/api/shared/download/${shareId}`;

    let qrDataUrl = '';
    try {
        const QRCode = require('qrcode');
        qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 300, margin: 1, color: { dark: '#000000ff', light: '#ffffffff' } });
    } catch (e) {}

    res.json({ success: true, shareId, shareUrl, qrDataUrl, expiresAt });
});

// 分享链接列表（管理面；免密模式下仅限本机/持密者查看）
router.get('/shares', checkSensitive, (req, res) => {
    const now = Date.now();
    const items = Object.entries(state.sharedLinks)
        .filter(([, v]) => v && v.expiresAt > now)
        .map(([shareId, v]) => ({
            shareId,
            fileName: v.fileName,
            path: v.path,
            expiresAt: v.expiresAt
        }));
    res.json({ items });
});

// 撤销分享链接
router.post('/share/revoke', checkSensitive, (req, res) => {
    const { shareId } = req.body || {};
    if (!shareId || !state.sharedLinks[shareId]) {
        return res.status(404).json({ error: '分享链接不存在' });
    }
    delete state.sharedLinks[shareId];
    res.json({ success: true });
});

// 免密提取共享文件
router.get('/shared/download/:shareId', (req, res) => {
    const shareId = req.params.shareId;
    const item = state.sharedLinks[shareId];

    if (!item) {
        return res.status(404).send('分享链接不存在或已被撤销');
    }
    if (Date.now() > item.expiresAt) {
        delete state.sharedLinks[shareId];
        return res.status(410).send('分享链接已过期');
    }
    if (!fs.existsSync(item.path)) {
        return res.status(404).send('原文件已被移动或删除');
    }

    historyService.recordTransfer('download', {
        name: item.fileName,
        size: (() => { try { return fs.statSync(item.path).size; } catch (e) { return 0; } })(),
        path: item.path,
        detail: '分享链接提取',
        ip: getCleanIp(req.ip || req.socket?.remoteAddress)
    });

    res.download(item.path, item.fileName);
});

module.exports = router;
