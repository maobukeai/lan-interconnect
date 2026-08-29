const { startServer, stopServer } = require('./server.js');
const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const testPort = 3001;
const testConfig = {
    mode: 'shared',
    pin: '8888', // 设置 PIN 校验密码
    port: testPort,
    customDir: path.join(__dirname, 'test_shared'),
    whitelistMode: false,
    whitelistIps: []
};

let activePort = 3001;
async function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:${activePort}${path}`, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function runTests() {
    console.log('Starting server for tests...');
    if (!fs.existsSync(testConfig.customDir)) {
        fs.mkdirSync(testConfig.customDir, { recursive: true });
    }
    
    const startInfo = await startServer(testConfig);
    activePort = startInfo.port;
    console.log(`Server started on port ${activePort} with QR Token: ${startInfo.token}`);

    try {
        // Test 1: Path Traversal Protection
        console.log('Running Test 1: Path Traversal Protection...');
        const maliciousPath = encodeURIComponent(path.join(testConfig.customDir, '../../Windows/System32'));
        const res1 = await request(`/api/files?path=${maliciousPath}&token=${startInfo.token}`);
        assert.strictEqual(res1.status, 403, 'Path traversal should return 403 Forbidden');
        console.log('Test 1 Passed.');

        // Test 2: Chat XSS 防护契约（服务端存原文，渲染层统一转义）
        console.log('Running Test 2: Chat XSS Escaping Contract...');
        const xssPayload = '<script>alert(1)</script>';
        const body = JSON.stringify({ text: xssPayload, sender: 'test' });
        const res2 = await request(`/api/chat?token=${startInfo.token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        const res2Data = JSON.parse(res2.data);
        assert.strictEqual(res2Data.success, true);
        // 服务端存储原文：转义统一在渲染层做，避免服务端+客户端双重转义把 & < 显示成实体
        assert.ok(res2Data.message.text.includes('<script>'), 'Server should store raw text (rendering layer escapes)');
        // 渲染层转义契约：共享聊天组件插入 innerHTML 前必须对 m.text 做 escapeHtml
        const chatCompSrc = fs.readFileSync(path.join(__dirname, 'shared', 'components', 'imessage-chat.js'), 'utf8');
        assert.ok(chatCompSrc.includes("escapeHtml((m.text || '').trim())"), 'Chat component must escape message text before innerHTML');
        console.log('Test 2 Passed.');

        // Test 3: Normal File Access
        console.log('Running Test 3: Normal File Access...');
        const res3 = await request(`/api/files?path=${encodeURIComponent(testConfig.customDir)}&token=${startInfo.token}`);
        assert.strictEqual(res3.status, 200, 'Normal directory access should return 200');
        console.log('Test 3 Passed.');

        // Test 4: Terminal Command (Blocked in shared mode)
        console.log('Running Test 4: Terminal Execution Blocked in Shared Mode...');
        const res4 = await request(`/api/terminal?token=${startInfo.token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'echo 123' })
        });
        assert.strictEqual(res4.status, 403, 'Terminal execution should be forbidden in shared mode');
        console.log('Test 4 Passed.');

        // Test 5: QR Token Auto-Authentication Pass
        console.log('Running Test 5: QR Token Auto-Authentication Pass...');
        const res5NoAuth = await request('/api/verify', { method: 'POST' });
        assert.strictEqual(res5NoAuth.status, 401, 'Request without PIN or Token should fail with 401');

        const res5WithToken = await request(`/api/verify?token=${startInfo.token}`, { method: 'POST' });
        assert.strictEqual(res5WithToken.status, 200, 'Request with valid QR Token should bypass PIN and return 200');
        console.log('Test 5 Passed.');

        // Test 6: Automatic Port Conflict Auto-Resolution (EADDRINUSE Fallback)
        console.log('Running Test 6: Automatic Port Conflict Resolution...');
        await stopServer();
        
        // 尝试启动服务在 3000 端口（若 3000 已被占用，系统将自动检测并递增切换至空闲端口）
        const startInfoConflict = await startServer({ ...testConfig, port: 3000 });
        activePort = startInfoConflict.port;
        assert.ok(startInfoConflict.port >= 3000, 'Server should bind to a valid port');
        console.log(`Test 6 Passed: Target port 3000 resolved and successfully bound to port ${startInfoConflict.port} (Fallback: ${startInfoConflict.fallbackFromPort || 'none'})`);

        // Test 7: Subtitle Auto-Detection and Cross-Device Progress Sync
        console.log('Running Test 7: Subtitle Auto-Detection & Cross-Device Progress...');
        const dummyVideo = path.join(testConfig.customDir, 'TestMovie.mp4');
        const dummySubZh = path.join(testConfig.customDir, 'TestMovie.zh.srt');
        const dummySubEn = path.join(testConfig.customDir, 'TestMovie.en.vtt');
        fs.writeFileSync(dummyVideo, 'dummy-video-content');
        fs.writeFileSync(dummySubZh, '1\n00:00:01,000 --> 00:00:04,000\n你好，猫步互联\n\n');
        fs.writeFileSync(dummySubEn, 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello LanDisk\n\n');

        // 7.1 探查同名字幕
        const res7Subs = await request(`/api/media/subtitles?path=${encodeURIComponent(dummyVideo)}&token=${startInfoConflict.token}`);
        assert.strictEqual(res7Subs.status, 200, 'Subtitles endpoint should return 200');
        const subsData = JSON.parse(res7Subs.data);
        assert.strictEqual(subsData.success, true);
        assert.strictEqual(subsData.subtitles.length, 2, 'Should find 2 matched subtitle files');
        assert.ok(subsData.subtitles.some(s => s.name.includes('中文')), 'Should recognize Chinese subtitle');
        assert.ok(subsData.subtitles.some(s => s.name.includes('English')), 'Should recognize English subtitle');

        // 7.2 字幕流式读取
        const res7Stream = await request(`/api/subtitle?path=${encodeURIComponent(dummySubZh)}&token=${startInfoConflict.token}`);
        assert.strictEqual(res7Stream.status, 200, 'Subtitle stream endpoint should return 200');
        assert.ok(res7Stream.data.includes('你好，猫步互联'), 'Subtitle content should match');

        // 7.3 保存播放进度 (150s / 300s = 50%)
        const res7ProgressPost = await request(`/api/media/progress?token=${startInfoConflict.token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: dummyVideo, time: 150, duration: 300 })
        });
        assert.strictEqual(res7ProgressPost.status, 200, 'Progress POST should return 200');
        const postData = JSON.parse(res7ProgressPost.data);
        assert.strictEqual(postData.success, true);
        assert.strictEqual(postData.progress.percentage, 50, 'Percentage should be 50%');

        // 7.4 读取单条与全量播放进度
        const res7ProgressGet = await request(`/api/media/progress?path=${encodeURIComponent(dummyVideo)}&token=${startInfoConflict.token}`);
        const getData = JSON.parse(res7ProgressGet.data);
        assert.strictEqual(getData.progress.time, 150);
        assert.strictEqual(getData.progress.percentage, 50);

        const res7AllProgress = await request(`/api/media/progress?token=${startInfoConflict.token}`);
        const allData = JSON.parse(res7AllProgress.data);
        assert.ok(allData.progressMap[dummyVideo], 'Progress map should contain video entry');
        console.log('Test 7 Passed.');

        await stopServer();

        console.log('All tests passed successfully (7/7)!');
    } catch (e) {
        console.error('Test failed:', e);
        process.exit(1);
    } finally {
        await stopServer();
        if (fs.existsSync(testConfig.customDir)) {
            fs.rmSync(testConfig.customDir, { recursive: true, force: true });
        }
        console.log('Tests completed, server stopped.');
        process.exit(0);
    }
}

runTests();