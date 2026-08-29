const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'desktop-dist');

console.log('[Desktop Build] Packaging desktop web distribution to:', DIST);

if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const item of fs.readdirSync(src)) {
            copyRecursive(path.join(src, item), path.join(dest, item));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

// 1. 复制 gui.html 为 index.html
fs.copyFileSync(path.join(ROOT, 'gui.html'), path.join(DIST, 'index.html'));
fs.copyFileSync(path.join(ROOT, 'gui.html'), path.join(DIST, 'gui.html'));

// 2. 复制 desktop 与 shared
copyRecursive(path.join(ROOT, 'desktop'), path.join(DIST, 'desktop'));
copyRecursive(path.join(ROOT, 'shared'), path.join(DIST, 'shared'));

// 3. 复制图标
const assets = ['icon.png', 'icon.ico', 'favicon.png', 'favicon.svg', 'apple-touch-icon.png'];
assets.forEach(a => {
    const p = path.join(ROOT, a);
    if (fs.existsSync(p)) {
        fs.copyFileSync(p, path.join(DIST, a));
    }
});

console.log('[Desktop Build] Desktop web bundle successfully created in desktop-dist!');
