const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { bundleServer, DIST_SERVER, OUT_FILE } = require('./bundle-server');

const ROOT = path.resolve(__dirname, '..');
const BINARIES_DIR = path.join(ROOT, 'src-tauri', 'binaries');
const TARGET_EXE = path.join(BINARIES_DIR, 'lan-disk-server-x86_64-pc-windows-msvc.exe');
const SEA_CONFIG = path.join(DIST_SERVER, 'sea-config.json');
const SEA_BLOB = path.join(DIST_SERVER, 'sea-prep.blob');

function findSigntool() {
    try {
        const which = execSync('where signtool', { stdio: 'pipe' }).toString().trim().split('\n')[0].trim();
        if (which && fs.existsSync(which)) return which;
    } catch (e) {}

    const kitsDir = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
    if (fs.existsSync(kitsDir)) {
        try {
            const versions = fs.readdirSync(kitsDir).sort().reverse();
            for (const v of versions) {
                const p = path.join(kitsDir, v, 'x64', 'signtool.exe');
                if (fs.existsSync(p)) return p;
            }
        } catch (e) {}
    }
    return null;
}

async function buildSidecar() {
    console.log('====================================================');
    console.log('🚀 [Build Sidecar] 编译猫步互联独立单二进制服务端');
    console.log('====================================================');

    // 1. 打包 JavaScript 模块
    await bundleServer();

    // 2. 确保目标目录存在
    if (!fs.existsSync(BINARIES_DIR)) {
        fs.mkdirSync(BINARIES_DIR, { recursive: true });
    }

    // 3. 生成 SEA 配置与 Blob
    console.log('[Build Sidecar] 生成 Node.js SEA 配置与二进制 Blob...');
    const seaConfigData = {
        main: OUT_FILE,
        output: SEA_BLOB,
        disableExperimentalSEAWarning: true
    };
    fs.writeFileSync(SEA_CONFIG, JSON.stringify(seaConfigData, null, 2), 'utf8');

    execSync(`node --experimental-sea-config "${SEA_CONFIG}"`, { stdio: 'inherit', cwd: ROOT });

    // 4. 拷贝当前 Node 运行时并去除数字签名
    console.log(`[Build Sidecar] 拷贝 Node 运行时至: ${TARGET_EXE}...`);
    fs.copyFileSync(process.execPath, TARGET_EXE);

    const signtool = findSigntool();
    if (signtool) {
        console.log(`[Build Sidecar] 使用 signtool 移除原签名: ${signtool}`);
        try {
            execSync(`"${signtool}" remove /s "${TARGET_EXE}"`, { stdio: 'inherit' });
        } catch (e) {
            console.warn('[Build Sidecar] signtool remove 警告:', e.message);
        }
    } else {
        console.log('[Build Sidecar] 未检测到 signtool，直接进行注入');
    }

    // 5. 使用 postject 注入 SEA Blob
    console.log('[Build Sidecar] 注入 SEA Blob 到二进制可执行文件...');
    const postjectCmd = `npx --yes postject "${TARGET_EXE}" NODE_SEA_BLOB "${SEA_BLOB}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
    execSync(postjectCmd, { stdio: 'inherit', cwd: ROOT });

    // 6. 拷贝 7za.exe 依赖到 binaries 目录
    try {
        const p7za = require('7zip-bin').path7za;
        if (p7za && fs.existsSync(p7za)) {
            const target7za = path.join(BINARIES_DIR, '7za.exe');
            fs.copyFileSync(p7za, target7za);
            console.log(`[Build Sidecar] 已同步 7za.exe 到: ${target7za}`);
        }
    } catch (e) {
        console.warn('[Build Sidecar] 7za.exe 同步跳过:', e.message);
    }

    // 7. 拷贝 system-control.ps1 到 binaries 目录供生产 Sidecar 使用
    try {
        const psScript = path.join(ROOT, 'server', 'services', 'system-control.ps1');
        if (fs.existsSync(psScript)) {
            const targetPs = path.join(BINARIES_DIR, 'system-control.ps1');
            fs.copyFileSync(psScript, targetPs);
            console.log(`[Build Sidecar] 已同步 system-control.ps1 到: ${targetPs}`);
        }
    } catch (e) {
        console.warn('[Build Sidecar] system-control.ps1 同步跳过:', e.message);
    }

    const exeStat = fs.statSync(TARGET_EXE);
    console.log('----------------------------------------------------');
    console.log(`✅ [Build Sidecar] 成功编译 Sidecar 可执行文件！`);
    console.log(`   路径: ${TARGET_EXE}`);
    console.log(`   物理尺寸: ${(exeStat.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('====================================================');
}

if (require.main === module) {
    buildSidecar().catch(err => {
        console.error('❌ [Build Sidecar] 失败:', err);
        process.exit(1);
    });
}

module.exports = { buildSidecar };
