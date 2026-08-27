const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { state, isSafePath, sanitizeFileName, getCleanIp, DATA_DIR } = require('../config');
const historyService = require('../services/history');

// 分片 hash 只允许字母数字与横线，长度 6-64，防止用 fileHash 拼出任意目录
function isValidFileHash(hash) {
    return typeof hash === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(hash);
}

// 设置 Multer 文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 畸形编码的头会令 decodeURIComponent 抛出未捕获异常打崩进程，必须兜底
        let targetPath = state.sharedDir;
        if (req.headers['x-upload-dir']) {
            try {
                targetPath = decodeURIComponent(req.headers['x-upload-dir']);
            } catch (e) {
                return cb(new Error('目标目录编码不合法'));
            }
        }
        if (state.currentConfig.mode === 'shared') {
            if (!isSafePath(targetPath)) {
                targetPath = state.sharedDir;
            }
        } else if (!isSafePath(targetPath, true)) {
            return cb(new Error('目标目录不允许写入'));
        }
        if (!fs.existsSync(targetPath)) {
            try {
                fs.mkdirSync(targetPath, { recursive: true });
            } catch (err) {
                return cb(new Error('权限不足，无法在当前目录创建文件夹或写入文件'));
            }
        }
        cb(null, targetPath);
    },
    filename: (req, file, cb) => {
        let fileName = file.originalname;
        if (req.headers['x-file-name']) {
            try {
                fileName = decodeURIComponent(req.headers['x-file-name']);
            } catch(e) {}
        } else {
            try {
                fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            } catch(e) {}
        }
        fileName = fileName.replace(/[/\\?%*:|"<>]/g, '-');
        cb(null, fileName);
    }
});
const upload = multer({ storage });

