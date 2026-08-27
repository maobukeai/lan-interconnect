const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SOURCE_IMAGE = 'C:\\Users\\20269\\.gemini\\antigravity\\brain\\eb915554-3ed3-4cee-ab02-ea6ac22c183d\\lan_icon_3d_portal_1787844701339.jpg';

function createIco(pngBuffers) {
    const count = pngBuffers.length;
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type 1 = ICO
    header.writeUInt16LE(count, 4); // count

    const dirEntries = [];
    let offset = 6 + count * 16;
    const imageDatas = [];

    for (const item of pngBuffers) {
        const { width, height, buffer } = item;
        const entry = Buffer.alloc(16);
        entry.writeUInt8(width >= 256 ? 0 : width, 0);
        entry.writeUInt8(height >= 256 ? 0 : height, 1);
        entry.writeUInt8(0, 2);
        entry.writeUInt8(0, 3);
        entry.writeUInt16LE(1, 4);
        entry.writeUInt16LE(32, 6);
        entry.writeUInt32LE(buffer.length, 8);
        entry.writeUInt32LE(offset, 12);

        dirEntries.push(entry);
        imageDatas.push(buffer);
        offset += buffer.length;
    }

    return Buffer.concat([header, ...dirEntries, ...imageDatas]);
}

app.whenReady().then(async () => {
    try {
        console.log('Loading source image from:', SOURCE_IMAGE);
        const sourceImg = nativeImage.createFromPath(SOURCE_IMAGE);
        const size = sourceImg.getSize();
        console.log('Source image loaded, dimensions:', size.width, 'x', size.height);

        // 导出 512x512 PNG
        const png512 = sourceImg.resize({ width: 512, height: 512, quality: 'best' }).toPNG();
        console.log('512x512 PNG size:', png512.length, 'bytes');

        const rootIconPng = path.join(__dirname, '..', 'icon.png');
        const faviconPng = path.join(__dirname, '..', 'public', 'favicon.png');
        const touchPng = path.join(__dirname, '..', 'public', 'apple-touch-icon.png');
        const sharedPng = path.join(__dirname, '..', 'shared', 'app-icon.png');
        const sharedJpg = path.join(__dirname, '..', 'shared', 'app-icon.jpg');

        fs.writeFileSync(rootIconPng, png512);
        fs.writeFileSync(faviconPng, png512);
        fs.writeFileSync(touchPng, png512);
        fs.writeFileSync(sharedPng, png512);
        fs.copyFileSync(SOURCE_IMAGE, sharedJpg);

        // 生成 ICO
        const icoSizes = [256, 128, 64, 48, 32, 16];
        const pngList = icoSizes.map(s => ({
            width: s,
            height: s,
            buffer: sourceImg.resize({ width: s, height: s, quality: 'best' }).toPNG()
        }));

        const icoBuffer = createIco(pngList);
        fs.writeFileSync(path.join(__dirname, '..', 'icon.ico'), icoBuffer);
        fs.writeFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'), icoBuffer);

        // 更新 SVG
        const base64Png = png512.toString('base64');
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <clipPath id="squircleClip">
      <rect x="0" y="0" width="512" height="512" rx="114" ry="114" />
    </clipPath>
  </defs>
  <g clip-path="url(#squircleClip)">
    <image width="512" height="512" href="data:image/png;base64,${base64Png}" preserveAspectRatio="xMidYMid slice" />
  </g>
</svg>
`;
        fs.writeFileSync(path.join(__dirname, '..', 'icon.svg'), svgContent);
        fs.writeFileSync(path.join(__dirname, '..', 'public', 'favicon.svg'), svgContent);

        console.log('✅ ALL ICONS EXPORTED & SYNCED PERFECTLY!');
    } catch (err) {
        console.error('Error during export:', err);
    } finally {
        app.quit();
    }
});
