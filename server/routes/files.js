const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { state, isSafePath, sanitizeFileName } = require('../config');
const { checkSensitive } = require('../middleware/auth');
const trashService = require('../services/trash');
const { dirCacheGet, dirCacheSet, dirCacheInvalidate, dirCacheInvalidateParent } = require('../services/dir-cache');

function get7zaPath() {
    let p = '';
    try {
        p = require('7zip-bin').path7za;
    } catch (e) {}
    if (p && p.includes('app.asar')) {
        const unpacked = p.replace('app.asar', 'app.asar.unpacked');
        if (fs.existsSync(unpacked)) return unpacked;
    }
    return p;
}

// 盘符列表缓存（探测 26 个盘符较贵，10s 内直接复用）
const DRIVES_CACHE_TTL = 10000;
let drivesCache = { ts: 0, data: null };

// 获取驱动器列表
router.get('/drives', (req, res) => {
    if (state.currentConfig.mode === 'shared') {
        return res.json([{ path: state.sharedDir, name: '共享文件夹 (互传目录)', free: 0, total: 0 }]);
    }
    if (drivesCache.data && Date.now() - drivesCache.ts < DRIVES_CACHE_TTL) {
        return res.json(drivesCache.data);
    }

    let drives = null;
    if (process.platform !== 'win32') {
        let free = 0, total = 0;
        if (fs.statfsSync) {
            try {
                const stats = fs.statfsSync('/');
                free = stats.bsize * stats.bfree;
                total = stats.bsize * stats.blocks;
            } catch (e) {}
        }
        drives = [{ path: '/', name: '根目录 (/)', free, total }];
    } else {
        // Windows 盘符自动探测 (A: - Z:)
        drives = [];
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
        if (drives.length === 0) drives = [{ path: 'C:\\', name: '本地磁盘 (C:)', free: 0, total: 0 }];
    }

    drivesCache = { ts: Date.now(), data: drives };
    res.json(drives);
});

// 获取文件列表（异步 fs.promises，大目录不阻塞事件循环；并发 stat + 短 TTL 缓存）
router.get('/files', async (req, res) => {
    let targetPath = req.query.path || (state.currentConfig.mode === 'shared' ? state.sharedDir : 'C:\\');
    if (/^[a-zA-Z]:$/.test(targetPath)) {
        targetPath += '\\';
    }

    if (!isSafePath(targetPath)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const resolved = path.resolve(targetPath);
        const dirStats = await fsp.stat(resolved);
        if (!dirStats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        // 目录自身 mtime/size 做指纹：内容未变时命中缓存，大目录一扫即回
        const fingerprint = `${dirStats.mtimeMs}:${dirStats.size}`;
        const cached = dirCacheGet(resolved, fingerprint);
        if (cached) return res.json(cached);

        const names = await fsp.readdir(resolved, { withFileTypes: true });
        const LIMIT = 5000; // 单目录条目上限，防超长卡顿
        const fileList = [];

        // 每批 32 路并发 stat，避免 5000 次串行线程池往返
        const statBatch = async (batch) => {
            const results = await Promise.all(batch.map(async (name) => {
                try {
                    const full = path.join(resolved, name);
                    const fileStats = await fsp.stat(full);
                    return {
                        name,
                        path: full,
                        size: fileStats.size,
                        isDirectory: fileStats.isDirectory(),
                        mtime: fileStats.mtime
                    };
                } catch (e) {
                    return null;
                }
            }));
            for (const r of results) {
                if (r) fileList.push(r);
            }
        };
        for (let i = 0; i < names.length && i < LIMIT; i += 32) {
            await statBatch(names.slice(i, i + 32).map((d) => d.name));
        }

        fileList.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) {
                return a.name.localeCompare(b.name, 'zh-CN');
            }
            return a.isDirectory ? -1 : 1;
        });

        const payload = {
            currentPath: targetPath,
            truncated: names.length > LIMIT,
            files: fileList
        };
        dirCacheSet(resolved, fingerprint, payload);
        res.json(payload);
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
        dirCacheInvalidate(parentPath);
        res.json({ success: true, path: newPath });
    } catch (err) {
        res.status(500).json({ error: '创建文件夹失败: ' + err.message });
    }
});

