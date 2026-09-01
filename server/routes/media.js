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
// 进度条目上限：超过时按更新时间修剪，防止 progressStore 随播放路径无限膨胀
const MAX_PROGRESS_ENTRIES = 4000;
const PRUNE_TO_ENTRIES = 2000;

function pruneProgressStore() {
    const keys = Object.keys(progressStore);
    if (keys.length <= MAX_PROGRESS_ENTRIES) return;
    keys.sort((a, b) => (progressStore[a].updatedAt || 0) - (progressStore[b].updatedAt || 0));
    while (keys.length > PRUNE_TO_ENTRIES) {
        delete progressStore[keys.shift()];
    }
}

function debouncedSaveProgress() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            pruneProgressStore();
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            // 先写临时文件再原子重命名，避免写盘被中断时进度文件损坏
            const tmpFile = PROGRESS_FILE + '.tmp';
            fs.writeFileSync(tmpFile, JSON.stringify(progressStore, null, 2), 'utf8');
            fs.renameSync(tmpFile, PROGRESS_FILE);
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
// Body: { path: '...', time: 123.45, duration: 3600, name?: '文件名.mp4' }
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
        // name 用于播放历史列表展示；旧记录缺失时由 /media/history 按 basename 兜底
        name: (typeof req.body.name === 'string' && req.body.name.trim()) ? req.body.name.trim().slice(0, 300) : (progressStore[targetPath] && progressStore[targetPath].name) || undefined,
        time: t,
        duration: d,
        percentage,
        updatedAt: Date.now()
    };

    debouncedSaveProgress();

    res.json({ success: true, progress: progressStore[targetPath] });
});

// 2.5 播放历史列表（由播放进度派生，无需独立存储）
// GET /api/media/history?limit=200
// 返回按最后播放时间倒序的有效观看记录（从未真正播过的 time=0 且 percentage=0 条目不进历史）
router.get('/media/history', (req, res) => {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const history = Object.values(progressStore)
        .filter(item => item && (item.time > 8 || (item.percentage || 0) > 0))
        .map(item => ({
            path: item.path,
            name: item.name || path.basename(item.path),
            time: item.time || 0,
            duration: item.duration || 0,
            percentage: item.percentage || 0,
            updatedAt: item.updatedAt || 0
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
    res.json({ success: true, history });
});

// 2.6 清空全部播放记录（同时清掉断点续播进度——两者同源）
// DELETE /api/media/progress
router.delete('/media/progress', (req, res) => {
    const count = Object.keys(progressStore).length;
    progressStore = {};
    debouncedSaveProgress();
    res.json({ success: true, cleared: count });
});

// 3.5 媒体资料库目录持久化：服务端统一存储（~/.landisk/media_dirs.json），
//     所有设备共享同一份资料库，服务/Electron 重启不再丢失
const MEDIA_DIRS_FILE = path.join(DATA_DIR, 'media_dirs.json');
let mediaDirs = [];
try {
    if (fs.existsSync(MEDIA_DIRS_FILE)) {
        const arr = JSON.parse(fs.readFileSync(MEDIA_DIRS_FILE, 'utf8'));
        if (Array.isArray(arr)) {
            mediaDirs = arr.filter(p => p && typeof p === 'string' && p.trim());
        }
    }
} catch (e) {
    mediaDirs = [];
}

router.get('/media/dirs', (req, res) => {
    res.json({ success: true, dirs: mediaDirs });
});

router.post('/media/dirs', (req, res) => {
    const { dirs } = req.body || {};
    if (!Array.isArray(dirs)) {
        return res.status(400).json({ error: 'dirs must be an array' });
    }
    mediaDirs = Array.from(new Set(dirs.filter(p => p && typeof p === 'string' && p.trim()))).slice(0, 50);
    try {
        fs.writeFileSync(MEDIA_DIRS_FILE, JSON.stringify(mediaDirs, null, 2), 'utf8');
    } catch (e) {}
    res.json({ success: true, dirs: mediaDirs });
});

// 3. 探查并自动匹配同级目录下的字幕文件
// GET /api/media/subtitles?path=...
router.get('/media/subtitles', async (req, res) => {
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

        // 异步读目录：媒体目录可能包含上万文件，同步 readdirSync 会卡住
        // Node 事件循环，把正在下发的视频流一起顿住
        const files = await fs.promises.readdir(dir);
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
// 编码探测链：BOM → 严格 UTF-8 → GB18030 与 Big5 双解码打分 → 宽松 UTF-8 兜底。
// 难点：GBK 与 Big5 的双字节区间高度重叠，"你好字幕" 的 GBK 字节同样是合法 Big5，
// 固定顺序必然坑掉一边。用「常用简体字 / 常用繁体字」命中率打分选优。
// 此前裸 buffer.toString('utf8') 会把 GBK 字幕解成乱码
const SIMP_INDICATORS = '的一是了我不人在他有这上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下过天去能对小多然于心学种之美好幕视频播放文件名声音字幕翻译校制作组';
const TRAD_INDICATORS = '們來過時對說後東灣島聲學體劇風雲飛馬烏龍臺灣國書門開關長鳥齊廣張讓證應該當點為與裡間題聽覺藝術總經雙優勢獨戰備註釋';

function scoreChineseText(text) {
    let simp = 0;
    let trad = 0;
    for (const ch of text) {
        if (SIMP_INDICATORS.includes(ch)) simp++;
        if (TRAD_INDICATORS.includes(ch)) trad++;
    }
    return { simp, trad };
}

function decodeSubtitleBuffer(buffer) {
    // BOM 直接判定
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return { text: buffer.toString('utf8').replace(/^\uFEFF/, ''), encoding: 'utf-8-sig' };
    }
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return { text: buffer.toString('utf16le').replace(/^\uFEFF/, ''), encoding: 'utf-16le' };
    }

    // 严格 UTF-8：纯 ASCII/标准 UTF-8 字幕在这里直接命中，零误判
    try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''), encoding: 'utf-8' };
    } catch (e) {}

    // GB18030 与 Big5 都严格解一遍，解不出来的一方直接淘汰
    const candidates = [];
    for (const enc of ['gb18030', 'big5']) {
        try {
            candidates.push({ enc, text: new TextDecoder(enc, { fatal: true }).decode(buffer) });
        } catch (e) {}
    }
    if (candidates.length === 1) {
        return { text: candidates[0].text, encoding: candidates[0].enc };
    }
    if (candidates.length === 2) {
        // 双双合法：按简繁常用字命中率选优
        const a = scoreChineseText(candidates[0].text);
        const b = scoreChineseText(candidates[1].text);
        const pick = (a.simp >= b.trad && a.simp > 0 && a.simp >= a.trad)
            ? candidates[0]
            : (b.trad > a.simp ? candidates[1] : candidates[0]);
        return { text: pick.text, encoding: pick.enc };
    }
    // 兜底：宽松解码，宁可出个别乱码也不 500
    return { text: buffer.toString('utf8'), encoding: 'utf-8-lenient' };
}

