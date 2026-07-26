const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const crypto = require('crypto');
const { state, isSafePath } = require('../config');

// 下载单文件
router.get('/download', (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).send('Not found');
    if (!isSafePath(targetPath)) return res.status(403).send('Forbidden');
    
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

    const archive = archiver('zip', { zlib: { level: 1 } });
    res.attachment(`${folderName || 'batch_download'}.zip`);
    
    archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
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
            }
        }
    });
});

// 生成提取码分享链接
router.post('/share', (req, res) => {
    const { path: targetPath, expireHours } = req.body;
    if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).json({ error: '文件不存在' });
    if (!isSafePath(targetPath)) return res.status(403).json({ error: 'Forbidden' });

    const shareId = crypto.randomBytes(4).toString('hex');
    const hours = parseInt(expireHours) || 24;
    const expiresAt = Date.now() + hours * 3600 * 1000;

    state.sharedLinks[shareId] = {
        path: targetPath,
        expiresAt,
        fileName: path.basename(targetPath)
    };

    res.json({ success: true, shareId, expiresAt });
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

    res.download(item.path, item.fileName);
});

module.exports = router;
