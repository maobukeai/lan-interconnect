const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const QRCode = require('qrcode');
const { startServer, stopServer } = require('./server.js');
const os = require('os');

let mainWindow;
let tray = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 650,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        resizable: true,
        title: '局域网互联 - 高级控制中心',
        icon: path.join(__dirname, 'icon.png'),
        frame: false, // 无边框窗口更高级
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0f172a',
            symbolColor: '#ffffff'
        }
    });
    mainWindow.loadFile('gui.html');

    // 拦截关闭事件实现最小化到托盘
    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

app.whenReady().then(() => {
    createWindow();
    
    // 设置系统托盘
    try {
        tray = new Tray(path.join(__dirname, 'icon.png')); // 确保有icon.png或使用备用方案
        
        const contextMenu = Menu.buildFromTemplate([
            { label: '显示主面板', click: () => mainWindow.show() },
            { type: 'separator' },
            { label: '退出', click: () => { app.isQuiting = true; app.quit(); } }
        ]);
        tray.setToolTip('局域网互联 Pro');
        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => mainWindow.show());
    } catch(e) {
        // 如果没有 icon.png，Electron 可能会报错，这里做个 fallback 暂时不设置 tray 或者提供空图片
        console.log("No tray icon found, skipping tray creation.");
    }
    
    if (!tray) {
        console.log("Tray not created successfully.");
    }
});

app.on('before-quit', () => {
    app.isQuiting = true;
    stopServer(); // 确保在退出前停止服务器，释放端口和资源
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC 通信：打开根目录
ipcMain.handle('open-root', async () => {
    shell.openPath('C:\\');
    return { success: true };
});

// IPC 通信：打开外部链接
ipcMain.handle('open-url', async (event, url) => {
    shell.openExternal(url);
    return { success: true };
});

// IPC 通信：开启调试工具
ipcMain.handle('open-dev-tools', async () => {
    if (mainWindow) {
        mainWindow.webContents.openDevTools();
    }
    return { success: true };
});

// IPC 通信：打开防火墙设置
ipcMain.handle('open-firewall', async () => {
    require('child_process').exec('control firewall.cpl');
    return { success: true };
});

// IPC 通信：选择文件夹
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择自定义互传文件夹'
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

// IPC 通信：获取系统信息 (供电脑端控制面板监控使用)
ipcMain.handle('get-sys-info', async () => {
    let diskSpace = '未知';
    try {
        // 尝试获取 C 盘剩余空间（仅 Windows 示例，实际可更复杂）
        if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            const output = execSync('wmic logicaldisk get size,freespace,caption').toString();
            const lines = output.split('\n').filter(l => l.trim().length > 0);
            if (lines.length > 1) {
                // 找 C 盘
                const cLine = lines.find(l => l.includes('C:'));
                if (cLine) {
                    const parts = cLine.trim().split(/\s+/);
                    if (parts.length >= 3) {
                        const free = (parseInt(parts[1]) / 1024 / 1024 / 1024).toFixed(1);
                        const total = (parseInt(parts[2]) / 1024 / 1024 / 1024).toFixed(1);
                        diskSpace = `${free} GB 可用 / 共 ${total} GB`;
                    }
                }
            }
        }
    } catch (e) {
        console.log('获取磁盘信息失败', e.message);
    }

    return {
        cpu: os.cpus()[0].model,
        memTotal: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
        memFree: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
        uptime: os.uptime(),
        platform: os.platform(),
        diskSpace: diskSpace
    };
});

// IPC 通信：获取网络接口信息
ipcMain.handle('get-network-info', () => {
    const interfaces = os.networkInterfaces();
    let ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push({ name, ip: iface.address });
            }
        }
    }
    return ips;
});

// IPC 通信：执行定时关机/取消关机
ipcMain.handle('schedule-shutdown', async (event, minutes) => {
    try {
        const { exec } = require('child_process');
        if (minutes > 0) {
            // 设置定时关机 (Windows: shutdown -s -t 秒数)
            exec(`shutdown -s -t ${minutes * 60}`);
            return { success: true, message: `已设置在 ${minutes} 分钟后关机` };
        } else {
            // 取消关机 (Windows: shutdown -a)
            exec('shutdown -a');
            return { success: true, message: '已取消定时关机' };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// IPC 通信：开机自启控制
ipcMain.handle('toggle-autostart', (event, enable) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe')
    });
    return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('get-autostart', () => {
    return app.getLoginItemSettings().openAtLogin;
});

// IPC 通信：启动服务
ipcMain.handle('start-server', async (event, config) => {
    try {
        const info = await startServer(config);
        const url = `http://${info.ip}:${info.port}`;
        
        // 生成二维码
        const qrDataUrl = await QRCode.toDataURL(url, { 
            width: 250, 
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' } // 白底黑字二维码，透明可能导致有些扫码器识别不了
        });
        
        return { success: true, url, qrDataUrl };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC 通信：停止服务
ipcMain.handle('stop-server', () => {
    stopServer();
    return { success: true };
});

// IPC 通信：窗口控制
ipcMain.handle('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('close-window', () => {
    if (mainWindow) mainWindow.close(); // 会触发 close 事件，隐藏到托盘
});