router.get('/subtitle', async (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).send('Subtitle not found');
    }
    if (!isSafePath(targetPath)) {
        return res.status(403).send('Forbidden');
    }

    try {
        // 异步读：几 MB 的 .ass 大字幕同步读会卡住事件循环，顿住正在下发的视频流
        const buffer = await fs.promises.readFile(targetPath);
        const { text, encoding } = decodeSubtitleBuffer(buffer);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Subtitle-Encoding', encoding);
        res.setHeader('Cache-Control', 'no-cache');
        res.send(text);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 5. 高性能服务端缩略图生成与持久化缓存 API
// GET /api/thumbnail?path=...
// GET /api/media/thumbnail?path=...
const crypto = require('crypto');
const { spawn } = require('child_process');

// 全局 ffmpeg 并发闸门：海报墙冷缓存时几十个缩略图请求会同时 spawn ffmpeg，
// 弱机上 CPU 打满会拖慢正在下发的视频流（尤其远程客户端）。限流到 3 个进程，
// 多余任务排队等槽位；排队本身不影响已在播的视频。
const FFMPEG_CONCURRENCY = 3;
let ffmpegActive = 0;
const ffmpegWaiters = [];
function acquireFfmpegSlot() {
    if (ffmpegActive < FFMPEG_CONCURRENCY) {
        ffmpegActive++;
        return Promise.resolve();
    }
    return new Promise((resolve) => ffmpegWaiters.push(resolve));
}
function releaseFfmpegSlot() {
    const next = ffmpegWaiters.shift();
    if (next) next(); // 槽位直接移交，active 计数不变
    else ffmpegActive--;
}

const THUMB_CACHE_DIR = path.resolve(DATA_DIR, 'thumbnails');
if (!fs.existsSync(THUMB_CACHE_DIR)) {
    try { fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true }); } catch (e) {}
}

// 与 shared/media-types.js 同源的统一白名单（UMD 模块可直接 require）
const MediaTypes = require('../../shared/media-types');
const VIDEO_EXT_RE = MediaTypes.VIDEO_RE;
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|bmp|gif|svg)$/i;

