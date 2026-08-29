const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { state, isSafePath, sanitizeFileName } = require('../config');
const { checkSensitive } = require('../middleware/auth');
const trashService = require('../services/trash');

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

// 获取文件列表（异步 fs.promises，大目录不阻塞事件循环）
router.get('/files', async (req, res) => {
    let targetPath = req.query.path || (state.currentConfig.mode === 'shared' ? state.sharedDir : 'C:\\');

    if (!isSafePath(targetPath)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const stats = await fsp.stat(targetPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const names = await fsp.readdir(targetPath);
        const LIMIT = 5000; // 单目录条目上限，防超长卡顿
        const fileList = [];
        for (const file of names.slice(0, LIMIT)) {
            try {
                const fileStats = await fsp.stat(path.join(targetPath, file));
                fileList.push({
                    name: file,
                    path: path.join(targetPath, file),
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
            truncated: names.length > LIMIT,
            files: fileList
        });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Path not found' });
        res.status(500).json({ error: 'Failed to list directory' });
    }
});

// 新建文件夹
router.post('/mkdir', checkSensitive, (req, res) => {
    const { path: parentPath, name } = req.body || {};
    const safeName = sanitizeFileName(name);
    if (!parentPath || !safeName) return res.status(400).json({ error: '缺少目录或名称参数' });
    if (!isSafePath(parentPath, true)) return res.status(403).json({ error: 'Forbidden' });

    try {
        const newPath = path.join(parentPath, safeName);
        if (fs.existsSync(newPath)) return res.status(409).json({ error: '同名文件或文件夹已存在' });
        fs.mkdirSync(newPath);
        res.json({ success: true, path: newPath });
    } catch (err) {
        res.status(500).json({ error: '创建文件夹失败: ' + err.message });
    }
});

// 重命名 / 同目录移动
router.post('/rename', checkSensitive, (req, res) => {
    const { path: targetPath, newName } = req.body || {};
    const safeName = sanitizeFileName(newName);
    if (!targetPath || !safeName) return res.status(400).json({ error: '缺少路径或新名称参数' });
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: '文件不存在' });
    if (!isSafePath(targetPath, true)) return res.status(403).json({ error: 'Forbidden' });
    // 新名字落点也必须可写（防目录穿越改写系统路径）
    const destPath = path.join(path.dirname(path.resolve(targetPath)), safeName);
    if (!isSafePath(destPath, true)) return res.status(403).json({ error: 'Forbidden' });
    // Windows 大小写不敏感：仅大小写变化时视为改名而非冲突
    const caseOnly = process.platform === 'win32' &&
        path.resolve(destPath).toLowerCase() === path.resolve(targetPath).toLowerCase();
    if (fs.existsSync(destPath) && !caseOnly) return res.status(409).json({ error: '目标名称已存在' });

    try {
        fs.renameSync(targetPath, destPath);
        res.json({ success: true, path: destPath });
    } catch (err) {
        res.status(500).json({ error: '重命名失败: ' + err.message });
    }
});

// 删除文件/文件夹 → 移入回收站
router.delete('/files', checkSensitive, (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath) return res.status(400).json({ error: '缺少 path 参数' });
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: '文件不存在' });
    if (!isSafePath(targetPath, true)) return res.status(403).json({ error: 'Forbidden' });

    try {
        const item = trashService.trashItem(path.resolve(targetPath));
        res.json({ success: true, message: `已移入回收站`, id: item.id, name: item.name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 回收站列表（免密模式下仅限本机/持密者查看，防止向访客泄露主机路径）
router.get('/trash', checkSensitive, (req, res) => {
    res.json({ items: trashService.list() });
});

// 从回收站恢复
router.post('/trash/restore', checkSensitive, (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: '缺少 id 参数' });
    try {
        const result = trashService.restoreItem(id);
        res.json({ success: true, restoredTo: result.restoredTo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 彻底删除回收站条目（id 为空则清空全部）
router.post('/trash/purge', checkSensitive, (req, res) => {
    const { id } = req.body || {};
    try {
        if (id) {
            trashService.purgeItem(id);
            res.json({ success: true });
        } else {
            const cleaned = trashService.purgeAll();
            res.json({ success: true, cleaned });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
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

// 保存文本文件（任意位置写入属敏感操作，与 mkdir/rename/delete 同级保护）
router.post('/save-text', checkSensitive, (req, res) => {
    const { path: targetPath, content } = req.body;
    if (!targetPath || content === undefined) return res.status(400).json({ error: 'Path and content required' });
    if (!isSafePath(targetPath, true)) return res.status(403).json({ error: 'Forbidden' });

    try {
        fs.writeFileSync(targetPath, content, 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save file: ' + err.message });
    }
});

module.exports = router;
