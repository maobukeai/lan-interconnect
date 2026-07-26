const { app, BrowserWindow, ipcMain, Menu, Tray, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const { startServer, stopServer } = require('./server.js');

let mainWindow = null;
let tray = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        createWindow();
        createTray();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1080,
        height: 720,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        backgroundColor: '#0a0c14',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'icon.png')
    });

    mainWindow.loadFile('gui.html');

    mainWindow.on('minimize', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('window-state-changed', { minimized: true });
        }
    });

    mainWindow.on('restore', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('window-state-changed', { minimized: false });
        }
    });

    mainWindow.on('hide', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('window-state-changed', { minimized: true });
        }
    });

    mainWindow.on('show', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('window-state-changed', { minimized: false });
        }
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'icon.png');
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示控制面板',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: '退出局域网互联',
            click: () => {
                app.isQuitting = true;
                stopServer().then(() => {
                    app.quit();
                });
            }
        }
    ]);

    tray.setToolTip('局域网互联 Pro - 控制中心');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// IPC 通信：启动服务
ipcMain.handle('start-server', async (event, config) => {
    try {
        const info = await startServer(config);
        const url = `http://${info.ip}:${info.port}`;
        const qrUrl = `${url}?token=${info.token}`;
        
        // 生成包含 Token 免密授权的二维码
        const qrDataUrl = await QRCode.toDataURL(qrUrl, { 
            width: 250, 
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        });
        
        return { success: true, url, qrUrl, token: info.token, qrDataUrl };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC 通信：停止服务
ipcMain.handle('stop-server', async () => {
    await stopServer();
    return { success: true };
});

// IPC 通信：窗口控制
ipcMain.handle('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.handle('close-window', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('quit-app', () => {
    app.isQuitting = true;
    app.quit();
});

ipcMain.handle('open-dev-tools', () => {
    if (mainWindow) mainWindow.webContents.openDevTools();
});

ipcMain.handle('open-url', async (event, targetUrl) => {
    let finalUrl = targetUrl || 'http://127.0.0.1:3000';
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'http://' + finalUrl;
    }
    
    // 方法 1: Electron 原生 shell.openExternal
    try {
        await shell.openExternal(finalUrl);
    } catch (e) {
        console.warn('shell.openExternal failed, using OS fallback:', e.message);
    }

    // 方法 2: 操作系统原生指令备用开辟 (Windows: start, macOS: open, Linux: xdg-open)
    try {
        const { exec } = require('child_process');
        if (process.platform === 'win32') {
            exec(`start "" "${finalUrl}"`);
        } else if (process.platform === 'darwin') {
            exec(`open "${finalUrl}"`);
        } else {
            exec(`xdg-open "${finalUrl}"`);
        }
    } catch (err) {}

    return { success: true };
});

ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('open-root', () => {
    shell.openPath('C:\\');
});

ipcMain.handle('open-firewall', () => {
    shell.openExternal('ms-settings:windowsdefender');
});

ipcMain.handle('get-autostart', () => {
    try {
        return app.getLoginItemSettings().openAtLogin;
    } catch (e) { return false; }
});

ipcMain.handle('set-autostart', (event, enable) => {
    try {
        app.setLoginItemSettings({ openAtLogin: !!enable });
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-network-info', () => {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && !alias.internal) {
                ips.push({ name: devName, address: alias.address });
            }
        }
    }
    return ips;
});

ipcMain.handle('get-sys-info', async () => {
    const cpus = os.cpus();
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
    
    let totalIdle = 0, totalTick = 0;
    cpus.forEach(cpu => {
        for (const type in cpu.times) {
            totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
    });
    const idle = totalIdle / (cpus.length || 1);
    const total = totalTick / (cpus.length || 1);
    const cpuUsage = Math.round(100 - (idle / total) * 100) || 5;

    return {
        cpu: cpus[0] ? cpus[0].model : 'CPU',
        cpuUsage,
        memTotal: parseFloat(totalMem),
        memFree: parseFloat(freeMem),
        platform: os.platform(),
        arch: os.arch()
    };
});

let shutdownTimer = null;
ipcMain.handle('schedule-shutdown', (event, minutes) => {
    if (shutdownTimer) clearTimeout(shutdownTimer);
    if (minutes > 0) {
        shutdownTimer = setTimeout(() => {
            require('child_process').exec('shutdown /s /t 0');
        }, minutes * 60 * 1000);
        return { success: true, message: `系统将在 ${minutes} 分钟后关机` };
    } else {
        shutdownTimer = null;
        require('child_process').exec('shutdown /a');
        return { success: true, message: '已取消定时关机' };
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