// 纯二进制流上传
router.post('/upload/raw', (req, res) => {
    try {
        let targetPath = req.headers['x-upload-dir'] ? decodeURIComponent(req.headers['x-upload-dir']) : state.sharedDir;
        let fileName = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : `upload_${Date.now()}`;

        const contentLength = parseInt(req.headers['content-length'] || '0', 10);
        const MAX_RAW_SIZE = 10 * 1024 * 1024 * 1024;
        if (contentLength > MAX_RAW_SIZE) {
            return res.status(413).json({ error: '文件大小超过限制 (最大支持 10GB)' });
        }

        fileName = sanitizeFileName(fileName) || `upload_${Date.now()}`;

        if (!isSafePath(targetPath, true)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }

        const fullPath = path.join(targetPath, fileName);
        const writeStream = fs.createWriteStream(fullPath);
        let finished = false;

        const cleanupHalfFile = () => {
            writeStream.destroy();
            if (fs.existsSync(fullPath)) {
                try { fs.unlinkSync(fullPath); } catch(e) {}
            }
        };

        let receivedBytes = 0;
        let isExceeded = false;
        req.on('data', (chunk) => {
            if (isExceeded) return;
            receivedBytes += chunk.length;
            if (receivedBytes > MAX_RAW_SIZE) {
                isExceeded = true;
                if (!res.headersSent) {
                    res.status(413).json({ error: '文件大小超过限制 (最大支持 10GB)' });
                }
                cleanupHalfFile();
                req.destroy();
            }
        });

        req.pipe(writeStream);

        req.on('end', () => {
            // 等写入流真正落盘后再响应，避免客户端立刻读取到不完整文件
            writeStream.end(() => {
                if (!finished) {
                    finished = true;
                    historyService.recordTransfer('upload', {
                        name: fileName,
                        size: receivedBytes,
                        path: fullPath,
                        ip: getCleanIp(req.ip || req.socket?.remoteAddress)
                    });
                    res.json({ message: 'File uploaded successfully', filename: fileName });
                }
            });
        });

        req.on('error', (err) => {
            cleanupHalfFile();
            if (!res.headersSent) {
                res.status(500).json({ error: err.message });
            }
        });

        writeStream.on('error', (err) => {
            cleanupHalfFile();
            if (!res.headersSent) {
                finished = true;
                res.status(500).json({ error: '写入文件失败: ' + err.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 大文件分片上传与断点续传/秒传 API
// 临时分片放在 ~/.landisk/temp_chunks：写进项目目录的话，asar 打包后会写入失败
const tempChunksDir = path.join(DATA_DIR, 'temp_chunks');
if (!fs.existsSync(tempChunksDir)) fs.mkdirSync(tempChunksDir, { recursive: true });

// 清理滞留超过 2 小时的孤儿分片目录，防止磁盘被中途放弃的上传占满
function cleanupTempChunks(maxAgeMs) {
    const cutoff = Date.now() - (maxAgeMs || 2 * 60 * 60 * 1000);
    try {
        for (const name of fs.readdirSync(tempChunksDir)) {
            const dir = path.join(tempChunksDir, name);
            try {
                const stats = fs.statSync(dir);
                if (stats.mtimeMs < cutoff) {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
            } catch (e) {}
        }
    } catch (e) {}
}

router.get('/upload/check', (req, res) => {
    const { fileHash, filename, path: targetDir } = req.query;
    if (!isValidFileHash(fileHash)) return res.status(400).json({ error: 'Invalid fileHash' });
    const safeName = sanitizeFileName(filename);
    if (!safeName) return res.status(400).json({ error: 'Missing parameters' });

    const uploadDir = (targetDir && isSafePath(targetDir)) ? targetDir : state.sharedDir;
    const targetFilePath = path.join(uploadDir, safeName);

    if (fs.existsSync(targetFilePath)) {
        return res.json({ exists: true, uploadedChunkIndices: [] });
    }

    const chunkDir = path.join(tempChunksDir, fileHash);
    let uploadedChunkIndices = [];
    if (fs.existsSync(chunkDir)) {
        const files = fs.readdirSync(chunkDir);
        uploadedChunkIndices = files.map(f => parseInt(f)).filter(n => !isNaN(n));
    }

    res.json({ exists: false, uploadedChunkIndices });
});

// 分片走内存缓冲再落盘：multer 的 diskStorage destination 回调在字段未解析时触发，
// 若客户端把文件放在字段前面会拿不到 fileHash（原版分片上传因此一直是坏的）
const uploadChunkMem = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 32 * 1024 * 1024 }
});

router.post('/upload/chunk', (req, res) => {
    uploadChunkMem.single('chunk')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || '分片上传失败' });

        const fileHash = req.body.fileHash;
        if (!isValidFileHash(fileHash)) return res.status(400).json({ error: 'Invalid fileHash' });
        const idx = parseInt(req.body.chunkIndex, 10);
        if (!Number.isInteger(idx) || idx < 0 || String(idx) !== String(req.body.chunkIndex).trim()) {
            return res.status(400).json({ error: 'Invalid chunkIndex' });
        }
        if (!req.file || !req.file.buffer || !req.file.buffer.length) {
            return res.status(400).json({ error: '缺少分片数据' });
        }

        const chunkDir = path.join(tempChunksDir, fileHash);
        try {
            if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });
            fs.writeFileSync(path.join(chunkDir, `${idx}`), req.file.buffer);
            res.json({ success: true, chunkIndex: idx });
        } catch (e) {
            res.status(500).json({ error: '写入分片失败: ' + e.message });
        }
    });
});

// 正在合并中的 fileHash 集合，防止并发 merge 互相删分片
const mergingHashes = new Set();

