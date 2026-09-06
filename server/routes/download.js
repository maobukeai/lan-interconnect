const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
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
    let { files, folderName } = req.body || {};
    if (!files) return res.status(400).json({ error: 'No files specified' });
    if (typeof files === 'string' && (files.startsWith('[') || files.startsWith('{'))) {
        try { files = JSON.parse(files); } catch(e){}
    }
    if (!Array.isArray(files)) files = [files];
    files = files.filter(f => typeof f === 'string' && f.trim());
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

        // 开放式 Range (如 Range: bytes=0-) 限制每次响应切片大小：
        // 首块保持小切片保证起播速度；续传块大幅放宽到 12MB，远程链路（Tailscale
        // 等高 RTT 场景）下浏览器不必频繁再发 Range 请求逐块续传，显著减少往返。
        // SW 侧单条 8MB 以上不入缓存，不会把 Service Worker 缓存撑爆。
        if (isNaN(end) || parts[1].trim() === '') {
            const maxChunk = start === 0 ? 2 * 1024 * 1024 : 12 * 1024 * 1024;
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

let cachedFfmpegBin = null;
function getFfmpegBin() {
    if (cachedFfmpegBin) return cachedFfmpegBin;
    const candidates = [
        'C:\\Users\\20269\\scoop\\shims\\ffmpeg.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ffmpeg', 'bin', 'ffmpeg.exe'),
        path.join(process.env.ProgramFiles || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
        'ffmpeg'
    ];
    for (const p of candidates) {
        if (p === 'ffmpeg') {
            cachedFfmpegBin = 'ffmpeg';
            return 'ffmpeg';
        }
        try {
            if (fs.existsSync(p)) {
                cachedFfmpegBin = p;
                return p;
            }
        } catch(e) {}
    }
    return 'ffmpeg';
}

// FFmpeg 极速重封装/转码引擎：视频 direct copy，音频转码为双声道 AAC，输出 fragmented mp4
const handleTranscodeStream = (req, res, isHead = false) => {
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

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');

    if (isHead) {
        return res.status(200).end();
    }

    const startTime = parseFloat(req.query.startTime || req.query.ss || '0') || 0;
    const ffmpegBin = getFfmpegBin();

    const args = [
        '-hide_banner',
        '-loglevel', 'error'
    ];

    if (startTime > 0) {
        args.push('-ss', String(startTime));
    }

    args.push(
        '-i', resolved,
        // 视频流直接直通拷贝（0 延迟、0 CPU 占用）
        '-c:v', 'copy',
        // 音频转码为双声道 AAC 192k，彻底解决 AC-3/DTS 在 Web 端无声或黑屏问题
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        // 输出 Fragmented MP4 格式，专供流式 HTTP 实时播放
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
    );

    if (res.socket && typeof res.socket.setNoDelay === 'function') {
        res.socket.setNoDelay(true);
    }

    let proc = null;
    try {
        proc = spawn(ffmpegBin, args, { windowsHide: true });
    } catch (err) {
        if (!res.headersSent) res.status(500).send('FFmpeg spawn failed: ' + err.message);
        return;
    }

    proc.stdout.pipe(res);

    proc.on('error', (err) => {
        if (!res.headersSent) res.status(500).send('FFmpeg error: ' + err.message);
    });

    req.on('close', () => {
        if (proc) {
            try { proc.kill('SIGKILL'); } catch (e) {}
            proc = null;
        }
    });
};

router.head('/stream', (req, res) => {
    if (req.query.transcode === '1' || req.query.remux === '1') {
        return handleTranscodeStream(req, res, true);
    }
    handleStream(req, res, true);
});
router.get('/stream', (req, res) => {
    if (req.query.transcode === '1' || req.query.remux === '1') {
        return handleTranscodeStream(req, res, false);
    }
    handleStream(req, res, false);
});
router.head('/stream/transcode', (req, res) => handleTranscodeStream(req, res, true));
router.get('/stream/transcode', (req, res) => handleTranscodeStream(req, res, false));
router.head('/stream/remux', (req, res) => handleTranscodeStream(req, res, true));
router.get('/stream/remux', (req, res) => handleTranscodeStream(req, res, false));

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 生成分享链接（附二维码与可选 4 位提取码）
router.post('/share', async (req, res) => {
    const { path: targetPath, expireHours, pin } = req.body;
    if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).json({ error: '文件不存在' });
    if (!isSafePath(targetPath)) return res.status(403).json({ error: 'Forbidden' });

    // 64 位熵分享码 + 有效期上限 7 天，防止在线爆破与永久链接
    const shareId = crypto.randomBytes(8).toString('hex');
    const hours = Math.min(Math.max(parseInt(expireHours, 10) || 24, 1), 168);
    const expiresAt = Date.now() + hours * 3600 * 1000;
    const cleanPin = pin ? String(pin).trim() : null;

    state.sharedLinks[shareId] = {
        path: targetPath,
        expiresAt,
        fileName: path.basename(targetPath),
        pin: cleanPin
    };

    const host = req.headers.host || `${state.currentConfig.bindIp && state.currentConfig.bindIp !== '0.0.0.0' ? state.currentConfig.bindIp : getLocalIpAddress()}:${state.currentConfig.port || 3000}`;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const shareUrl = `${protocol}://${host}/api/shared/download/${shareId}`;

    let qrDataUrl = '';
    try {
        const QRCode = require('qrcode');
        qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 300, margin: 1, color: { dark: '#000000ff', light: '#ffffffff' } });
    } catch (e) {}

    res.json({ success: true, shareId, shareUrl, qrDataUrl, expiresAt, hasPin: !!cleanPin });
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
            expiresAt: v.expiresAt,
            hasPin: !!v.pin
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

