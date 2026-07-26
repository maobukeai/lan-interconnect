const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { state, isSafePath } = require('../config');

// 设置 Multer 文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let targetPath = req.headers['x-upload-dir'] ? decodeURIComponent(req.headers['x-upload-dir']) : state.sharedDir;
        if (state.currentConfig.mode === 'shared') {
            if (!isSafePath(targetPath)) {
                targetPath = state.sharedDir;
            }
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

        fileName = fileName.replace(/[/\\?%*:|"<>]/g, '-');
        
        if (!isSafePath(targetPath)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }

        const fullPath = path.join(targetPath, fileName);
        const writeStream = fs.createWriteStream(fullPath);

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
                writeStream.destroy();
                if (fs.existsSync(fullPath)) {
                    try { fs.unlinkSync(fullPath); } catch(e) {}
                }
                req.destroy();
            }
        });

        req.pipe(writeStream);

        req.on('end', () => {
            res.json({ message: 'File uploaded successfully', filename: fileName });
        });

        req.on('error', (err) => {
            writeStream.close();
            if (fs.existsSync(fullPath)) {
                try { fs.unlinkSync(fullPath); } catch(e) {}
            }
            if (!res.headersSent) {
                res.status(500).json({ error: err.message });
            }
        });
        
        writeStream.on('error', (err) => {
            if (!res.headersSent) {
                res.status(500).json({ error: '写入文件失败: ' + err.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 大文件分片上传与断点续传/秒传 API
const tempChunksDir = path.join(__dirname, '..', 'temp_chunks');
if (!fs.existsSync(tempChunksDir)) fs.mkdirSync(tempChunksDir, { recursive: true });

router.get('/upload/check', (req, res) => {
    const { fileHash, filename, path: targetDir } = req.query;
    if (!fileHash || !filename) return res.status(400).json({ error: 'Missing parameters' });

    const uploadDir = (targetDir && isSafePath(targetDir)) ? targetDir : state.sharedDir;
    const targetFilePath = path.join(uploadDir, filename);

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

const chunkStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const fileHash = req.body.fileHash || 'unknown_hash';
        const chunkDir = path.join(tempChunksDir, fileHash);
        if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });
        cb(null, chunkDir);
    },
    filename: (req, file, cb) => {
        const chunkIndex = req.body.chunkIndex || '0';
        cb(null, `${chunkIndex}`);
    }
});
const uploadChunkMulter = multer({ storage: chunkStorage });

router.post('/upload/chunk', (req, res) => {
    uploadChunkMulter.single('chunk')(req, res, (err) => {
        if (err) return res.status(500).json({ error: err.message || '分片上传失败' });
        res.json({ success: true, chunkIndex: parseInt(req.body.chunkIndex) });
    });
});

router.post('/upload/merge', async (req, res) => {
    const { fileHash, filename, path: targetDir, totalChunks } = req.body;
    if (!fileHash || !filename || !totalChunks) return res.status(400).json({ error: 'Missing merge parameters' });

    const uploadDir = (targetDir && isSafePath(targetDir)) ? targetDir : state.sharedDir;
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    
    const targetFilePath = path.join(uploadDir, filename);
    const chunkDir = path.join(tempChunksDir, fileHash);

    if (!fs.existsSync(chunkDir)) {
        return res.status(400).json({ error: '分片不存在或已被清理' });
    }

    try {
        const writeStream = fs.createWriteStream(targetFilePath);
        
        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path.join(chunkDir, `${i}`);
            if (!fs.existsSync(chunkPath)) {
                writeStream.close();
                return res.status(400).json({ error: `缺少分片 ${i}` });
            }
            const data = fs.readFileSync(chunkPath);
            writeStream.write(data);
        }
        
        writeStream.end();
        
        writeStream.on('finish', () => {
            try {
                fs.rmSync(chunkDir, { recursive: true, force: true });
            } catch(e) {}
            res.json({ success: true, filename, filePath: targetFilePath });
        });

        writeStream.on('error', (err) => {
            res.status(500).json({ error: '合并文件出错: ' + err.message });
        });
    } catch(e) {
        res.status(500).json({ error: '合并分片抛出异常: ' + e.message });
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
        const filenames = req.files.map(f => f.filename);
        res.json({ message: 'Files uploaded successfully', count: filenames.length, filenames });
    });
});

// 接收 Base64 画板图片上传
router.post('/upload/base64', (req, res) => {
    const { image, filename, path: targetPath } = req.body;
    if (!image || !filename || !targetPath) return res.status(400).json({ error: 'Missing data' });
    if (!isSafePath(targetPath)) return res.status(403).json({ error: 'Forbidden' });

    try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const dataBuffer = Buffer.from(base64Data, 'base64');
        const fullPath = path.join(targetPath, filename);

        fs.writeFileSync(fullPath, dataBuffer);
        res.json({ success: true, filename });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save base64 image: ' + err.message });
    }
});

module.exports = router;