router.post('/upload/merge', async (req, res) => {
    const { fileHash, filename, path: targetDir, totalChunks } = req.body;
    if (!isValidFileHash(fileHash)) return res.status(400).json({ error: 'Invalid fileHash' });
    const safeName = sanitizeFileName(filename);
    if (!safeName) return res.status(400).json({ error: 'Missing merge parameters' });
    const chunkCount = parseInt(totalChunks, 10);
    if (!Number.isInteger(chunkCount) || chunkCount <= 0 || chunkCount > 100000 || String(chunkCount) !== String(totalChunks).trim()) {
        return res.status(400).json({ error: 'Invalid totalChunks' });
    }
    if (mergingHashes.has(fileHash)) {
        return res.status(409).json({ error: '该文件正在合并中，请勿重复提交' });
    }

    const uploadDir = (targetDir && isSafePath(targetDir)) ? targetDir : state.sharedDir;
    if (!isSafePath(uploadDir, true)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const targetFilePath = path.join(uploadDir, safeName);
    const chunkDir = path.join(tempChunksDir, fileHash);

    if (!fs.existsSync(chunkDir)) {
        return res.status(400).json({ error: '分片不存在或已被清理' });
    }

    mergingHashes.add(fileHash);
    try {
        const writeStream = fs.createWriteStream(targetFilePath);

        // 逐片流式写入并处理背压，避免大文件合并时内存暴涨
        for (let i = 0; i < chunkCount; i++) {
            const chunkPath = path.join(chunkDir, `${i}`);
            if (!fs.existsSync(chunkPath)) {
                writeStream.destroy();
                try { fs.unlinkSync(targetFilePath); } catch(e) {}
                return res.status(400).json({ error: `缺少分片 ${i}` });
            }
            await new Promise((resolve, reject) => {
                const rs = fs.createReadStream(chunkPath);
                rs.on('data', (chunk) => {
                    if (!writeStream.write(chunk)) {
                        rs.pause();
                        writeStream.once('drain', () => rs.resume());
                    }
                });
                rs.on('end', resolve);
                rs.on('error', reject);
            });
        }

        writeStream.end();
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        try {
            fs.rmSync(chunkDir, { recursive: true, force: true });
        } catch(e) {}
        let mergedSize = 0;
        try { mergedSize = fs.statSync(targetFilePath).size; } catch (e) {}
        historyService.recordTransfer('upload', {
            name: safeName,
            size: mergedSize,
            path: targetFilePath,
            detail: '分片合并',
            ip: getCleanIp(req.ip || req.socket?.remoteAddress)
        });
        res.json({ success: true, filename: safeName, filePath: targetFilePath });
    } catch(e) {
        try { fs.unlinkSync(targetFilePath); } catch(err) {}
        if (!res.headersSent) {
            res.status(500).json({ error: '合并文件出错: ' + e.message });
        }
    } finally {
        mergingHashes.delete(fileHash);
    }
});

// 传统单文件上传
router.post('/upload', (req, res) => {
    upload.single('file')(req, res, function (err) {
        if (err) {
            console.error("Upload error:", err);
            return res.status(500).json({ error: err.message || '上传失败，可能是权限不足或磁盘已满' });
        }
        if (!req.file) {
            return res.status(400).json({ error: '没有接收到文件' });
        }
        historyService.recordTransfer('upload', {
            name: req.file.filename,
            size: req.file.size || 0,
            path: req.file.path,
            ip: getCleanIp(req.ip || req.socket?.remoteAddress)
        });
        res.json({ message: 'File uploaded successfully', filename: req.file.filename });
    });
});

// 多文件批量上传
router.post('/upload/multiple', (req, res) => {
    upload.array('files', 100)(req, res, function (err) {
        if (err) {
            console.error("Multiple upload error:", err);
            return res.status(500).json({ error: err.message || '批量上传失败' });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '没有接收到文件' });
        }
        const uploadIp = getCleanIp(req.ip || req.socket?.remoteAddress);
        req.files.forEach(f => {
            historyService.recordTransfer('upload', {
                name: f.filename,
                size: f.size || 0,
                path: f.path,
                ip: uploadIp
            });
        });
        const filenames = req.files.map(f => f.filename);
        res.json({ message: 'Files uploaded successfully', count: filenames.length, filenames });
    });
});

// 接收 Base64 画板图片上传
router.post('/upload/base64', (req, res) => {
    const { image, filename, path: targetPath } = req.body;
    if (!image || !filename) return res.status(400).json({ error: 'Missing data' });
    const safeName = sanitizeFileName(filename);
    if (!safeName) return res.status(400).json({ error: 'Invalid filename' });
    if (typeof image !== 'string' || !/^data:image\/\w+;base64,/.test(image)) {
        return res.status(400).json({ error: 'Invalid image data' });
    }
    if (image.length > 15 * 1024 * 1024) return res.status(413).json({ error: '图片数据过大（限制 10MB）' });
    // 未指定保存目录时默认写入共享目录（如手机端涂鸦板直接保存）
    const saveDir = targetPath || state.sharedDir;
    if (!saveDir || !isSafePath(saveDir, true)) return res.status(403).json({ error: 'Forbidden' });

    try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const dataBuffer = Buffer.from(base64Data, 'base64');
        const fullPath = path.join(saveDir, safeName);

        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }
        fs.writeFileSync(fullPath, dataBuffer);
        historyService.recordTransfer('upload', {
            name: safeName,
            size: dataBuffer.length,
            path: fullPath,
            detail: '涂鸦/图片',
            ip: getCleanIp(req.ip || req.socket?.remoteAddress)
        });
        res.json({ success: true, filename: safeName });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save base64 image: ' + err.message });
    }
});

module.exports = { router, cleanupTempChunks };
