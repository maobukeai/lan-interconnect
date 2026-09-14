/**
 * scripts/prepare-windows-artifacts.js
 * 收集并规范化 Windows 发布产物（Tauri 2.0 便携版与 NSIS 安装包）至 dist_output 目录。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const version = process.argv[2] || require('../package.json').version;
const distOutput = path.join(ROOT, 'dist_output');

async function main() {
    if (!fs.existsSync(distOutput)) {
        fs.mkdirSync(distOutput, { recursive: true });
    }

    console.log('[Artifacts] 正在准备 Windows 发布产物，目标版本: ' + version);

    // 1. Tauri 极轻单文件便携版
    const tauriExe = path.join(ROOT, 'src-tauri', 'target', 'release', 'lan-disk.exe');
    if (fs.existsSync(tauriExe)) {
        const dest = path.join(distOutput, 'LanDisk-Pro-' + version + '-Portable.exe');
        fs.copyFileSync(tauriExe, dest);
        console.log('[Artifacts] 已生成: LanDisk-Pro-' + version + '-Portable.exe (' + (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB)');

        // 同步复制服务端 Sidecar 至 dist_output 与 release 目录，保证便携版与本地运行均脱机自运行
        const sidecarExe = path.join(ROOT, 'src-tauri', 'binaries', 'lan-disk-server-x86_64-pc-windows-msvc.exe');
        if (fs.existsSync(sidecarExe)) {
            const sidecarDest = path.join(distOutput, 'lan-disk-server.exe');
            fs.copyFileSync(sidecarExe, sidecarDest);
            console.log('[Artifacts] 已规整: dist_output/lan-disk-server.exe (' + (fs.statSync(sidecarDest).size / 1024 / 1024).toFixed(2) + ' MB)');

            const releaseSidecar = path.join(ROOT, 'src-tauri', 'target', 'release', 'lan-disk-server.exe');
            fs.copyFileSync(sidecarExe, releaseSidecar);
            console.log('[Artifacts] 已同步: target/release/lan-disk-server.exe');
        }
    } else {
        console.error('[Artifacts] 未找到 Tauri 单文件: ' + tauriExe);
    }

    // 2. Tauri NSIS 安装包
    const nsisDir = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
    if (fs.existsSync(nsisDir)) {
        const nsisFiles = fs.readdirSync(nsisDir);
        const tauriSetup = nsisFiles.find(f => f.endsWith('.exe') && f.toLowerCase().includes('setup'));
        if (tauriSetup) {
            const src = path.join(nsisDir, tauriSetup);
            const dest = path.join(distOutput, 'LanDisk-Pro-' + version + '-Setup.exe');
            fs.copyFileSync(src, dest);
            console.log('[Artifacts] 已生成: LanDisk-Pro-' + version + '-Setup.exe (' + (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB)');
        } else {
            console.error('[Artifacts] 未找到 Tauri NSIS 安装包！');
        }
    } else {
        console.error('[Artifacts] 未找到 Tauri NSIS 目录: ' + nsisDir);
    }

    // 3. Tauri WiX MSI 安装包
    const msiDir = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'msi');
    if (fs.existsSync(msiDir)) {
        const msiFiles = fs.readdirSync(msiDir);
        const tauriMsi = msiFiles.find(f => f.endsWith('.msi'));
        if (tauriMsi) {
            const src = path.join(msiDir, tauriMsi);
            const dest = path.join(distOutput, 'LanDisk-Pro-' + version + '-Setup.msi');
            fs.copyFileSync(src, dest);
            console.log('[Artifacts] 已生成: LanDisk-Pro-' + version + '-Setup.msi (' + (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB)');
        } else {
            console.warn('[Artifacts] 未在 msi 目录下找到 .msi 文件');
        }
    } else {
        console.warn('[Artifacts] msi 目录不存在: ' + msiDir);
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
