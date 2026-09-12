const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

console.log('==================================================');
console.log('📦 [Prepare Tauri] 开始构建桌面端前端静态资源与服务端 Sidecar');
console.log('==================================================');

// 1. 构建桌面前端
console.log('\n[1/2] 构建桌面前端静态资源 (desktop-dist)...');
execSync('node scripts/build-desktop-web.js', { stdio: 'inherit', cwd: ROOT });

// 2. 构建服务端 Sidecar 单二进制
console.log('\n[2/2] 构建服务端 Sidecar 单二进制...');
execSync('node scripts/build-sidecar.js', { stdio: 'inherit', cwd: ROOT });

console.log('\n✨ [Prepare Tauri] 前端与 Sidecar 准备就绪，继续进入 Tauri 编译管线！');
console.log('==================================================\n');
