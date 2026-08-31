/**
 * 把 Capacitor 生成的 capacitor.build.gradle 降到 Java 17。
 *
 * 必须在 `npx cap sync android` 之后运行：cap sync 每次都会重新生成这个文件并写回
 * VERSION_21，所以在 sync 之前打补丁等于没打（这正是 build-mobile-web.js 里那段
 * 补丁一直不生效的原因 —— 它跑在 sync 前面）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const capGradle = path.join(ROOT, 'android', 'app', 'capacitor.build.gradle');

if (!fs.existsSync(capGradle)) {
    console.log('[Android Patch] capacitor.build.gradle 不存在，跳过');
    process.exit(0);
}

const original = fs.readFileSync(capGradle, 'utf8');
const patched = original.replace(/VERSION_21/g, 'VERSION_17');

if (patched === original) {
    console.log('[Android Patch] 已是 Java 17，无需改动');
} else {
    fs.writeFileSync(capGradle, patched, 'utf8');
    console.log('[Android Patch] capacitor.build.gradle 已降级到 JavaVersion.VERSION_17');
}
