const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { state, isSafePath } = require('../config');

// 获取驱动器列表
router.get('/drives', (req, res) => {
    if (state.currentConfig.mode === 'shared') {
        return res.json([{ path: state.sharedDir, name: '共享文件夹 (互传目录)', free: 0, total: 0 }]);
    }
    if (process.platform !== 'win32') {
        let free = 0, total = 0;
        if (fs.statfsSync) {
            try {
                const stats = fs.statfsSync('/');
                free = stats.bsize * stats.bfree;
                total = stats.bsize * stats.blocks;
            } catch (e) {}
        }
        return res.json([{ path: '/', name: '根目录 (/)', free, total }]);
    }

    // Windows 盘符自动探测 (A: - Z:)
    const drives = [];
    for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i) + ':\\';
        try {
            if (fs.existsSync(letter)) {
                let free = 0, total = 0;
                if (fs.statfsSync) {
                    try {
                        const stats = fs.statfsSync(letter);
                        free = stats.bsize * stats.bfree;
                        total = stats.bsize * stats.blocks;
                    } catch (stErr) {}
                }
                drives.push({
                    path: letter,
                    name: `本地磁盘 (${String.fromCharCode(i)}:)`,
                    free,
                    total
                });
            }
        } catch (e) {}
    }

    if (drives.length > 0) {
        return res.json(drives);
    }
    return res.json([{ path: 'C:\\', name: '本地磁盘 (C:)', free: 0, total: 0 }]);
});

// 获取文件列表
router.get('/files', (req, res) => {
    let targetPath = req.query.path || (state.currentConfig.mode === 'shared' ? state.sharedDir : 'C:\\');

    if (!isSafePath(targetPath)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ error: 'Path not found' });
    }

    try {
        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const files = fs.readdirSync(targetPath);
        const fileList = [];
        for (const file of files) {
            try {
                const filePath = path.join(targetPath, file);
                const fileStats = fs.statSync(filePath);
                fileList.push({
                    name: file,
                    path: filePath,
                    size: fileStats.size,
                    isDirectory: fileStats.isDirectory(),
                    mtime: fileStats.mtime
                });
            } catch (e) {}
        }

        fileList.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) {
                return a.name.localeCompare(b.name, 'zh-CN');
            }
            return a.isDirectory ? -1 : 1;
        });

        res.json({
            currentPath: targetPath,
            files: fileList
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list directory' });
    }
});

// 读取文本 / Markdown 文件内容
router.get('/read-text', (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath) return res.status(400).json({ error: 'Path parameter required' });
    if (!isSafePath(targetPath)) return res.status(403).json({ error: 'Forbidden' });
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'File not found' });

    try {
        const stats = fs.statSync(targetPath);
        if (stats.size > 10 * 1024 * 1024) {
            return res.status(400).json({ error: '文件过大，当前仅支持 10MB 以内的文本/Markdown文件编辑' });
        }
        const content = fs.readFileSync(targetPath, 'utf8');
        res.json({ success: true, content, size: stats.size, path: targetPath });
    } catch (err) {
        res.status(500).json({ error: '读取文件失败: ' + err.message });
    }
});

// 保存文本文件
router.post('/save-text', (req, res) => {
    const { path: targetPath, content } = req.body;
    if (!targetPath || content === undefined) return res.status(400).json({ error: 'Path and content required' });
    if (!isSafePath(targetPath)) return res.status(403).json({ error: 'Forbidden' });

    try {
        fs.writeFileSync(targetPath, content, 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save file: ' + err.message });
    }
});

module.exports = router;