// 新建空白文件
router.post('/touch', checkSensitive, (req, res) => {
    const parentPath = req.body && (req.body.path || req.body.dir);
    const { name } = req.body || {};
    const safeName = sanitizeFileName(name);
    if (!parentPath || !safeName) return res.status(400).json({ error: '缺少目录或文件名参数' });
    if (!isSafePath(parentPath, true)) return res.status(403).json({ error: 'Forbidden' });

    try {
        const newFilePath = path.join(parentPath, safeName);
        if (fs.existsSync(newFilePath)) return res.status(409).json({ error: '同名文件或文件夹已存在' });
        fs.writeFileSync(newFilePath, '', 'utf8');
        dirCacheInvalidate(parentPath);
        res.json({ success: true, path: newFilePath, name: safeName });
    } catch (err) {
        res.status(500).json({ error: '创建文件失败: ' + err.message });
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
        dirCacheInvalidate(path.dirname(path.resolve(targetPath)));
        dirCacheInvalidate(path.dirname(path.resolve(destPath)));
        res.json({ success: true, path: destPath });
    } catch (err) {
        res.status(500).json({ error: '重命名失败: ' + err.message });
    }
});

// 删除文件/文件夹 → 移入回收站
router.delete('/files', checkSensitive, async (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath) return res.status(400).json({ error: '缺少 path 参数' });
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: '文件不存在' });
    if (!isSafePath(targetPath, true)) return res.status(403).json({ error: 'Forbidden' });

    try {
        const item = await trashService.trashItem(path.resolve(targetPath));
        dirCacheInvalidateParent(targetPath);
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
router.post('/trash/restore', checkSensitive, async (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: '缺少 id 参数' });
    try {
        const result = await trashService.restoreItem(id);
        dirCacheInvalidateParent(result.restoredTo);
        res.json({ success: true, restoredTo: result.restoredTo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 彻底删除回收站条目（id 为空则清空全部）
router.post('/trash/purge', checkSensitive, async (req, res) => {
    const { id } = req.body || {};
    try {
        if (id) {
            trashService.purgeItem(id);
            res.json({ success: true });
        } else {
            const cleaned = await trashService.purgeAll();
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
        const resolved = path.resolve(targetPath);
        const tmp = resolved + '.tmp';
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, resolved);
        dirCacheInvalidateParent(resolved);
        res.json({ success: true });
    } catch (err) {
        try {
            fs.writeFileSync(targetPath, content, 'utf8');
            dirCacheInvalidateParent(targetPath);
            res.json({ success: true });
        } catch (e2) {
            res.status(500).json({ error: 'Failed to save file: ' + err.message });
        }
    }
});

// 解压缩文件（使用 7za，支持 zip, rar, 7z, tar, gz, bz2, xz）
const handleExtract = async (req, res) => {
    const { path: archivePath, targetDir, password } = req.body || {};
    if (!archivePath) return res.status(400).json({ error: '缺少压缩包路径参数' });
    if (!fs.existsSync(archivePath)) return res.status(404).json({ error: '压缩包文件不存在' });
    if (!isSafePath(archivePath)) return res.status(403).json({ error: 'Forbidden' });

    // 默认解压到同名文件夹（去后缀）
    let destDir = targetDir;
    if (!destDir) {
        const ext = path.extname(archivePath);
        const base = path.basename(archivePath, ext);
        destDir = path.join(path.dirname(path.resolve(archivePath)), base);
    }
    destDir = path.resolve(destDir);

    if (!isSafePath(destDir, true)) return res.status(403).json({ error: 'Forbidden' });

    try {
        if (!fs.existsSync(destDir)) {
            await fsp.mkdir(destDir, { recursive: true });
        }
    } catch (err) {
        return res.status(500).json({ error: '创建目标解压目录失败: ' + err.message });
    }

    const bin7z = get7zaPath();
    if (!bin7z || !fs.existsSync(bin7z)) {
        return res.status(500).json({ error: '服务端 7-Zip 解压组件不可用' });
    }

    const args = ['x', path.resolve(archivePath), `-o${destDir}`, '-y'];
    if (password) {
        args.push(`-p${password}`);
    }

    try {
        const proc = spawn(bin7z, args, { windowsHide: true });
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            dirCacheInvalidate(destDir);
            dirCacheInvalidateParent(destDir);

            if (code === 0) {
                return res.json({
                    success: true,
                    message: '解压完成',
                    targetDir: destDir
                });
            } else if (code === 2) {
                return res.status(400).json({
                    success: false,
                    error: '解压失败：密码错误或压缩包损坏'
                });
            } else {
                const errMsg = (stderr || stdout || '').slice(-300).trim();
                return res.status(500).json({
                    success: false,
                    error: `解压异常退出 (代码 ${code})${errMsg ? ': ' + errMsg : ''}`
                });
            }
        });

        proc.on('error', (err) => {
            return res.status(500).json({
                success: false,
                error: '启动解压进程失败: ' + err.message
            });
        });
    } catch (e) {
        return res.status(500).json({ error: '解压任务调度异常: ' + e.message });
    }
};

router.post('/files/extract', checkSensitive, handleExtract);
router.post('/extract', checkSensitive, handleExtract);

// 复制文件或文件夹
const handleCopy = async (req, res) => {
    const { source, destination, overwrite } = req.body || {};
    if (!source || !destination) return res.status(400).json({ error: '缺少源路径或目标路径参数' });
    if (!fs.existsSync(source)) return res.status(404).json({ error: '源文件或文件夹不存在' });
    if (!isSafePath(source)) return res.status(403).json({ error: 'Forbidden' });

    let resolvedDest = path.resolve(destination);
    const resolvedSource = path.resolve(source);

    // 若目标是一个已有目录，则将源文件放入该目录中
    try {
        const destStat = await fsp.stat(resolvedDest).catch(() => null);
        if (destStat && destStat.isDirectory()) {
            resolvedDest = path.join(resolvedDest, path.basename(resolvedSource));
        }
    } catch (e) {}

    if (!isSafePath(resolvedDest, true)) return res.status(403).json({ error: 'Forbidden' });

    // 防止将目录复制到自身或其子目录中
    if (resolvedDest.toLowerCase().startsWith(resolvedSource.toLowerCase() + path.sep)) {
        return res.status(400).json({ error: '无法将文件夹复制到其自身的子文件夹中' });
    }

    // 重名处理
    if (fs.existsSync(resolvedDest) && !overwrite) {
        const ext = path.extname(resolvedDest);
        const base = path.basename(resolvedDest, ext);
        let counter = 1;
        let candidate = path.join(path.dirname(resolvedDest), `${base} (${counter})${ext}`);
        while (fs.existsSync(candidate) && counter < 100) {
            counter++;
            candidate = path.join(path.dirname(resolvedDest), `${base} (${counter})${ext}`);
        }
        resolvedDest = candidate;
    }

    try {
        await fsp.cp(resolvedSource, resolvedDest, { recursive: true });
        dirCacheInvalidateParent(resolvedDest);
        res.json({ success: true, message: '复制成功', path: resolvedDest });
    } catch (err) {
        res.status(500).json({ error: '复制失败: ' + err.message });
    }
};

router.post('/files/copy', checkSensitive, handleCopy);
router.post('/copy', checkSensitive, handleCopy);

// 移动文件或文件夹（剪切）
const handleMove = async (req, res) => {
    const { source, destination, overwrite } = req.body || {};
    if (!source || !destination) return res.status(400).json({ error: '缺少源路径或目标路径参数' });
    if (!fs.existsSync(source)) return res.status(404).json({ error: '源文件或文件夹不存在' });
    if (!isSafePath(source, true)) return res.status(403).json({ error: 'Forbidden' });

    let resolvedDest = path.resolve(destination);
    const resolvedSource = path.resolve(source);

    try {
        const destStat = await fsp.stat(resolvedDest).catch(() => null);
        if (destStat && destStat.isDirectory()) {
            resolvedDest = path.join(resolvedDest, path.basename(resolvedSource));
        }
    } catch (e) {}

    if (!isSafePath(resolvedDest, true)) return res.status(403).json({ error: 'Forbidden' });

    if (resolvedSource.toLowerCase() === resolvedDest.toLowerCase()) {
        return res.json({ success: true, message: '位置未变', path: resolvedDest });
    }

    // 防止将目录移动到自身子目录
    if (resolvedDest.toLowerCase().startsWith(resolvedSource.toLowerCase() + path.sep)) {
        return res.status(400).json({ error: '无法将文件夹移动到其自身的子文件夹中' });
    }

    if (fs.existsSync(resolvedDest) && !overwrite) {
        const ext = path.extname(resolvedDest);
        const base = path.basename(resolvedDest, ext);
        let counter = 1;
        let candidate = path.join(path.dirname(resolvedDest), `${base} (${counter})${ext}`);
        while (fs.existsSync(candidate) && counter < 100) {
            counter++;
            candidate = path.join(path.dirname(resolvedDest), `${base} (${counter})${ext}`);
        }
        resolvedDest = candidate;
    }

    try {
        try {
            await fsp.rename(resolvedSource, resolvedDest);
        } catch (renameErr) {
            if (renameErr.code === 'EXDEV') {
                await fsp.cp(resolvedSource, resolvedDest, { recursive: true });
                await fsp.rm(resolvedSource, { recursive: true, force: true });
            } else {
                throw renameErr;
            }
        }
        dirCacheInvalidateParent(resolvedSource);
        dirCacheInvalidateParent(resolvedDest);
        res.json({ success: true, message: '移动成功', path: resolvedDest });
    } catch (err) {
        res.status(500).json({ error: '移动失败: ' + err.message });
    }
};

router.post('/files/move', checkSensitive, handleMove);
router.post('/move', checkSensitive, handleMove);

module.exports = router;