const sendThumb = (filePath, req, res) => {
    try {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        const stream = fs.createReadStream(filePath);
        stream.on('error', (err) => {
            if (!res.headersSent) res.status(500).send('Error reading thumbnail');
        });
        // 客户端断开时销毁读取流，避免 fd 泄漏
        req.on('close', () => stream.destroy());
        stream.pipe(res);
    } catch (e) {
        if (!res.headersSent) res.status(500).send(e.message);
    }
};

// 生成缩略图：先写 .part 再原子改名；第 3 秒失败回退第 0 秒；每个尝试 8s 超时
// 走全局 ffmpeg 闸门限流，防止冷缓存海报墙拖垮视频流
async function generateThumb(targetPath, thumbFile) {
    const partFile = thumbFile + '.part';
    const rmPart = () => { try { fs.unlinkSync(partFile); } catch (e) {} };
    const run = (ss) => new Promise((r) => {
        const proc = spawn('ffmpeg', [
            '-ss', ss,
            '-i', targetPath,
            '-vframes', '1',
            '-filter:v', 'scale=360:-1',
            '-q:v', '3',
            // .part 中间名无法被 ffmpeg 推断封装格式，必须显式指定 image2
            '-f', 'image2',
            partFile,
            '-y'
        ], { windowsHide: true });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            try { proc.kill(); } catch (e) {}
        }, 8000);
        proc.on('close', (code) => {
            clearTimeout(timer);
            r(timedOut ? 'timeout' : (code === 0 ? 'ok' : 'fail'));
        });
        proc.on('error', () => {
            clearTimeout(timer);
            r('error');
        });
    });

    await acquireFfmpegSlot();
    try {
        try { fs.unlinkSync(partFile); } catch (e) {}
        let result = await run('00:00:03');
        if (result !== 'ok') {
            rmPart();
            // 视频不足 3 秒时从第 0 秒回退重试
            result = await run('00:00:00.1');
        }
        if (result === 'ok' && fs.existsSync(partFile) && fs.statSync(partFile).size > 0) {
            fs.renameSync(partFile, thumbFile);
            return true;
        }
        rmPart();
        return false;
    } finally {
        releaseFfmpegSlot();
    }
}

// 同视频并发请求复用同一个 ffmpeg 任务，避免海报墙瞬间 spawn 十几个进程
const thumbJobs = new Map(); // thumbFile -> Promise<boolean>

const handleThumbnail = async (req, res) => {
    const targetPath = req.query.path;
    if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).send('File not found');
    }
    if (!isSafePath(targetPath)) {
        return res.status(403).send('Forbidden');
    }

    try {
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
            return res.status(400).send('Target is a directory');
        }

        // 如果是图片格式，直接响应（带强缓存头）
        if (IMAGE_EXT_RE.test(targetPath)) {
            res.setHeader('Cache-Control', 'public, max-age=604800');
            const stream = fs.createReadStream(targetPath);
            req.on('close', () => stream.destroy());
            return stream.pipe(res);
        }

        // 如果不是视频格式，不支持截图
        if (!VIDEO_EXT_RE.test(targetPath)) {
            return res.status(415).send('Unsupported media type for thumbnail');
        }

        // 0. 本地同级海报/封面图自动探查（0 CPU 开销，优先秒级直通高清本地海报）
        const dir = path.dirname(targetPath);
        const ext = path.extname(targetPath);
        const base = path.basename(targetPath, ext);
        const candidates = [
            path.join(dir, `${base}.jpg`),
            path.join(dir, `${base}.png`),
            path.join(dir, `${base}.jpeg`),
            path.join(dir, `${base}.webp`),
            path.join(dir, `${base}.poster.jpg`),
            path.join(dir, `${base}-poster.jpg`),
            path.join(dir, 'poster.jpg'),
            path.join(dir, 'cover.jpg'),
            path.join(dir, 'folder.jpg'),
            path.join(dir, 'poster.png'),
            path.join(dir, 'cover.png')
        ];
        for (const cand of candidates) {
            if (fs.existsSync(cand)) {
                try {
                    const candStat = fs.statSync(cand);
                    if (candStat.isFile() && candStat.size > 0) {
                        res.setHeader('Content-Type', cand.endsWith('.png') ? 'image/png' : (cand.endsWith('.webp') ? 'image/webp' : 'image/jpeg'));
                        res.setHeader('Cache-Control', 'public, max-age=604800');
                        const s = fs.createReadStream(cand);
                        req.on('close', () => s.destroy());
                        return s.pipe(res);
                    }
                } catch (e) {}
            }
        }

        // 计算唯一缓存文件名（基于路径与最后修改时间）
        const hash = crypto.createHash('md5').update(`${targetPath}_${stat.mtimeMs}`).digest('hex');
        const thumbFile = path.resolve(THUMB_CACHE_DIR, `${hash}.jpg`);

        // 1. 若磁盘已有生成好的缓存，秒级直接返回
        if (fs.existsSync(thumbFile) && fs.statSync(thumbFile).size > 0) {
            return sendThumb(thumbFile, req, res);
        }

        // 2. 服务端 ffmpeg 截取视频关键帧（高质量并限制分辨率 360px 宽度以提速）
        let job = thumbJobs.get(thumbFile);
        if (!job) {
            job = generateThumb(targetPath, thumbFile);
            thumbJobs.set(thumbFile, job);
            job.finally(() => thumbJobs.delete(thumbFile)).catch(() => {});
        }
        const ok = await job;
        if (ok) {
            return sendThumb(thumbFile, req, res);
        }
        res.status(500).send('Failed to generate thumbnail');
    } catch (err) {
        if (!res.headersSent) res.status(500).send(err.message);
    }
};

