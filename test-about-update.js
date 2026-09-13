/**
 * 猫步互联 Pro · 关于与自动更新检查升级自动化物理测试套件
 * 严格验证 /api/system/version, /api/system/check-update, 静态资产与版本比对契约
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✓ [PASS] ${message}`);
    } else {
        console.error(`  ❌ [FAIL] ${message}`);
        process.exitCode = 1;
    }
}

async function run() {
    console.log('🚀 [About & Update Test] 开始执行关于与自动更新专项测试套件...\n');

    // --- 1. 静态资产与元数据完整性验证 ---
    console.log('--- 1. 验证静态资源与 version.json 元数据 ---');
    const versionJsonPath = path.join(__dirname, 'version.json');
    assert(fs.existsSync(versionJsonPath), '根目录存在 version.json');
    const vData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    assert(typeof vData.version === 'string' && /^\d+\.\d+\.\d+$/.test(vData.version), `version 字段符合标准 Semver: ${vData.version}`);
    assert(vData.name === '猫步互联 Pro', `应用名称匹配: ${vData.name}`);
    assert(vData.author && vData.author.includes('猫步可爱'), '包含作者团队猫步可爱');
    assert(Array.isArray(vData.assets) && vData.assets.length > 0, 'assets 数组非空');
    assert(vData.assets.some(a => (a.name || '').endsWith('.apk')), 'assets 包含 Android APK 安装包');
    assert(vData.assets.some(a => (a.name || '').endsWith('.exe')), 'assets 包含 Windows EXE 安装包');

    const contactQrPath = path.join(__dirname, 'shared', 'assets', 'contact_qr.webp');
    assert(fs.existsSync(contactQrPath), 'shared/assets/contact_qr.webp 存在');
    const contactStat = fs.statSync(contactQrPath);
    assert(contactStat.size > 10000, `微信二维码文件体积正常: ${contactStat.size} 字节`);

    const sponsorQrPath = path.join(__dirname, 'shared', 'assets', 'sponsor_qr.webp');
    assert(fs.existsSync(sponsorQrPath), 'shared/assets/sponsor_qr.webp 存在');
    const sponsorStat = fs.statSync(sponsorQrPath);
    assert(sponsorStat.size > 10000, `赞赏码文件体积正常: ${sponsorStat.size} 字节`);

    const aboutComponentPath = path.join(__dirname, 'shared', 'components', 'about-panel.js');
    assert(fs.existsSync(aboutComponentPath), 'shared/components/about-panel.js 组件存在');

    // --- 1.1 验证关于页面多重显眼入口契约 ---
    console.log('\n--- 1.1 验证关于页面多重显眼入口契约 ---');
    const guiHtml = fs.readFileSync(path.join(__dirname, 'gui.html'), 'utf8');
    assert(guiHtml.includes('data-view="about"'), 'gui.html 悬浮 Dock 栏包含 data-view="about" 一级导航项');
    assert(guiHtml.includes('id="view-about"'), 'gui.html 包含 id="view-about" 独立一级全景视图');
    assert(guiHtml.includes('id="qa-about"'), 'gui.html 主页快捷操作区包含 id="qa-about" 便捷入口');
    assert(guiHtml.includes('id="btn-about"'), 'gui.html 标题栏包含 id="btn-about" 快捷按钮');

    const desktopAppJs = fs.readFileSync(path.join(__dirname, 'desktop', 'app.js'), 'utf8');
    assert(desktopAppJs.includes("switchView('about')"), "desktop/app.js 包含 switchView('about') 视图调度");
    assert(desktopAppJs.includes("view === 'about'"), "desktop/app.js 包含 view === 'about' 生命周期挂载");

    const pubHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    assert(pubHtml.includes('id="btn-about"'), 'public/index.html 移动端顶栏包含 id="btn-about"');
    assert(pubHtml.includes('id="about-modal"'), 'public/index.html 包含 id="about-modal" 弹窗容器');

    // --- 1.2 验证桌面客户端 vs 网页端/移动端 双模态环境自适应契约 ---
    console.log('\n--- 1.2 验证桌面客户端 vs 网页端双模态环境自适应契约 ---');
    global.window = global;
    global.localStorage = { getItem: () => null, setItem: () => {} };
    global.Icons = { render: () => '' };
    global.LanDiskUI = { openModal: () => ({ el: { querySelector: () => null }, close: () => {} }), toast: () => {} };
    delete require.cache[require.resolve('./shared/components/about-panel.js')];
    require('./shared/components/about-panel.js');

    // 测试 A: 网页端/移动端浏览器环境
    delete global.window.isTauri;
    delete global.window.__TAURI__;
    delete global.window.__TAURI_INTERNALS__;
    delete global.LanDiskIPC;
    global.window.location = { protocol: 'http:', origin: 'http://192.168.0.105:3000' };

    const webContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    global.AboutPanelComponent.render(webContainer);
    assert(webContainer.innerHTML.includes('Web 极速互联版'), '网页端正确渲染 Web 极速互联版徽章');
    assert(webContainer.innerHTML.includes('客户端与 App 安装'), '网页端卡片 1 渲染「客户端与 App 安装」');
    assert(webContainer.innerHTML.includes('about-btn-download-android'), '网页端提供「下载 Android 安卓客户端 (APK)」直达按钮');
    assert(webContainer.innerHTML.includes('about-btn-download-desktop'), '网页端提供「下载 Windows 桌面客户端」直达按钮');
    assert(webContainer.innerHTML.includes('about-btn-install-pwa'), '网页端提供「添加到手机主屏幕 (免装 App)」引导按钮');
    assert(webContainer.innerHTML.includes('about-btn-view-notes'), '网页端提供「查看最新版本特性说明」日志按钮');
    assert(!webContainer.innerHTML.includes('about-btn-check-update'), '网页端免安装，隐藏不适用的「检查更新」安装包升级按钮');

    // 测试 B: 桌面客户端环境 (Tauri / LanDiskIPC)
    delete global.window.Capacitor;
    global.window.isTauri = true;
    const desktopContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    global.AboutPanelComponent.render(desktopContainer);
    assert(desktopContainer.innerHTML.includes('Pro 桌面专业版'), '桌面端正确渲染 Pro 桌面专业版徽章');
    assert(desktopContainer.innerHTML.includes('应用更新检查'), '桌面端卡片 1 渲染「应用更新检查」');
    assert(desktopContainer.innerHTML.includes('about-btn-check-update'), '桌面端提供「检查更新」按钮');
    assert(desktopContainer.innerHTML.includes('about-toggle-autocheck'), '桌面端提供「启动时自动检查更新」设置开关');
    assert(desktopContainer.innerHTML.includes('about-toggle-autosilent'), '桌面端提供「全自动静默无感升级」设置开关');
    assert(!desktopContainer.innerHTML.includes('about-btn-install-pwa'), '桌面客户端不展示手机 PWA 添加主屏幕按钮');

    // 测试 C: Android 原生客户端环境 (Capacitor)
    delete global.window.isTauri;
    global.window.Capacitor = { isNative: true };
    const androidContainer = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    global.AboutPanelComponent.render(androidContainer);
    assert(androidContainer.innerHTML.includes('Android 原生版'), 'Android 端正确渲染 Android 原生版徽章');
    assert(androidContainer.innerHTML.includes('安卓应用更新'), 'Android 端卡片 1 渲染「安卓应用更新」');
    assert(androidContainer.innerHTML.includes('about-btn-download-android'), 'Android 端提供获取最新 APK 按钮');



    // --- 2. 验证 desktop-dist 构建产物 ---
    console.log('\n--- 2. 验证 desktop-dist 构建产物 ---');
    const distDir = path.join(__dirname, 'desktop-dist');
    if (!fs.existsSync(distDir)) {
        const { execSync } = require('child_process');
        execSync('node scripts/build-desktop-web.js', { cwd: __dirname, stdio: 'pipe' });
    }
    const distVersionJson = path.join(__dirname, 'desktop-dist', 'version.json');
    assert(fs.existsSync(distVersionJson), 'desktop-dist/version.json 存在');
    const distContactQr = path.join(__dirname, 'desktop-dist', 'shared', 'assets', 'contact_qr.webp');
    assert(fs.existsSync(distContactQr), 'desktop-dist/shared/assets/contact_qr.webp 存在');
    const distAboutComp = path.join(__dirname, 'desktop-dist', 'shared', 'components', 'about-panel.js');
    assert(fs.existsSync(distAboutComp), 'desktop-dist/shared/components/about-panel.js 存在');

    // --- 3. 启动临时服务验证 API 契约 ---
    console.log('\n--- 3. 启动服务端测试 /api/system API 契约 ---');
    const { startServer, stopServer } = require('./server');
    const testPort = 3128;
    await startServer({ port: testPort, mode: 'full' });

    function req(pathStr, options = {}) {
        return new Promise((resolve, reject) => {
            const reqObj = http.request({
                hostname: '127.0.0.1',
                port: testPort,
                path: pathStr,
                method: options.method || 'GET',
                headers: options.headers || {}
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null });
                    } catch (e) {
                        resolve({ status: res.statusCode, headers: res.headers, text: data });
                    }
                });
            });
            reqObj.on('error', reject);
            if (options.body) {
                reqObj.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            }
            reqObj.end();
        });
    }

    try {
        // GET /api/system/version
        const vRes = await req('/api/system/version');
        assert(vRes.status === 200, 'GET /api/system/version 返回 200');
        assert(vRes.body && vRes.body.name === '猫步互联 Pro', 'version API 应用名匹配');
        assert(vRes.body && vRes.body.version === vData.version, `version API 版本号匹配: ${vRes.body && vRes.body.version}`);
        assert(vRes.body && vRes.body.author && vRes.body.author.includes('猫步可爱'), 'version API 作者匹配');
        assert(vRes.body && typeof vRes.body.releasesUrl === 'string', '包含 releasesUrl 字段');

        // GET /api/system/check-update
        const updateRes = await req('/api/system/check-update');
        assert(updateRes.status === 200, 'GET /api/system/check-update 返回 200');
        assert(updateRes.body && typeof updateRes.body.has_update === 'boolean', 'check-update 返回 has_update 布尔值');
        assert(updateRes.body && typeof updateRes.body.current_version === 'string', 'check-update 返回当前版本号');
        if (updateRes.body && updateRes.body.latest) {
            assert(typeof updateRes.body.latest.version === 'string', `latest 包含 version: ${updateRes.body.latest.version}`);
            assert(typeof updateRes.body.latest.download_url === 'string', 'latest 包含 download_url');
        }

        // GET /api/system/update-progress
        const progRes = await req('/api/system/update-progress');
        assert(progRes.status === 200, 'GET /api/system/update-progress 返回 200');
        assert(progRes.body && typeof progRes.body.percentage === 'number', '包含 percentage 数字');
        assert(progRes.body && typeof progRes.body.stage === 'string', '包含 stage 状态字符串');

        // POST /api/system/download-update 入参校验
        const dlInvalidRes = await req('/api/system/download-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {}
        });
        assert(dlInvalidRes.status === 400, '缺少下载 URL 时返回 400 Bad Request');

        // POST /api/system/install-update 入参校验
        const insInvalidRes = await req('/api/system/install-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { filePath: 'C:\\not_found_test_installer.exe' }
        });
        assert(insInvalidRes.status === 400, '安装包不存在时返回 400');

    } finally {
        await stopServer();
        console.log('🛑 测试服务端已停稳。');
    }

    console.log(`\n========================================`);
    console.log(`🎯 关于与自动更新测试通过: ${passedTests}/${totalTests} 用例！`);
    console.log(`========================================\n`);

    if (passedTests !== totalTests) {
        process.exit(1);
    }
    process.exit(0);
}

run().catch(err => {
    console.error('测试异常中断:', err);
    process.exit(1);
});

