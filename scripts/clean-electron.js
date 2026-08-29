const path = require('path');
const fs = require('fs');

exports.default = async function (context) {
    const appOutDir = context.appOutDir;
    console.log('[Slimming] Optimizing Electron build at:', appOutDir);

    // 1. 保留中文和英文语言包，移除其余 50+ 种多余语言包 (节省约 45MB)
    const localesDir = path.join(appOutDir, 'locales');
    if (fs.existsSync(localesDir)) {
        const keepLocales = ['zh-CN.pak', 'en-US.pak', 'zh-TW.pak'];
        const files = fs.readdirSync(localesDir);
        let removed = 0;
        for (const file of files) {
            if (!keepLocales.includes(file)) {
                try {
                    fs.unlinkSync(path.join(localesDir, file));
                    removed++;
                } catch (e) {}
            }
        }
        console.log(`[Slimming] Removed ${removed} unnecessary language pak files.`);
    }

    // 2. 移除庞大的离线协议文档与未使用的冗余编译器二进制 (节省约 45MB)
    const removeFiles = [
        'LICENSES.chromium.html', // ~19.5 MB
        'dxcompiler.dll',        // ~25.6 MB
        'dxil.dll'               // ~1.5 MB
    ];
    for (const f of removeFiles) {
        const p = path.join(appOutDir, f);
        if (fs.existsSync(p)) {
            try {
                fs.unlinkSync(p);
                console.log('[Slimming] Removed bulky file:', f);
            } catch (e) {}
        }
    }
};
