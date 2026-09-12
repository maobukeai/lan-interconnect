/**
 * scripts/prepare-windows-artifacts.js
 * 跨平台收集并规范化 Windows 5 大发布产物，彻底避免 PowerShell UTF-8 中文字符乱码导致打包中断。
 */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const version = process.argv[2] || require('../package.json').version;
const distOutput = path.join(ROOT, 'dist_output');

async function main() {
    if (!fs.existsSync(distOutput)) {
        fs.mkdirSync(distOutput, { recursive: true });
    }

    console.log('[Artifacts] 正在准备 Windows 发布产物，目标版本: ' + version);

    // 1. Electron 安装版与单文件
    const releaseDir = path.join(ROOT, 'release');
    if (fs.existsSync(releaseDir)) {
        const files = fs.readdirSync(releaseDir);

        // 查找 Setup 安装包 (e.g. 猫步互联 Pro Setup 2.0.1.exe)
        const setupFile = files.find(f => f.endsWith('.exe') && f.toLowerCase().includes('setup'));
        if (setupFile) {
            const src = path.join(releaseDir, setupFile);
            const dest = path.join(distOutput, 'LanDisk-Pro-' + version + '-Setup.exe');
            fs.copyFileSync(src, dest);
            console.log('[Artifacts] 已生成: LanDisk-Pro-' + version + '-Setup.exe (' + (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB)');
        } else {
            console.error('[Artifacts] 未找到 Electron Setup 安装包！');
        }

        // 查找单文件免安装版 (e.g. 猫步互联 Pro 2.0.1.exe)
        const singleFile = files.find(f => f.endsWith('.exe') && !f.toLowerCase().includes('setup') && !f.includes('uninstaller'));
        if (singleFile) {
            const src = path.join(releaseDir, singleFile);
            const dest = path.join(distOutput, 'LanDisk-Pro-' + version + '-Single-Portable.exe');
            fs.copyFileSync(src, dest);
            console.log('[Artifacts] 已生成: LanDisk-Pro-' + version + '-Single-Portable.exe (' + (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB)');
        } else {
            console.error('[Artifacts] 未找到 Electron 单文件免安装包！');
        }
    } else {
        console.error('[Artifacts] release 目录不存在: ' + releaseDir);
    }

    // 2. Tauri 极轻单文件与安装包
    const tauriExe = path.join(ROOT, 'src-tauri', 'target', 'release', 'lan-disk.exe');
    if (fs.existsSync(tauriExe)) {
        const dest = path.join(distOutput, 'LanDisk-Pro-' + version + '-Tauri-Portable.exe');
        fs.copyFileSync(tauriExe, dest);
        console.log('[Artifacts] 已生成: LanDisk-Pro-' + version + '-Tauri-Portable.exe (' + (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB)');
    } else {
        console.error('[Artifacts] 未找到 Tauri 单文件: ' + tauriExe);
    }

    const nsisDir = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
    if (fs.existsSync(nsisDir)) {
        const nsisFiles = fs.readdirSync(nsisDir);
        const tauriSetup = nsisFiles.find(f => f.endsWith('.exe') && f.toLowerCase().includes('setup'));
        if (tauriSetup) {
            const src = path.join(nsisDir, tauriSetup);
            const dest = path.join(distOutput, 'LanDisk-Pro-' + version + '-Tauri-Setup.exe');
            fs.copyFileSync(src, dest);
            console.log('[Artifacts] 已生成: LanDisk-Pro-' + version + '-Tauri-Setup.exe (' + (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB)');
        } else {
            console.error('[Artifacts] 未找到 Tauri NSIS 安装包！');
        }
    } else {
        console.error('[Artifacts] 未找到 Tauri NSIS 目录: ' + nsisDir);
    }

    // 3. 打包 win-unpacked 为免安装绿色压缩包
    const winUnpacked = path.join(releaseDir, 'win-unpacked');
    const zipDest = path.join(distOutput, 'LanDisk-Pro-' + version + '-Green-Portable.zip');

    if (fs.existsSync(winUnpacked)) {
        console.log('[Artifacts] 正在生成免安装绿色压缩包...');
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipDest);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                console.log('[Artifacts] 已生成: LanDisk-Pro-' + version + '-Green-Portable.zip (' + (archive.pointer() / 1024 / 1024).toFixed(2) + ' MB)');
                resolve();
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);
            archive.directory(winUnpacked, false);
            archive.finalize();
        });
    } else {
        console.error('[Artifacts] win-unpacked 目录不存在: ' + winUnpacked);
    }

    console.log('=== dist_output 内容清单 ===');
    const outputs = fs.readdirSync(distOutput);
    for (const f of outputs) {
        const stat = fs.statSync(path.join(distOutput, f));
        console.log(' - ' + f + ' (' + (stat.size / 1024 / 1024).toFixed(2) + ' MB)');
    }
}

main().catch(err => {
    console.error('[Artifacts] 执行异常:', err);
    process.exit(1);
});
