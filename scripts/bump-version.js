const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion) {
    console.error('❌ 请提供目标版本号，例如: node scripts/bump-version.js 2.0.1');
    process.exit(1);
}

const semverMatch = newVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/);
if (!semverMatch) {
    console.error(`❌ 无效的版本号格式: "${newVersion}"，请使用标准语义化版本 (如 2.0.1)`);
    process.exit(1);
}

const major = parseInt(semverMatch[1], 10);
const minor = parseInt(semverMatch[2], 10);
const patch = parseInt(semverMatch[3], 10);
const versionCode = major * 10000 + minor * 100 + patch;

const ROOT = path.resolve(__dirname, '..');
console.log(`🚀 开始将全项目版本号同步升级为: v${newVersion} (Android versionCode: ${versionCode})...\n`);

// 1. package.json
const pkgPath = path.join(ROOT, 'package.json');
if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`  ✓ 已更新 package.json -> ${newVersion}`);
}

// 2. android/app/build.gradle
const gradlePath = path.join(ROOT, 'android', 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    gradle = gradle.replace(/versionCode\s+\d+/g, `versionCode ${versionCode}`);
    gradle = gradle.replace(/versionName\s+["'][^"']+["']/g, `versionName "${newVersion}"`);
    fs.writeFileSync(gradlePath, gradle, 'utf8');
    console.log(`  ✓ 已更新 android/app/build.gradle -> versionCode: ${versionCode}, versionName: "${newVersion}"`);
}

// 3. server/routes/system.js
const sysPath = path.join(ROOT, 'server', 'routes', 'system.js');
if (fs.existsSync(sysPath)) {
    let sys = fs.readFileSync(sysPath, 'utf8');
    sys = sys.replace(/const APP_VERSION = ['"][^'"]+['"];/g, `const APP_VERSION = '${newVersion}';`);
    sys = sys.replace(/version:\s*['"][^'"]+['"]/g, `version: '${newVersion}'`);
    fs.writeFileSync(sysPath, sys, 'utf8');
    console.log(`  ✓ 已更新 server/routes/system.js -> version: '${newVersion}'`);
}

// 4. src-tauri/Cargo.toml
const cargoPath = path.join(ROOT, 'src-tauri', 'Cargo.toml');
if (fs.existsSync(cargoPath)) {
    let cargo = fs.readFileSync(cargoPath, 'utf8');
    cargo = cargo.replace(/^version\s*=\s*["'][^"']+["']/m, `version = "${newVersion}"`);
    fs.writeFileSync(cargoPath, cargo, 'utf8');
    console.log(`  ✓ 已更新 src-tauri/Cargo.toml -> version: "${newVersion}"`);
}

// 5. src-tauri/tauri.conf.json
const tauriPath = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
if (fs.existsSync(tauriPath)) {
    let tauri = fs.readFileSync(tauriPath, 'utf8');
    tauri = tauri.replace(/"version":\s*"[^"]*"/g, `"version": "${newVersion}"`);
    fs.writeFileSync(tauriPath, tauri, 'utf8');
    console.log(`  ✓ 已更新 src-tauri/tauri.conf.json -> version: "${newVersion}"`);
}

// 6. version.json
const versionJsonPath = path.join(ROOT, 'version.json');
if (fs.existsSync(versionJsonPath)) {
    try {
        const vData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
        vData.version = newVersion;
        vData.release_date = new Date().toISOString().slice(0, 10);
        if (Array.isArray(vData.assets)) {
            vData.assets.forEach(a => {
                if (a.name) a.name = a.name.replace(/LanDisk-Pro-[\d\.]+/g, 'LanDisk-Pro-' + newVersion).replace(/\d+\.\d+\.\d+/g, newVersion);
                if (a.url) a.url = a.url.replace(/v\d+\.\d+\.\d+/g, 'v' + newVersion).replace(/LanDisk-Pro-[\d\.]+/g, 'LanDisk-Pro-' + newVersion).replace(/\d+\.\d+\.\d+/g, newVersion);
            });
        }
        fs.writeFileSync(versionJsonPath, JSON.stringify(vData, null, 2) + '\n', 'utf8');
        console.log(`  ✓ 已更新 version.json -> ${newVersion}`);
    } catch (e) {
        console.warn(`  ⚠️ 更新 version.json 异常:`, e.message);
    }
}

// 7. desktop/ipc.js
const ipcPath = path.join(ROOT, 'desktop', 'ipc.js');
if (fs.existsSync(ipcPath)) {
    let ipc = fs.readFileSync(ipcPath, 'utf8');
    ipc = ipc.replace(/version:\s*['"]\d+\.\d+\.\d+['"]/g, `version: '${newVersion}'`);
    ipc = ipc.replace(/current_version:\s*['"]\d+\.\d+\.\d+['"]/g, `current_version: '${newVersion}'`);
    ipc = ipc.replace(/\(v\d+\.\d+\.\d+\)/g, `(v${newVersion})`);
    fs.writeFileSync(ipcPath, ipc, 'utf8');
    console.log(`  ✓ 已更新 desktop/ipc.js -> version: '${newVersion}'`);
}

// 8. shared/components/about-panel.js
const aboutPath = path.join(ROOT, 'shared', 'components', 'about-panel.js');
if (fs.existsSync(aboutPath)) {
    let about = fs.readFileSync(aboutPath, 'utf8');
    about = about.replace(/version:\s*['"]\d+\.\d+\.\d+['"]/g, `version: '${newVersion}'`);
    about = about.replace(/\|\|\s*['"]\d+\.\d+\.\d+['"]/g, `|| '${newVersion}'`);
    fs.writeFileSync(aboutPath, about, 'utf8');
    console.log(`  ✓ 已更新 shared/components/about-panel.js -> version: '${newVersion}'`);
}

// 9. public/index.html
const indexPath = path.join(ROOT, 'public', 'index.html');
if (fs.existsSync(indexPath)) {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    indexHtml = indexHtml.replace(/apple-badge-sm">v\d+\.\d+\.\d+<\/span>/g, `apple-badge-sm">v${newVersion}</span>`);
    fs.writeFileSync(indexPath, indexHtml, 'utf8');
    console.log(`  ✓ 已更新 public/index.html -> v${newVersion}`);
}

// 10. 启动程序.bat
const batPath = path.join(ROOT, '启动程序.bat');
if (fs.existsSync(batPath)) {
    let bat = fs.readFileSync(batPath, 'utf8');
    bat = bat.replace(/LanDisk-Pro-\d+\.\d+\.\d+-Portable\.exe/g, `LanDisk-Pro-${newVersion}-Portable.exe`);
    fs.writeFileSync(batPath, bat, 'utf8');
    console.log(`  ✓ 已更新 启动程序.bat -> LanDisk-Pro-${newVersion}-Portable.exe`);
}

console.log(`\n🎉 全项目版本号已 100% 同步为 v${newVersion}！`);
