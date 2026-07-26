const { startServer, stopServer } = require('./server.js');
const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const testPort = 3001;
const testConfig = {
    mode: 'shared',
    pin: '',
    port: testPort,
    customDir: path.join(__dirname, 'test_shared'),
    whitelistMode: false,
    whitelistIps: []
};

async function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:${testPort}${path}`, options, (res) => {
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
    
    await startServer(testConfig);
    console.log('Server started.');

    try {
        // Test 1: Path Traversal Protection
        console.log('Running Test 1: Path Traversal Protection...');
        const maliciousPath = encodeURIComponent(path.join(testConfig.customDir, '../../Windows/System32'));
        const res1 = await request(`/api/files?path=${maliciousPath}`);
        assert.strictEqual(res1.status, 403, 'Path traversal should return 403 Forbidden');
        console.log('Test 1 Passed.');

        // Test 2: Chat XSS Escaping
        console.log('Running Test 2: Chat XSS Escaping...');
        const xssPayload = '<script>alert(1)</script>';
        const body = JSON.stringify({ text: xssPayload, sender: 'test' });
        const res2 = await request('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        const res2Data = JSON.parse(res2.data);
        assert.strictEqual(res2Data.success, true);
        assert.ok(!res2Data.message.text.includes('<script>'), 'XSS payload should be escaped');
        assert.ok(res2Data.message.text.includes('&lt;script&gt;'), 'XSS payload should be HTML entity encoded');
        console.log('Test 2 Passed.');

        // Test 3: Normal File Access
        console.log('Running Test 3: Normal File Access...');
        const res3 = await request(`/api/files?path=${encodeURIComponent(testConfig.customDir)}`);
        assert.strictEqual(res3.status, 200, 'Normal directory access should return 200');
        console.log('Test 3 Passed.');

        // Test 4: Terminal Command (Blocked in shared mode)
        console.log('Running Test 4: Terminal Execution Blocked in Shared Mode...');
        const res4 = await request('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'echo 123' })
        });
        assert.strictEqual(res4.status, 403, 'Terminal execution should be forbidden in shared mode');
        console.log('Test 4 Passed.');

        console.log('All tests passed successfully!');
    } catch (e) {
        console.error('Test failed:', e);
    } finally {
        stopServer();
        if (fs.existsSync(testConfig.customDir)) {
            fs.rmSync(testConfig.customDir, { recursive: true, force: true });
        }
        console.log('Tests completed, server stopped.');
        process.exit(0);
    }
}

runTests();