// 提取共享文件（支持 4 位 PIN 码验证及友好输入页面）
const handleSharedDownload = (req, res) => {
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

    // PIN 提取码校验
    if (item.pin) {
        const userPin = (req.query.pin || (req.body && req.body.pin) || req.headers['x-share-pin'] || req.headers['x-pin'] || '').toString().trim();
        const pinMatches = (userPin === item.pin);

        if (!pinMatches) {
            const isJson = req.headers.accept && req.headers.accept.includes('application/json');
            if (isJson) {
                return res.status(401).json({ error: 'PIN 提取码错误或缺失', requirePin: true });
            }

            const isWrong = userPin.length > 0;
            const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>文件下载提取 - 猫步互联</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
            background: #090a0f;
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .card {
            width: 100%;
            max-width: 400px;
            background: rgba(28, 28, 30, 0.85);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 20px;
            padding: 32px 24px;
            text-align: center;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        .icon {
            width: 64px;
            height: 64px;
            border-radius: 16px;
            background: linear-gradient(135deg, rgba(0,122,255,0.2), rgba(88,86,214,0.2));
            border: 1px solid rgba(0,122,255,0.3);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            margin-bottom: 16px;
        }
        .filename {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            word-break: break-all;
        }
        .sub {
            font-size: 13px;
            color: #8e8e93;
            margin-bottom: 24px;
        }
        .pin-input {
            width: 100%;
            height: 52px;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.18);
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-size: 22px;
            font-weight: 600;
            text-align: center;
            letter-spacing: 6px;
            outline: none;
            transition: border-color 0.2s;
        }
        .pin-input:focus {
            border-color: #007aff;
            box-shadow: 0 0 0 3px rgba(0,122,255,0.25);
        }
        .btn-submit {
            width: 100%;
            height: 48px;
            border-radius: 14px;
            background: #007aff;
            border: none;
            color: #fff;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 16px;
            transition: opacity 0.15s;
        }
        .btn-submit:hover { opacity: 0.9; }
        .error-msg {
            color: #ff453a;
            font-size: 12.5px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🔒</div>
        <div class="filename">${escapeHtml(item.fileName)}</div>
        <div class="sub">该文件受提取码保护，请输入提取码</div>
        <form method="GET" action="">
            <input type="text" name="pin" class="pin-input" maxlength="8" placeholder="••••" autofocus required autocomplete="off">
            <button type="submit" class="btn-submit">验证并下载</button>
            ${isWrong ? '<div class="error-msg">提取码错误，请重新输入</div>' : ''}
        </form>
    </div>
</body>
</html>`;
            return res.status(isWrong ? 403 : 200).send(html);
        }
    }

    historyService.recordTransfer('download', {
        name: item.fileName,
        size: (() => { try { return fs.statSync(item.path).size; } catch (e) { return 0; } })(),
        path: item.path,
        detail: '分享链接提取',
        ip: getCleanIp(req.ip || req.socket?.remoteAddress)
    });

    res.download(item.path, item.fileName);
};

router.get('/shared/download/:shareId', handleSharedDownload);
router.post('/shared/download/:shareId', handleSharedDownload);

module.exports = router;
