const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const srcIcon = path.join(ROOT, 'icon.png');
const baseRes = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

console.log('Generating Android icons from:', srcIcon);

const sizes = [
    { dir: 'mipmap-mdpi', size: 48, fg: 108 },
    { dir: 'mipmap-hdpi', size: 72, fg: 162 },
    { dir: 'mipmap-xhdpi', size: 96, fg: 216 },
    { dir: 'mipmap-xxhdpi', size: 144, fg: 324 },
    { dir: 'mipmap-xxxhdpi', size: 192, fg: 432 }
];

async function run() {
    for (const s of sizes) {
        const targetDir = path.join(baseRes, s.dir);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        
        // 1. ic_launcher.png (方角标准图标)
        await sharp(srcIcon).resize(s.size, s.size).png().toFile(path.join(targetDir, 'ic_launcher.png'));
        
        // 2. ic_launcher_round.png (圆角圆形图标)
        const r = s.size / 2;
        const maskSvg = Buffer.from(`<svg width="${s.size}" height="${s.size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`);
        await sharp(srcIcon).resize(s.size, s.size).composite([{ input: maskSvg, blend: 'dest-in' }]).png().toFile(path.join(targetDir, 'ic_launcher_round.png'));

        // 3. ic_launcher_foreground.png (用于 Android 8+ 自适应图标)
        await sharp(srcIcon).resize(s.fg, s.fg).png().toFile(path.join(targetDir, 'ic_launcher_foreground.png'));
        console.log('Generated mipmaps for:', s.dir);
    }

    // Splash screens
    const splashes = [
        { dir: 'drawable', w: 512, h: 512, name: 'splash.png' },
        { dir: 'drawable-land-mdpi', w: 800, h: 480, name: 'splash.png' },
        { dir: 'drawable-land-hdpi', w: 1024, h: 600, name: 'splash.png' },
        { dir: 'drawable-land-xhdpi', w: 1280, h: 720, name: 'splash.png' },
        { dir: 'drawable-land-xxhdpi', w: 1600, h: 960, name: 'splash.png' },
        { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280, name: 'splash.png' },
        { dir: 'drawable-port-mdpi', w: 320, h: 480, name: 'splash.png' },
        { dir: 'drawable-port-hdpi', w: 480, h: 800, name: 'splash.png' },
        { dir: 'drawable-port-xhdpi', w: 720, h: 1280, name: 'splash.png' },
        { dir: 'drawable-port-xxhdpi', w: 960, h: 1600, name: 'splash.png' },
        { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920, name: 'splash.png' }
    ];

    for (const sp of splashes) {
        const sDir = path.join(baseRes, sp.dir);
        if (!fs.existsSync(sDir)) fs.mkdirSync(sDir, { recursive: true });
        
        const iconSize = Math.min(sp.w, sp.h) * 0.45 | 0;
        const iconResized = await sharp(srcIcon).resize(iconSize, iconSize).toBuffer();
        
        await sharp({
            create: {
                width: sp.w,
                height: sp.h,
                channels: 4,
                background: { r: 15, g: 23, b: 42, alpha: 1 }
            }
        })
        .composite([{ input: iconResized, gravity: 'center' }])
        .png()
        .toFile(path.join(sDir, sp.name));
        console.log('Generated splash for:', sp.dir);
    }

    console.log('All Android icons and splashes generated successfully!');
}

run().catch(e => { console.error(e); process.exit(1); });
