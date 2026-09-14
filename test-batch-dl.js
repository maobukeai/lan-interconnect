/**
 * test-batch-dl.js
 * 批量打包下载与目录打包下载自动化回归测试套件
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('🚀 [Batch DL Test] 开始执行批量打包下载专项回归测试...');
    const { startServer, stopServer } = require('./server');
    const testPort = 3139;
    await startServer({ port: testPort, mode: 'full' });
    const base = `http://127.0.0.1:${testPort}`;

    try {
        const file1 = path.resolve(__dirname, 'package.json');
        const file2 = path.resolve(__dirname, 'version.json');
        const folder = path.resolve(__dirname, 'server');

        // 1. 测试多文件表单打包下载
        console.log('--- 1. 测试多文件流式打包下载 ---');
        const res1 = await fetch(`${base}/api/download/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `folderName=测试文件打包&files=${encodeURIComponent(file1)}&files=${encodeURIComponent(file2)}`
        });

        assert.strictEqual(res1.status, 200, '多文件打包应返回 HTTP 200');
        const cd1 = res1.headers.get('content-disposition') || '';
        assert.ok(cd1.includes('attachment; filename='), '响应头应包含 attachment Content-Disposition');
        const buf1 = await res1.arrayBuffer();
        assert.ok(buf1.byteLength > 500, '打包产物大小应大于 500 字节');
        const magic1 = Buffer.from(buf1.slice(0, 4)).toString('hex');
        assert.strictEqual(magic1, '504b0304', '文件应具备标准 ZIP 头部魔数 PK\\x03\\x04');
        console.log('  ✓ [PASS] 多文件打包流式下载成功，ZIP 魔数与体积校验通过');

        // 2. 测试整目录流式打包下载 (JSON Body)
        console.log('--- 2. 测试目录流式打包下载 ---');
        const res2 = await fetch(`${base}/api/download/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: [folder], folderName: 'server_pack' })
        });

        assert.strictEqual(res2.status, 200, '目录打包应返回 HTTP 200');
        const buf2 = await res2.arrayBuffer();
        assert.ok(buf2.byteLength > 2000, '目录打包产物大小应大于 2000 字节');
        const magic2 = Buffer.from(buf2.slice(0, 4)).toString('hex');
        assert.strictEqual(magic2, '504b0304', '目录打包应具备标准 ZIP 头部魔数');
        console.log('  ✓ [PASS] 目录流式打包下载成功 (大小: ' + buf2.byteLength + ' 字节)');

        // 3. 测试空参数防线
        console.log('--- 3. 测试异常入参防线 ---');
        const res3 = await fetch(`${base}/api/download/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: [] })
        });
        assert.strictEqual(res3.status, 400, '无有效文件列表应返回 400 Bad Request');
        console.log('  ✓ [PASS] 空文件列表正确拦截');

        console.log('========================================');
        console.log('🎯 批量打包下载回归测试全部通过！');
        console.log('========================================');
    } finally {
        await stopServer();
        console.log('🛑 测试服务端已停稳。');
    }
}

run().then(() => process.exit(0)).catch(err => {
    console.error('❌ 测试失败:', err);
    process.exit(1);
});
