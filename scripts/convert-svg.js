const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 512,
        height: 512,
        show: false,
        transparent: true,
        frame: false
    });

    const svgPath = path.join(__dirname, '..', 'icon.svg');
    await win.loadFile(svgPath);
    await new Promise(r => setTimeout(r, 600));

    const image = await win.capturePage();
    const pngBuffer = image.toPNG();

    const rootIconPath = path.join(__dirname, '..', 'icon.png');
    const faviconPath = path.join(__dirname, '..', 'public', 'favicon.png');
    const touchPath = path.join(__dirname, '..', 'public', 'apple-touch-icon.png');
    const sharedPath = path.join(__dirname, '..', 'shared', 'app-icon.png');
    const sharedJpgPath = path.join(__dirname, '..', 'shared', 'app-icon.jpg');

    fs.writeFileSync(rootIconPath, pngBuffer);
    fs.writeFileSync(faviconPath, pngBuffer);
    fs.writeFileSync(touchPath, pngBuffer);
    fs.writeFileSync(sharedPath, pngBuffer);
    fs.writeFileSync(sharedJpgPath, pngBuffer);

    console.log('Successfully rendered SVG to crisp PNG icons!');
    app.quit();
});
