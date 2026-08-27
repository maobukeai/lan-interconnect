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

// 视频/音频流式播放支持 (零拷贝 sendfile)
router.get('/stream', (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).send('Not found');
    if (!isSafePath(targetPath)) return res.status(403).send('Forbidden');

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.sendFile(path.resolve(targetPath), {
        dotfiles: 'allow',
        acceptRanges: true,
        cacheControl: false,
        lastModified: false,
        etag: false
    }, (err) => {
        if (err) {
            if (err.code !== 'ECONNABORTED' && err.code !== 'EPIPE') {
                console.error('sendFile error:', err.message);
            }
            if (!res.headersSent) {
                res.status(500).end();
            } else {
                res.destroy();
            }
        }
    });
});

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
