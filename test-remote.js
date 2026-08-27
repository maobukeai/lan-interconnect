const http = require('http');
const { startServer, stopServer } = require('./server.js');

function request(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                let json = null;
                try {
                    json = JSON.parse(buffer.toString());
                } catch (e) {}
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    buffer,
                    json,
                    text: buffer.toString()
                });
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(typeof data === 'string' ? data : JSON.stringify(data));
        }
        req.end();
    });
}

async function runTests() {
    console.log('🚀 [Test] 正在启动猫步互联后端服务进行自动化物理测试...');
    const serverInfo = await startServer({ port: 3999, pin: '' });
    console.log(`✅ [Test] 服务已启动: ${serverInfo.url}`);

    const port = serverInfo.port;
    let passedCount = 0;
    let totalCount = 0;

    function assert(desc, condition) {
        totalCount++;
        if (condition) {
            console.log(`  ✓ [PASS] ${desc}`);
            passedCount++;
        } else {
            console.error(`  ✗ [FAIL] ${desc}`);
            process.exitCode = 1;
        }
    }

    try {
        // 1. 获取音量测试
        console.log('\n--- 1. 测试音量获取接口 ---');
        const volRes = await request({
            hostname: '127.0.0.1',
            port,
            path: '/api/remote/volume',
            method: 'GET'
        });
        assert('GET /api/remote/volume 返回 200', volRes.statusCode === 200);
        assert('GET /api/remote/volume 包含 volume 数字', typeof volRes.json?.volume === 'number');
        assert('GET /api/remote/volume 包含 muted 布尔值', typeof volRes.json?.muted === 'boolean');
        console.log('  -> 当前系统音量:', volRes.json);

        // 2. 设置音量测试
        console.log('\n--- 2. 测试音量设置接口 ---');
        const setVolRes = await request({
            hostname: '127.0.0.1',
            port,
            path: '/api/remote/volume',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { volume: 42 });
        assert('POST /api/remote/volume 返回 200', setVolRes.statusCode === 200);
        assert('POST /api/remote/volume 设置成功', setVolRes.json?.success === true);

        // 3. 屏幕信息测试
        console.log('\n--- 3. 测试屏幕信息接口 ---');
        const screenInfoRes = await request({
            hostname: '127.0.0.1',
            port,
            path: '/api/remote/screen/info',
            method: 'GET'
        });
        assert('GET /api/remote/screen/info 返回 200', screenInfoRes.statusCode === 200);
        assert('GET /api/remote/screen/info 返回 screens 数组', Array.isArray(screenInfoRes.json?.screens) && screenInfoRes.json.screens.length > 0);
        console.log('  -> 屏幕列表:', screenInfoRes.json?.screens);

        // 4. 实时屏幕截图流测试
        console.log('\n--- 4. 测试实时屏幕捕获接口 ---');
        const captureRes = await request({
            hostname: '127.0.0.1',
            port,
            path: '/api/remote/screen/capture?scale=0.5&quality=50',
            method: 'GET'
        });
        assert('GET /api/remote/screen/capture 返回 200', captureRes.statusCode === 200);
        assert('GET /api/remote/screen/capture Content-Type 为 image/jpeg', captureRes.headers['content-type'] === 'image/jpeg');
        assert('返回的 JPEG 二进制大于 1KB', captureRes.buffer.length > 1024);
        const isJpegHeader = captureRes.buffer[0] === 0xFF && captureRes.buffer[1] === 0xD8 && captureRes.buffer[2] === 0xFF;
        assert('JPEG 文件魔数头校验通过 (0xFF 0xD8 0xFF)', isJpegHeader);
        console.log(`  -> 成功捕获并返回图像，尺寸: ${captureRes.buffer.length} 字节`);

        // 5. 电源指令测试 (调用 abort 取消关机)
        console.log('\n--- 5. 测试电源管理安全指令 ---');
        const powerRes = await request({
            hostname: '127.0.0.1',
            port,
            path: '/api/remote/power',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { action: 'abort' });
        assert('POST /api/remote/power { action: abort } 返回 200', powerRes.statusCode === 200);
        assert('POST /api/remote/power 返回 success: true', powerRes.json?.success === true);
        console.log('  -> 电源指令响应:', powerRes.json);

        // 6. 模拟鼠标点击测试
        console.log('\n--- 6. 测试模拟鼠标坐标点击接口 ---');
        const mouseRes = await request({
            hostname: '127.0.0.1',
            port,
            path: '/api/remote/mouse/click',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { x: 500, y: 500, button: 'left' });
        assert('POST /api/remote/mouse/click 返回 200', mouseRes.statusCode === 200);
        assert('POST /api/remote/mouse/click 返回 success: true', mouseRes.json?.success === true);

        console.log(`\n========================================`);
        console.log(`🎯 测试结果: ${passedCount}/${totalCount} 用例全部通过！`);
        console.log(`========================================\n`);
    } catch (err) {
        console.error('❌ 测试运行出错:', err);
        process.exitCode = 1;
    } finally {
        await stopServer();
        console.log('🛑 [Test] 测试服务已完全停稳退出。');
    }
}

runTests();
