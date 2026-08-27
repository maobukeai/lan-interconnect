const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

function createIco(pngBuffers) {
    // ICO Header: 6 bytes
    // 2 bytes: reserved (0)
    // 2 bytes: type (1 for ICO)
    // 2 bytes: image count
    const count = pngBuffers.length;
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(count, 4);

    const dirEntries = [];
    let offset = 6 + count * 16; // 16 bytes per directory entry

    const imageDatas = [];

    for (const item of pngBuffers) {
        const { width, height, buffer } = item;
        const entry = Buffer.alloc(16);
        entry.writeUInt8(width >= 256 ? 0 : width, 0);
        entry.writeUInt8(height >= 256 ? 0 : height, 1);
        entry.writeUInt8(0, 2); // color count
        entry.writeUInt8(0, 3); // reserved
        entry.writeUInt16LE(1, 4); // color planes
        entry.writeUInt16LE(32, 6); // bits per pixel
        entry.writeUInt32LE(buffer.length, 8); // size of image data
        entry.writeUInt32LE(offset, 12); // offset of image data

        dirEntries.push(entry);
        imageDatas.push(buffer);
        offset += buffer.length;
    }

    return Buffer.concat([header, ...dirEntries, ...imageDatas]);
}

app.whenReady().then(async () => {
    try {
        const iconPngPath = path.join(__dirname, '..', 'icon.png');
        const baseImg = nativeImage.createFromPath(iconPngPath);

        const sizes = [256, 128, 64, 48, 32, 16];
        const pngList = sizes.map(size => ({
            width: size,
            height: size,
            buffer: baseImg.resize({ width: size, height: size, quality: 'best' }).toPNG()
        }));

        const icoBuffer = createIco(pngList);
        const rootIcoPath = path.join(__dirname, '..', 'icon.ico');
        const publicIcoPath = path.join(__dirname, '..', 'public', 'favicon.ico');

        fs.writeFileSync(rootIcoPath, icoBuffer);
        fs.writeFileSync(publicIcoPath, icoBuffer);

        console.log('SUCCESS: icon.ico & favicon.ico generated with sizes:', sizes.join(', '));
    } catch (err) {
        console.error('Error generating ICO:', err);
    } finally {
        app.quit();
    }
});
