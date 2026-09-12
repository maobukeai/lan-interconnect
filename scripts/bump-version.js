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

console.log(`\n🎉 全项目版本号已 100% 同步为 v${newVersion}！`);
