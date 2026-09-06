/**
 * 猫步互联 · 学习计划与课程督学服务自动化全景测试 (test-study.js)
 */

const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { state, isSafePath, addStudyPath, removeStudyPath, DATA_DIR } = require('./server/config');
const studyRoutes = require('./server/routes/study');

const TEST_PORT = 3105;
const BLENDER_COURSE_DIR = 'D:\\课程\\01_三维设计与建模\\Blender\\02_硬表面·布线与拓扑建模\\琅泽Blender硬表面建模入门';
const PLANS_FILE = path.join(DATA_DIR, 'study_plans.json');
const RECORDS_FILE = path.join(DATA_DIR, 'study_records.json');
const plansBackup = fs.existsSync(PLANS_FILE) ? fs.readFileSync(PLANS_FILE, 'utf8') : null;
const recordsBackup = fs.existsSync(RECORDS_FILE) ? fs.readFileSync(RECORDS_FILE, 'utf8') : null;

let passed = 0;
let total = 0;

function assert(condition, message) {
    total++;
    if (!condition) {
        console.error(`  ✗ [FAIL] ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
    passed++;
    console.log(`  ✓ [PASS] ${message}`);
}

function makeRequest(port, urlPath, method, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const postData = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : '';
        const reqHeaders = {
            'Content-Type': 'application/json',
            ...headers
        };
        if (postData) {
            reqHeaders['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: urlPath,
            method,
            headers: reqHeaders
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(body); } catch(e) { parsed = body; }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function runTests() {
    console.log('\n🚀 [Study Test] 正在启动学习计划测试套件...');

    const app = express();
    app.use(express.json());
    app.use('/api', studyRoutes);

    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.listen(TEST_PORT, '127.0.0.1', () => resolve());
        server.on('error', reject);
    });
    console.log(`✅ [Study Test] 测试服务已监听在端口 ${TEST_PORT}`);

    try {
        console.log('\n--- 1. 测试课程目录扫描异常入参防线 ---');
        // 1.1 空路径
        const r1 = await makeRequest(TEST_PORT, '/api/study/scan-course', 'POST', { coursePath: '' });
        assert(r1.status === 400, '空路径请求返回 400 Bad Request');
        assert(r1.body.success === false, '空路径响应 success 为 false');

        // 1.2 不存在的路径
        const r2 = await makeRequest(TEST_PORT, '/api/study/scan-course', 'POST', { coursePath: 'D:\\__not_exist_folder_999__' });
        assert(r2.status === 404, '不存在目录返回 404 Not Found');

        // 1.3 文件路径而非目录
        const testFile = path.join(__dirname, 'package.json');
        const r3 = await makeRequest(TEST_PORT, '/api/study/scan-course', 'POST', { coursePath: testFile });
        assert(r3.status === 400, '文件路径非目录返回 400 Bad Request');

        console.log('\n--- 2. 测试真实 Blender 课程扫描、语义自然排序与排课算法 ---');
        if (fs.existsSync(BLENDER_COURSE_DIR)) {
            const scanRes = await makeRequest(TEST_PORT, '/api/study/scan-course', 'POST', {
                coursePath: BLENDER_COURSE_DIR,
                lessonsPerDay: 4
            });

            assert(scanRes.status === 200, '真实 Blender 课程扫描成功返回 200');
            assert(scanRes.body.success === true, '扫描返回 success: true');
            assert(scanRes.body.totalLessons === 134, `准确识别全部 134 节视频课时（实际: ${scanRes.body.totalLessons}）`);

            // 验证自然语义递增排序（不是 1, 10, 100, 14 字典序，而是 1, 2, 3 ... 134）
            const lessons = scanRes.body.lessons;
            assert(lessons[0].index === 1 && lessons[0].name.startsWith('1 第1节'), `第 1 课时正确排序: ${lessons[0].name}`);
            assert(lessons[1].index === 2 && lessons[1].name.startsWith('2 第02节'), `第 2 课时正确排序: ${lessons[1].name}`);
            assert(lessons[60].index === 61 && lessons[60].name.startsWith('61课时61'), `第 61 课时 (ts格式) 正确排序: ${lessons[60].name}`);
            assert(lessons[133].index === 134 && lessons[133].name.startsWith('134 第134节'), `第 134 课时正确排序: ${lessons[133].name}`);

            // 验证课件识别 (4.72GB rar)
            const courseware = scanRes.body.courseware;
            assert(Array.isArray(courseware) && courseware.length >= 1, '识别到配套课件资源文件');
            const rarItem = courseware.find(c => c.name.includes('.rar'));
            assert(!!rarItem, `识别到课件压缩包: ${rarItem ? rarItem.name : 'none'}`);
            assert(rarItem.size > 1024 * 1024 * 1024, `课件大小 > 1GB (实际: ${rarItem.sizeFormatted})`);

            // 验证自动排课天数与实操任务生成
            const schedule = scanRes.body.dailySchedule;
            assert(schedule.length === 34, `134 节按每日 4 节规划得到 34 天日程（实际: ${schedule.length}）`);
            assert(schedule[0].lessonIndices.length === 4, '第 1 天包含 4 节课时');
            assert(schedule[0].practiceTasks.length >= 2, '第 1 天生成包含实操与快捷键的考核任务');
            assert(schedule[0].practiceTasks.some(t => t.includes('Boxcutter')), '包含特定技术模块 (Boxcutter) 专属实操任务');
        } else {
            console.log('  ⚠️ [SKIP] 本机未挂载 D 盘 Blender 课程目录，跳过物理文件扫描断言');
        }

        console.log('\n--- 3. 测试安全路径白名单 (isSafePath in shared mode) ---');
        const origMode = state.currentConfig.mode;
        const origShared = state.sharedDir;
        state.currentConfig.mode = 'shared';
        state.sharedDir = 'C:\\TestSharedDir';

        // 未加白名单时，D 盘课程路径应被拒绝
        const testCourseFile = 'D:\\课程\\01_三维设计与建模\\Blender\\lesson.mp4';
        assert(!isSafePath(testCourseFile), '互传模式下未加白的课程路径默认被拦截');

        // 加白后放行
        addStudyPath('D:\\课程\\01_三维设计与建模\\Blender');
        assert(isSafePath(testCourseFile), '加入学习计划白名单后，课程视频文件安全放行');

        // 移出后拦截
        removeStudyPath('D:\\课程\\01_三维设计与建模\\Blender');
        assert(!isSafePath(testCourseFile), '移出白名单后恢复拦截');

        // 恢复原有模式
        state.currentConfig.mode = origMode;
        state.sharedDir = origShared;

        console.log('\n--- 4. 测试学习计划 CRUD 生命周期 ---');
        // 4.1 创建计划
        const dummyLessons = [
            { index: 1, title: '第1节-入门', name: '1.mp4', path: 'D:\\course\\1.mp4', size: 10000, sizeFormatted: '10 KB', ext: '.mp4' },
            { index: 2, title: '第2节-进阶', name: '2.mp4', path: 'D:\\course\\2.mp4', size: 20000, sizeFormatted: '20 KB', ext: '.mp4' },
            { index: 3, title: '第3节-实战', name: '3.mp4', path: 'D:\\course\\3.mp4', size: 30000, sizeFormatted: '30 KB', ext: '.mp4' }
        ];
        const createRes = await makeRequest(TEST_PORT, '/api/study/plans', 'POST', {
            title: 'Blender 自动化测试计划',
            coursePath: 'D:\\course',
            totalLessons: 3,
            targetDays: 2,
            dailyLessons: 2,
            lessons: dummyLessons,
            courseware: [{ name: 'demo.rar', path: 'D:\\course\\demo.rar', size: 5000, sizeFormatted: '5 KB', ext: '.rar' }],
            dailySchedule: [
                { day: 1, title: 'Day 1', lessonIndices: [1, 2], practiceTasks: ['任务A'] },
                { day: 2, title: 'Day 2', lessonIndices: [3], practiceTasks: ['任务B'] }
            ]
        });
        assert(createRes.status === 200, '创建计划成功返回 200');
        assert(!!createRes.body.plan.id, `生成唯一计划 ID: ${createRes.body.plan.id}`);
        const planId = createRes.body.plan.id;

        // 4.2 计划列表
        const listRes = await makeRequest(TEST_PORT, '/api/study/plans', 'GET');
        assert(listRes.status === 200, '获取计划列表成功返回 200');
        const found = listRes.body.plans.find(p => p.id === planId);
        assert(!!found, '列表中包含刚创建的计划');
        assert(found.totalLessons === 3, '计划包含 3 个课时');

        // 4.3 计划详情
        const detailRes = await makeRequest(TEST_PORT, `/api/study/plans/${planId}`, 'GET');
        assert(detailRes.status === 200, '获取计划详情成功返回 200');
        assert(detailRes.body.plan.title === 'Blender 自动化测试计划', '详情标题匹配');
        assert(Array.isArray(detailRes.body.plan.lessons), '详情包含课时数组');

        // 4.4 更新计划
        const updateRes = await makeRequest(TEST_PORT, `/api/study/plans/${planId}`, 'PUT', {
            title: 'Blender 自动化测试计划（已更新）'
        });
        assert(updateRes.status === 200, '更新计划成功返回 200');
        assert(updateRes.body.plan.title === 'Blender 自动化测试计划（已更新）', '更新后标题生效');

        console.log('\n--- 5. 测试课时勾选打卡、任务标记与连胜连打算法 ---');
        // 5.1 标记课时完成
        const t1 = await makeRequest(TEST_PORT, '/api/study/tasks/toggle', 'POST', {
            planId,
            type: 'lesson',
            id: 1,
            completed: true
        });
        assert(t1.status === 200, '标记课时完成返回 200');
        assert(t1.body.completedLessons.includes(1), '课时 1 标记为完成');

        // 5.2 标记实操任务完成
        const t2 = await makeRequest(TEST_PORT, '/api/study/tasks/toggle', 'POST', {
            planId,
            type: 'practice',
            id: 'day_1_task_0',
            completed: true
        });
        assert(t2.status === 200, '标记实操任务完成返回 200');
        assert(t2.body.completedTasks['day_1_task_0'] === true, '实操任务完成状态记录');

        // 5.3 首次每日打卡
        const p1 = await makeRequest(TEST_PORT, '/api/study/punch-in', 'POST', {
            planId,
            note: '今天打卡学习了硬表面建模'
        });
        assert(p1.status === 200, '每日打卡接口返回 200');
        assert(p1.body.streak === 1, '首次打卡连胜天数为 1');
        assert(p1.body.isNewPunch === true, '首次打卡标记为新打卡');

        // 5.4 当天重复打卡（幂等性）
        const p2 = await makeRequest(TEST_PORT, '/api/study/punch-in', 'POST', {
            planId,
            note: '再次打卡更新笔记'
        });
        assert(p2.status === 200, '同日再次打卡返回 200');
        assert(p2.body.streak === 1, '同日打卡不重复增加 streak (仍为 1)');
        assert(p2.body.isNewPunch === false, '同日打卡标记为非新打卡');

        // 5.5 获取计划打卡与进度记录
        const recRes = await makeRequest(TEST_PORT, `/api/study/records/${planId}`, 'GET');
        assert(recRes.status === 200, '获取打卡记录成功返回 200');
        assert(recRes.body.record.isPunchedToday === true, 'isPunchedToday 为 true');
        assert(recRes.body.record.completedLessons.length === 1, '记录课时完成数为 1');

        console.log('\n--- 6. 测试学习计划与记录级联清理 ---');
        const delRes = await makeRequest(TEST_PORT, `/api/study/plans/${planId}`, 'DELETE');
        assert(delRes.status === 200, '删除计划成功返回 200');

        const reCheck = await makeRequest(TEST_PORT, `/api/study/plans/${planId}`, 'GET');
        assert(reCheck.status === 404, '已删除计划再次查询返回 404');

        console.log('\n========================================');
        console.log(`🎯 学习计划测试全部通过: ${passed}/${total} 用例！`);
        console.log('========================================');
    } finally {
        server.close();
        try {
            if (plansBackup !== null) fs.writeFileSync(PLANS_FILE, plansBackup, 'utf8');
            if (recordsBackup !== null) fs.writeFileSync(RECORDS_FILE, recordsBackup, 'utf8');
        } catch (e) {}
    }
}

runTests().catch(err => {
    console.error('\n❌ 测试失败:', err);
    process.exit(1);
});
