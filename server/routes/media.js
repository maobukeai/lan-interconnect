/**
 * 猫步互联 · 影音媒体服务路由 (Media Router)
 * 1. 播放进度与断点续播 API (/media/progress)
 * 2. 同名字幕自动探查与匹配 API (/media/subtitles)
 * 3. 外挂字幕流式输出与编码规范化 API (/subtitle)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { state, isSafePath, DATA_DIR } = require('../config');

// 媒体播放进度文件持久化路径
const PROGRESS_FILE = path.join(DATA_DIR, 'media_progress.json');

// 内存中缓存的进度映射
let progressStore = {};

// 初始化加载本地历史播放进度
try {
    if (fs.existsSync(PROGRESS_FILE)) {
        const raw = fs.readFileSync(PROGRESS_FILE, 'utf8');
        progressStore = JSON.parse(raw) || {};
    }
} catch (e) {
    progressStore = {};
}

let saveTimer = null;
function debouncedSaveProgress() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressStore, null, 2), 'utf8');
        } catch (e) {
            console.error('[Media] Failed to save media progress:', e.message);
        }
    }, 1500);
}

// 1. 获取播放进度
// GET /api/media/progress?path=...
// 若传入 path 返回该视频的单条进度；若未传入 path 返回全量进度字典
router.get('/media/progress', (req, res) => {
    const targetPath = req.query.path;
    if (targetPath) {
        const item = progressStore[targetPath];
        if (item) {
            return res.json({ success: true, progress: item });
        }
        return res.json({ success: true, progress: { path: targetPath, time: 0, duration: 0, percentage: 0 } });
    }
    res.json({ success: true, progressMap: progressStore });
});

// 2. 更新/保存播放进度
// POST /api/media/progress
// Body: { path: '...', time: 123.45, duration: 3600 }
router.post('/media/progress', (req, res) => {
    const { path: targetPath, time, duration } = req.body || {};
    if (!targetPath || typeof targetPath !== 'string') {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    const t = Math.max(0, parseFloat(time) || 0);
    const d = Math.max(0, parseFloat(duration) || 0);
    const percentage = d > 0 ? Math.min(100, Math.max(0, Math.round((t / d) * 100))) : 0;

    progressStore[targetPath] = {
        path: targetPath,
        time: t,
        duration: d,
        percentage,
        updatedAt: Date.now()
    };

    debouncedSaveProgress();

    res.json({ success: true, progress: progressStore[targetPath] });
});

// 3. 探查并自动匹配同级目录下的字幕文件
// GET /api/media/subtitles?path=...
router.get('/media/subtitles', (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).json({ error: 'Video file not found' });
    }
    if (!isSafePath(targetPath)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const dir = path.dirname(targetPath);
        const ext = path.extname(targetPath);
        const baseName = path.basename(targetPath, ext);

        const files = fs.readdirSync(dir);
        const subExts = ['.srt', '.vtt', '.ass', '.ssa'];
        const matched = [];

        for (const file of files) {
            const fileExt = path.extname(file).toLowerCase();
            if (!subExts.includes(fileExt)) continue;

            const fileBase = path.basename(file, fileExt);

            // 匹配同名前缀字幕 (例如 Movie.2024.mp4 匹配 Movie.2024.srt, Movie.2024.zh.srt, Movie.2024.chs.vtt 等)
            if (fileBase.startsWith(baseName)) {
                const subPath = path.join(dir, file);
                
                // 智能识别语言标签
                let label = '默认字幕';
                const lower = file.toLowerCase();
                if (lower.includes('zh') || lower.includes('chs') || lower.includes('sc') || lower.includes('简') || lower.includes('chinese')) {
                    label = '中文 (简体)';
                } else if (lower.includes('cht') || lower.includes('tc') || lower.includes('繁')) {
                    label = '中文 (繁体)';
                } else if (lower.includes('en') || lower.includes('eng') || lower.includes('english')) {
                    label = 'English (英文)';
                } else if (lower.includes('ja') || lower.includes('jp') || lower.includes('japanese')) {
                    label = '日本語 (日文)';
                } else if (fileBase === baseName) {
                    label = `同名字幕 (${fileExt.slice(1).toUpperCase()})`;
                } else {
                    label = `${file} (${fileExt.slice(1).toUpperCase()})`;
                }

                matched.push({
                    name: label,
                    fileName: file,
                    path: subPath,
                    format: fileExt.slice(1).toLowerCase(),
                    url: `/api/subtitle?path=${encodeURIComponent(subPath)}`
                });
            }
        }

        res.json({ success: true, subtitles: matched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. 读取字幕文件内容并提供标准 UTF-8 编码流
// GET /api/subtitle?path=...
router.get('/subtitle', (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).send('Subtitle not found');
    }
    if (!isSafePath(targetPath)) {
        return res.status(403).send('Forbidden');
    }

    try {
        const buffer = fs.readFileSync(targetPath);
        const content = buffer.toString('utf8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(content);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

module.exports = router;
