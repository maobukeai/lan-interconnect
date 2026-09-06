/**
 * 猫步互联 · 学习计划与课程督学服务路由 (Study Plan Router)
 * 1. 课程目录智能扫描与自动排课 API (POST /api/study/scan-course)
 * 2. 计划管理 CRUD API (/api/study/plans)
 * 3. 学习打卡、任务标记与连胜统计 API (/api/study/records, /api/study/punch-in, /api/study/tasks/toggle)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { DATA_DIR, isSafePath, addStudyPath, removeStudyPath } = require('../config');
const { checkSensitive } = require('../middleware/auth');

const PLANS_FILE = path.join(DATA_DIR, 'study_plans.json');
const RECORDS_FILE = path.join(DATA_DIR, 'study_records.json');

// 内存缓存
let plansStore = [];
let recordsStore = {};

function formatBytes(b) {
    if (!+b) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1);
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getYesterdayDateString() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateString(d);
}

const { execFile } = require('child_process');

let cachedFfprobeBin = null;
function getFfprobeBin() {
    if (cachedFfprobeBin) return cachedFfprobeBin;
    const candidates = [
        'C:\\Users\\20269\\scoop\\shims\\ffprobe.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ffmpeg', 'bin', 'ffprobe.exe'),
        path.join(process.env.ProgramFiles || '', 'ffmpeg', 'bin', 'ffprobe.exe'),
        'ffprobe'
    ];
    for (const c of candidates) {
        if (c === 'ffprobe') {
            cachedFfprobeBin = 'ffprobe';
            return 'ffprobe';
        }
        if (fs.existsSync(c)) {
            cachedFfprobeBin = c;
            return c;
        }
    }
    cachedFfprobeBin = 'ffprobe';
    return 'ffprobe';
}

function probeVideoDuration(filePath) {
    return new Promise(resolve => {
        const bin = getFfprobeBin();
        execFile(bin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], { windowsHide: true }, (err, stdout) => {
            if (err || !stdout) return resolve(0);
            const sec = Math.round(parseFloat(stdout.trim()) || 0);
            resolve(sec);
        });
    });
}

function formatDuration(sec) {
    if (!sec || sec <= 0) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDurationChinese(sec) {
    if (!sec || sec <= 0) return '0 分钟';
    if (sec >= 3600) {
        const h = (sec / 3600).toFixed(1);
        return `${h} 小时`;
    }
    const m = Math.max(1, Math.round(sec / 60));
    return `${m} 分钟`;
}

// 初始化加载持久化数据
function loadPersistence() {
    try {
        if (fs.existsSync(PLANS_FILE)) {
            const raw = fs.readFileSync(PLANS_FILE, 'utf8');
            plansStore = JSON.parse(raw) || [];
            if (Array.isArray(plansStore)) {
                plansStore.forEach(p => {
                    if (p && p.coursePath) addStudyPath(p.coursePath);
                });
            } else {
                plansStore = [];
            }
        }
    } catch (e) {
        plansStore = [];
    }

    try {
        if (fs.existsSync(RECORDS_FILE)) {
            const raw = fs.readFileSync(RECORDS_FILE, 'utf8');
            recordsStore = JSON.parse(raw) || {};
        }
    } catch (e) {
        recordsStore = {};
    }
}

loadPersistence();

function savePlans() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = PLANS_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(plansStore, null, 2), 'utf8');
        fs.renameSync(tmp, PLANS_FILE);
    } catch (e) {
        console.error('[Study] Failed to save study plans:', e.message);
    }
}

function saveRecords() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = RECORDS_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(recordsStore, null, 2), 'utf8');
        fs.renameSync(tmp, RECORDS_FILE);
    } catch (e) {
        console.error('[Study] Failed to save study records:', e.message);
    }
}

// 视频扩展名集合
const VIDEO_EXTS = new Set(['.mp4', '.ts', '.mkv', '.webm', '.mov', '.avi', '.flv', '.m4v']);
// 课件与工程文件扩展名集合
const COURSEWARE_EXTS = new Set(['.rar', '.zip', '.7z', '.tar', '.gz', '.blend', '.fbx', '.obj', '.pdf']);

// 1. 扫描课程目录与自动排课
// POST /api/study/scan-course
router.post('/study/scan-course', checkSensitive, async (req, res) => {
    try {
        const { coursePath, targetDays, lessonsPerDay, scheduleMode, dailyMinutes } = req.body || {};
        if (!coursePath || typeof coursePath !== 'string') {
            return res.status(400).json({ success: false, error: '请提供有效的课程目录路径' });
        }

        const resolvedPath = path.resolve(coursePath);
        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ success: false, error: '指定的课程目录不存在: ' + resolvedPath });
        }

        const stat = await fsp.stat(resolvedPath);
        if (!stat.isDirectory()) {
            return res.status(400).json({ success: false, error: '指定路径不是文件夹目录' });
        }

        // 注册到安全放行白名单中，保证流式播放和文件查看直通
        addStudyPath(resolvedPath);

        // 递归探测一级子目录，识别视频和课件
        const dirEntries = await fsp.readdir(resolvedPath, { withFileTypes: true });
        const videoFiles = [];
        const coursewareFiles = [];

        for (const entry of dirEntries) {
            const fullEntryPath = path.join(resolvedPath, entry.name);
            if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (VIDEO_EXTS.has(ext)) {
                    let s = { size: 0 };
                    try { s = await fsp.stat(fullEntryPath); } catch (e) {}
                    videoFiles.push({
                        name: entry.name,
                        path: fullEntryPath,
                        size: s.size,
                        sizeFormatted: formatBytes(s.size),
                        ext
                    });
                } else if (COURSEWARE_EXTS.has(ext)) {
                    let s = { size: 0 };
                    try { s = await fsp.stat(fullEntryPath); } catch (e) {}
                    coursewareFiles.push({
                        name: entry.name,
                        path: fullEntryPath,
                        relativePath: entry.name,
                        size: s.size,
                        sizeFormatted: formatBytes(s.size),
                        ext
                    });
                }
            } else if (entry.isDirectory()) {
                // 探测课件子文件夹（例如：【课件】Blender-硬表面建模精讲入门课）
                try {
                    const subEntries = await fsp.readdir(fullEntryPath, { withFileTypes: true });
                    for (const sub of subEntries) {
                        if (sub.isFile()) {
                            const ext = path.extname(sub.name).toLowerCase();
                            const subFullPath = path.join(fullEntryPath, sub.name);
                            if (COURSEWARE_EXTS.has(ext)) {
                                let s = { size: 0 };
                                try { s = await fsp.stat(subFullPath); } catch (e) {}
                                coursewareFiles.push({
                                    name: sub.name,
                                    path: subFullPath,
                                    relativePath: path.join(entry.name, sub.name),
                                    size: s.size,
                                    sizeFormatted: formatBytes(s.size),
                                    ext
                                });
                            } else if (VIDEO_EXTS.has(ext)) {
                                let s = { size: 0 };
                                try { s = await fsp.stat(subFullPath); } catch (e) {}
                                videoFiles.push({
                                    name: `${entry.name}/${sub.name}`,
                                    path: subFullPath,
                                    size: s.size,
                                    sizeFormatted: formatBytes(s.size),
                                    ext
                                });
                            }
                        }
                    }
                } catch (subErr) {}
            }
        }

        // 自然语义排序 (Natural Numeric Sort: 1, 2, 10, 51, 61, 134)
        videoFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        // 并发探测音视频时长（批次并发上限 8）
        const probeConcurrency = 8;
        let probeIdx = 0;
        const durations = new Array(videoFiles.length).fill(0);
        async function probeWorker() {
            while (probeIdx < videoFiles.length) {
                const cur = probeIdx++;
                try {
                    durations[cur] = await probeVideoDuration(videoFiles[cur].path);
                } catch (e) {
                    durations[cur] = 0;
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(probeConcurrency, videoFiles.length) }, () => probeWorker()));

        let totalCourseDurationSec = 0;
        const lessons = videoFiles.map((f, i) => {
            const rawTitle = path.basename(f.name).replace(/\.[^/.]+$/, '');
            let durSec = durations[i] || 0;
            // 兜底估算：若未能探测到元数据，按平均 1.5Mbps 码率根据文件大小粗略估算
            if (durSec <= 0 && f.size > 0) {
                durSec = Math.max(60, Math.round(f.size / (1024 * 180)));
            }
            totalCourseDurationSec += durSec;
            return {
                index: i + 1,
                name: path.basename(f.name),
                title: rawTitle,
                path: f.path,
                size: f.size,
                sizeFormatted: f.sizeFormatted,
                ext: f.ext,
                duration: durSec,
                durationFormatted: formatDuration(durSec)
            };
        });

        // 排课模式判定：'duration'（按学习时长智能装箱平衡，推荐）或 'lessons'（按固定课时数）
        const mode = scheduleMode ? (scheduleMode === 'lessons' ? 'lessons' : 'duration') : (lessonsPerDay ? 'lessons' : 'duration');
        const targetDailyMin = parseInt(dailyMinutes, 10) || 45;
        const targetDailySec = targetDailyMin * 60;
        let perDay = parseInt(lessonsPerDay, 10) || 4;
        let days = parseInt(targetDays, 10);
        const total = lessons.length;

        function generateDaySchedule(dayNum, dayLessons) {
            const firstL = dayLessons[0];
            const lastL = dayLessons[dayLessons.length - 1];
            const dayDurationSec = dayLessons.reduce((sum, l) => sum + (l.duration || 0), 0);
            const dayMin = Math.round(dayDurationSec / 60);

            // 智能实操练习生成
            const practiceTasks = [
                `完成第 ${firstL.index} ~ ${lastL.index} 节核心知识点跟练（${firstL.title.slice(0, 16)}...）`,
                `针对当天案例进行独立建模实操，记录布线技巧并导出渲染预览`
            ];

            const combinedTitle = dayLessons.map(l => l.title).join(' ');
            if (/boxcutter/i.test(combinedTitle)) {
                practiceTasks.push('熟悉 Boxcutter 快捷切割模式、吸附功能与平面的布尔应用');
            } else if (/hardops|hops/i.test(combinedTitle)) {
                practiceTasks.push('练习 HardOps 倒角管理、锐化以及镜像对齐修改器');
            } else if (/meshmachine/i.test(combinedTitle)) {
                practiceTasks.push('掌握 MeshMachine 角度边选择、反倒角与布尔清理技巧');
            } else if (/机械臂/i.test(combinedTitle)) {
                practiceTasks.push('完成机械臂分段零件的起手布尔分析与斜面处理');
            } else if (/贴花|decal/i.test(combinedTitle)) {
                practiceTasks.push('实操 DecalMachine 贴花对齐、Trim裁剪片切割与四边形展开');
            }

            return {
                day: dayNum,
                title: `第 ${dayNum} 天：第 ${firstL.index} - ${lastL.index} 节${dayMin > 0 ? ` (约 ${dayMin} 分钟)` : ''}`,
                summary: dayLessons.map(l => l.title).join(' · '),
                lessonIndices: dayLessons.map(l => l.index),
                durationSec: dayDurationSec,
                durationFormatted: formatDurationChinese(dayDurationSec),
                practiceTasks
            };
        }

        const dailySchedule = [];

        if (mode === 'duration') {
            // 时长智能装箱：根据每节课实际时长进行舒适装箱，保持每天时长在合理目标区间
            let currentDayLessons = [];
            let currentDaySec = 0;
            let currentDayNum = 1;

            for (let i = 0; i < lessons.length; i++) {
                const lesson = lessons[i];
                const dur = lesson.duration || 600;

                // 结转新一天判断：
                // 1. 当前时长已达到目标 75% 以上，再装入下一课会超出 125%
                // 2. 当前天累计时长已完全达到或超过了每日目标
                const wouldOverShoot = (currentDaySec >= targetDailySec * 0.75) && (currentDaySec + dur > targetDailySec * 1.25);
                const reachedGoal = currentDaySec >= targetDailySec;

                if (currentDayLessons.length > 0 && (wouldOverShoot || reachedGoal)) {
                    dailySchedule.push(generateDaySchedule(currentDayNum++, currentDayLessons));
                    currentDayLessons = [lesson];
                    currentDaySec = dur;
                } else {
                    currentDayLessons.push(lesson);
                    currentDaySec += dur;
                }
            }
            if (currentDayLessons.length > 0) {
                dailySchedule.push(generateDaySchedule(currentDayNum++, currentDayLessons));
            }
            days = dailySchedule.length;
            perDay = Math.max(1, Math.round(total / days));
        } else {
            // 固定课时数排课
            if (!perDay || perDay <= 0) {
                if (days && days > 0) {
                    perDay = Math.max(1, Math.ceil(total / days));
                } else {
                    perDay = 4;
                    days = Math.max(1, Math.ceil(total / perDay));
                }
            } else {
                days = Math.max(1, Math.ceil(total / perDay));
            }

            for (let d = 1; d <= days; d++) {
                const startIdx = (d - 1) * perDay;
                const endIdx = Math.min(total, d * perDay);
                const dayLessons = lessons.slice(startIdx, endIdx);
                if (dayLessons.length === 0) break;
                dailySchedule.push(generateDaySchedule(d, dayLessons));
            }
        }

        res.json({
            success: true,
            coursePath: resolvedPath,
            totalLessons: total,
            lessons,
            courseware: coursewareFiles,
            scheduleMode: mode,
            dailyMinutes: targetDailyMin,
            dailyLessons: perDay,
            targetDays: dailySchedule.length,
            totalDurationSec: totalCourseDurationSec,
            totalDurationFormatted: formatDurationChinese(totalCourseDurationSec),
            dailySchedule
        });
    } catch (err) {
        console.error('[Study Scan Error]:', err);
        res.status(500).json({ success: false, error: '扫描课程目录失败: ' + err.message });
    }
});

// 2. 计划列表
// GET /api/study/plans
router.get('/study/plans', (req, res) => {
    loadPersistence();
    const today = getLocalDateString();
    const result = plansStore.map(plan => {
        const record = recordsStore[plan.id] || { completedLessons: [], completedTasks: {}, streak: 0, punchInDates: [] };
        const completedCount = (record.completedLessons || []).length;
        const total = plan.totalLessons || (plan.lessons ? plan.lessons.length : 0);
        const percent = total > 0 ? Math.min(100, Math.round((completedCount / total) * 100)) : 0;
        const isPunchedToday = (record.punchInDates || []).includes(today);

        const completedSet = new Set(record.completedLessons || []);
        const completedDurSec = (plan.lessons || []).reduce((sum, l) => completedSet.has(l.index) ? sum + (l.duration || 0) : sum, 0);

        return {
            id: plan.id,
            title: plan.title,
            coursePath: plan.coursePath,
            description: plan.description,
            totalLessons: total,
            targetDays: plan.targetDays,
            dailyLessons: plan.dailyLessons,
            scheduleMode: plan.scheduleMode || 'duration',
            dailyMinutes: plan.dailyMinutes || 45,
            totalDurationSec: plan.totalDurationSec || 0,
            totalDurationFormatted: plan.totalDurationFormatted || formatDurationChinese(plan.totalDurationSec || 0),
            completedDurationSec: completedDurSec,
            completedDurationFormatted: formatDurationChinese(completedDurSec),
            completedLessonsCount: completedCount,
            progressPercent: percent,
            streak: record.streak || 0,
            isPunchedToday,
            coursewareCount: (plan.courseware || []).length,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt
        };
    });
    res.json({ success: true, plans: result });
});

// 3. 计划详情
// GET /api/study/plans/:id
router.get('/study/plans/:id', (req, res) => {
    loadPersistence();
    const plan = plansStore.find(p => p.id === req.params.id);
    if (!plan) {
        return res.status(404).json({ success: false, error: '未找到指定的学习计划' });
    }
    const today = getLocalDateString();
    const record = recordsStore[plan.id] || { completedLessons: [], completedTasks: {}, streak: 0, punchInDates: [], dailyNotes: {} };
    const isPunchedToday = (record.punchInDates || []).includes(today);

    const completedSet = new Set(record.completedLessons || []);
    const completedDurSec = (plan.lessons || []).reduce((sum, l) => completedSet.has(l.index) ? sum + (l.duration || 0) : sum, 0);
    const planWithDuration = {
        ...plan,
        completedDurationSec: completedDurSec,
        completedDurationFormatted: formatDurationChinese(completedDurSec)
    };

    res.json({
        success: true,
        plan: planWithDuration,
        record: {
            ...record,
            isPunchedToday
        }
    });
});

// 4. 创建学习计划
// POST /api/study/plans
router.post('/study/plans', checkSensitive, (req, res) => {
    try {
        const { title, coursePath, description, totalLessons, targetDays, dailyLessons, scheduleMode, dailyMinutes, totalDurationSec, totalDurationFormatted, lessons, courseware, dailySchedule } = req.body || {};
        if (!title || !coursePath || !lessons || !Array.isArray(lessons) || lessons.length === 0) {
            return res.status(400).json({ success: false, error: '缺少计划标题、课程路径或课程列表' });
        }

        const id = 'plan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const calcDurationSec = parseInt(totalDurationSec, 10) || lessons.reduce((sum, l) => sum + (l.duration || 0), 0);
        const newPlan = {
            id,
            title: String(title).trim(),
            coursePath: path.resolve(coursePath),
            description: String(description || '').trim(),
            totalLessons: parseInt(totalLessons, 10) || lessons.length,
            targetDays: parseInt(targetDays, 10) || (dailySchedule ? dailySchedule.length : 30),
            dailyLessons: parseInt(dailyLessons, 10) || 4,
            scheduleMode: scheduleMode || 'duration',
            dailyMinutes: parseInt(dailyMinutes, 10) || 45,
            totalDurationSec: calcDurationSec,
            totalDurationFormatted: totalDurationFormatted || formatDurationChinese(calcDurationSec),
            lessons,
            courseware: Array.isArray(courseware) ? courseware : [],
            dailySchedule: Array.isArray(dailySchedule) ? dailySchedule : [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // 注册到安全白名单
        addStudyPath(newPlan.coursePath);

        plansStore.unshift(newPlan);
        savePlans();

        res.json({ success: true, plan: newPlan });
    } catch (err) {
        res.status(500).json({ success: false, error: '保存学习计划失败: ' + err.message });
    }
});

// 5. 更新学习计划
// PUT /api/study/plans/:id
router.put('/study/plans/:id', checkSensitive, (req, res) => {
    const idx = plansStore.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ success: false, error: '未找到指定的学习计划' });
    }

    const { title, description, dailySchedule, dailyLessons, targetDays, coursePath, scheduleMode, dailyMinutes, totalDurationSec, totalDurationFormatted } = req.body || {};
    const plan = plansStore[idx];

    if (title !== undefined) plan.title = String(title).trim();
    if (description !== undefined) plan.description = String(description).trim();
    if (dailySchedule !== undefined && Array.isArray(dailySchedule)) plan.dailySchedule = dailySchedule;
    if (dailyLessons !== undefined) plan.dailyLessons = parseInt(dailyLessons, 10) || plan.dailyLessons;
    if (targetDays !== undefined) plan.targetDays = parseInt(targetDays, 10) || plan.targetDays;
    if (scheduleMode !== undefined) plan.scheduleMode = scheduleMode;
    if (dailyMinutes !== undefined) plan.dailyMinutes = parseInt(dailyMinutes, 10) || plan.dailyMinutes;
    if (totalDurationSec !== undefined) plan.totalDurationSec = parseInt(totalDurationSec, 10);
    if (totalDurationFormatted !== undefined) plan.totalDurationFormatted = totalDurationFormatted;
    if (coursePath !== undefined && typeof coursePath === 'string') {
        plan.coursePath = path.resolve(coursePath);
        addStudyPath(plan.coursePath);
    }
    plan.updatedAt = new Date().toISOString();

    savePlans();
    res.json({ success: true, plan });
});

// 6. 删除学习计划
// DELETE /api/study/plans/:id
router.delete('/study/plans/:id', checkSensitive, (req, res) => {
    const id = req.params.id;
    const idx = plansStore.findIndex(p => p.id === id);
    if (idx === -1) {
        return res.status(404).json({ success: false, error: '未找到指定的学习计划' });
    }

    const [deleted] = plansStore.splice(idx, 1);
    if (deleted && deleted.coursePath) {
        // 检查是否还有其他计划使用此目录
        const stillInUse = plansStore.some(p => p.coursePath.toLowerCase() === deleted.coursePath.toLowerCase());
        if (!stillInUse) removeStudyPath(deleted.coursePath);
    }
    savePlans();

    // 同时清理记录
    if (recordsStore[id]) {
        delete recordsStore[id];
        saveRecords();
    }

    res.json({ success: true, message: '学习计划已成功删除' });
});

// 7. 获取计划学习记录
// GET /api/study/records/:planId
router.get('/study/records/:planId', (req, res) => {
    const planId = req.params.planId;
    const today = getLocalDateString();
    const record = recordsStore[planId] || {
        completedLessons: [],
        completedTasks: {},
        punchInDates: [],
        streak: 0,
        lastPunchInDate: '',
        dailyNotes: {}
    };

    res.json({
        success: true,
        record: {
            ...record,
            isPunchedToday: (record.punchInDates || []).includes(today)
        }
    });
});

// 8. 标记完成/取消完成任务（课时或实操任务）
// POST /api/study/tasks/toggle
router.post('/study/tasks/toggle', (req, res) => {
    const { planId, type, id, completed } = req.body || {};
    if (!planId || !type || id === undefined) {
        return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    if (!recordsStore[planId]) {
        recordsStore[planId] = {
            completedLessons: [],
            completedTasks: {},
            punchInDates: [],
            streak: 0,
            lastPunchInDate: '',
            dailyNotes: {}
        };
    }

    const record = recordsStore[planId];
    if (type === 'lesson') {
        const lessonIdx = parseInt(id, 10);
        const set = new Set(record.completedLessons || []);
        if (completed) {
            set.add(lessonIdx);
        } else {
            set.delete(lessonIdx);
        }
        record.completedLessons = Array.from(set).sort((a, b) => a - b);
    } else if (type === 'practice') {
        if (!record.completedTasks) record.completedTasks = {};
        record.completedTasks[id] = !!completed;
    }

    record.updatedAt = new Date().toISOString();
    saveRecords();

    res.json({
        success: true,
        completedLessons: record.completedLessons,
        completedTasks: record.completedTasks
    });
});

// 9. 每日学习打卡
// POST /api/study/punch-in
router.post('/study/punch-in', (req, res) => {
    const { planId, note } = req.body || {};
    if (!planId) {
        return res.status(400).json({ success: false, error: '请指定需要打卡的学习计划 ID' });
    }

    if (!recordsStore[planId]) {
        recordsStore[planId] = {
            completedLessons: [],
            completedTasks: {},
            punchInDates: [],
            streak: 0,
            lastPunchInDate: '',
            dailyNotes: {}
        };
    }

    const record = recordsStore[planId];
    const today = getLocalDateString();
    const yesterday = getYesterdayDateString();

    if (!record.punchInDates) record.punchInDates = [];
    if (!record.dailyNotes) record.dailyNotes = {};

    let isNewPunch = false;
    if (!record.punchInDates.includes(today)) {
        record.punchInDates.push(today);
        isNewPunch = true;

        if (record.lastPunchInDate === yesterday) {
            record.streak = (record.streak || 0) + 1;
        } else {
            record.streak = 1;
        }
        record.lastPunchInDate = today;
    }

    if (note && typeof note === 'string') {
        record.dailyNotes[today] = note.trim().slice(0, 1000);
    }

    record.updatedAt = new Date().toISOString();
    saveRecords();

    res.json({
        success: true,
        isNewPunch,
        streak: record.streak,
        punchInDates: record.punchInDates,
        today,
        message: isNewPunch ? `打卡成功！已连续打卡 ${record.streak} 天 🔥` : `今日已完成打卡（连续 ${record.streak} 天）`
    });
});

module.exports = router;