router.get('/thumbnail', handleThumbnail);
router.get('/media/thumbnail', handleThumbnail);

// 6. 进度条悬停/拖拽缩略图预览
// GET /api/media/preview?path=...&t=125.4
// 与海报缩略图同一套 ffmpeg 管线，只是时间点由请求指定。时间按 5 秒分桶，
// 让同一段反复悬停命中同一张磁盘缓存；尺寸压到 192px 宽，单张几 KB
const PREVIEW_CACHE_DIR = path.resolve(DATA_DIR, 'previews');
if (!fs.existsSync(PREVIEW_CACHE_DIR)) {
    try { fs.mkdirSync(PREVIEW_CACHE_DIR, { recursive: true }); } catch (e) {}
}

const previewJobs = new Map(); // previewFile -> Promise<boolean>

// 与缩略图同一 ffmpeg 闸门限流
async function generatePreview(targetPath, previewFile, ssSeconds) {
    const partFile = previewFile + '.part';
    const rmPart = () => { try { fs.unlinkSync(partFile); } catch (e) {} };

    await acquireFfmpegSlot();
    try {
        return await new Promise((resolve) => {
            // -ss 放在 -i 之前走关键帧快照，秒级定位；时间格式 s.mmm
            // .part 中间名无法被 ffmpeg 推断封装格式，必须显式指定 image2
            const proc = spawn('ffmpeg', [
                '-ss', ssSeconds.toFixed(3),
                '-i', targetPath,
                '-vframes', '1',
                '-filter:v', 'scale=192:-1',
                '-q:v', '5',
                '-f', 'image2',
                partFile,
                '-y'
            ], { windowsHide: true });
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                try { proc.kill(); } catch (e) {}
            }, 5000);
            proc.on('close', (code) => {
                clearTimeout(timer);
                if (!timedOut && code === 0 && fs.existsSync(partFile) && fs.statSync(partFile).size > 0) {
                    try { fs.renameSync(partFile, previewFile); resolve(true); return; } catch (e) {}
                }
                rmPart();
                resolve(false);
            });
            proc.on('error', () => {
                clearTimeout(timer);
                rmPart();
                resolve(false);
            });
        });
    } finally {
        releaseFfmpegSlot();
    }
}

const handlePreview = async (req, res) => {
    const targetPath = req.query.path;
    const t = parseFloat(req.query.t);
    if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).send('File not found');
    }
    if (!isSafePath(targetPath)) {
        return res.status(403).send('Forbidden');
    }
    if (isNaN(t) || t < 0 || t > 86400) {
        return res.status(400).send('Invalid time');
    }

    try {
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory() || !VIDEO_EXT_RE.test(targetPath)) {
            return res.status(415).send('Unsupported media type for preview');
        }

        const hash = crypto.createHash('md5').update(`${targetPath}_${stat.mtimeMs}`).digest('hex');
        const bucket = Math.floor(t / 5) * 5;
        const previewFile = path.resolve(PREVIEW_CACHE_DIR, `${hash}_${bucket}.jpg`);

        if (fs.existsSync(previewFile) && fs.statSync(previewFile).size > 0) {
            return sendThumb(previewFile, req, res);
        }

        let job = previewJobs.get(previewFile);
        if (!job) {
            job = generatePreview(targetPath, previewFile, bucket);
            previewJobs.set(previewFile, job);
            job.finally(() => previewJobs.delete(previewFile)).catch(() => {});
        }
        const ok = await job;
        if (ok) {
            return sendThumb(previewFile, req, res);
        }
        res.status(500).send('Failed to generate preview');
    } catch (err) {
        if (!res.headersSent) res.status(500).send(err.message);
    }
};

router.get('/media/preview', handlePreview);
router.get('/preview', handlePreview);

module.exports = router;
