const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
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
        title: '猫步互联 - 高级控制中心',
        icon: path.join(__dirname, 'icon.png'),
        frame: false // 自定义 macOS / Windows 标题栏
    });
    mainWindow.loadFile('gui.html');

    // 拦截关闭事件实现最小化到托盘
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
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
            { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
        ]);
        tray.setToolTip('猫步互联 Pro');
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
    app.isQuitting = true;
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
        // 尝试获取 C 盘剩余空间（优先 PowerShell Get-CimInstance，回退 wmic / fs.statfsSync）
        if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            let output = '';
            try {
                output = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object Caption, Size, FreeSpace"').toString();
            } catch (psErr) {
                try {
                    output = execSync('wmic logicaldisk get size,freespace,caption').toString();
                } catch (wmicErr) {
                    output = '';
                }
            }

            if (output) {
                const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 1) {
                    // 找 C 盘
                    const cLine = lines.find(l => l.includes('C:'));
                    if (cLine) {
                        const parts = cLine.split(/\s+/);
                        if (parts.length >= 3) {
                            const headerLine = lines[0].toLowerCase();
                            const num1 = parseInt(parts[1], 10);
                            const num2 = parseInt(parts[2], 10);
                            if (!isNaN(num1) && !isNaN(num2)) {
                                let freeBytes = 0;
                                let totalBytes = 0;
                                if (headerLine.includes('freespace') && headerLine.indexOf('freespace') < headerLine.indexOf('size')) {
                                    // wmic: Caption, FreeSpace, Size
                                    freeBytes = num1;
                                    totalBytes = num2;
                                } else {
                                    // powershell: Caption, Size, FreeSpace
                                    totalBytes = num1;
                                    freeBytes = num2;
                                }
                                const free = (freeBytes / 1024 / 1024 / 1024).toFixed(1);
                                const total = (totalBytes / 1024 / 1024 / 1024).toFixed(1);
                                diskSpace = `${free} GB 可用 / 共 ${total} GB`;
                            }
                        }
                    }
                }
            }

            if (diskSpace === '未知' && fs.statfsSync) {
                try {
                    const stats = fs.statfsSync('C:\\');
                    const free = ((stats.bsize * stats.bfree) / 1024 / 1024 / 1024).toFixed(1);
                    const total = ((stats.bsize * stats.blocks) / 1024 / 1024 / 1024).toFixed(1);
                    diskSpace = `${free} GB 可用 / 共 ${total} GB`;
                } catch (fsErr) {}
            }
        } else {
            if (fs.statfsSync) {
                try {
                    const stats = fs.statfsSync('/');
                    const free = ((stats.bsize * stats.bfree) / 1024 / 1024 / 1024).toFixed(1);
                    const total = ((stats.bsize * stats.blocks) / 1024 / 1024 / 1024).toFixed(1);
                    diskSpace = `${free} GB 可用 / 共 ${total} GB`;
                } catch (fsErr) {}
            }
        }
    } catch (e) {
        console.log('获取磁盘信息失败', e.message);
    }

    return {
        cpu: (os.cpus() && os.cpus()[0]) ? os.cpus()[0].model : 'Central Processor',
        cpuUsage: getCpuUsage(),
        memTotal: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
        memFree: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
        uptime: os.uptime(),
        platform: os.platform(),
        diskSpace: diskSpace
    };
});

let lastCpuTimes = null;
function getCpuUsage() {
    try {
        const cpus = os.cpus();
        if (!cpus || !cpus.length) return 0;
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                total += cpu.times[type];
            }
            idle += cpu.times.idle;
        }
        if (!lastCpuTimes) {
            lastCpuTimes = { idle, total };
            return 0;
        }
        const idleDiff = idle - lastCpuTimes.idle;
        const totalDiff = total - lastCpuTimes.total;
        lastCpuTimes = { idle, total };
        const usage = totalDiff > 0 ? Math.round(100 * (1 - idleDiff / totalDiff)) : 0;
        return Math.min(100, Math.max(0, usage));
    } catch(e) {
        return 0;
    }
}

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
    const { exec } = require('child_process');
    return new Promise((resolve) => {
        if (minutes > 0) {
            exec(`shutdown -s -t ${minutes * 60}`, (error) => {
                if (error) {
                    resolve({ success: false, error: error.message });
                } else {
                    resolve({ success: true, message: `已设置在 ${minutes} 分钟后关机` });
                }
            });
        } else {
            exec('shutdown -a', (error) => {
                if (error) {
                    resolve({ success: false, error: error.message });
                } else {
                    resolve({ success: true, message: '已取消定时关机' });
                }
            });
        }
    });
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
    if (mainWindow) mainWindow.close(); // 隐藏到托盘
});

ipcMain.handle('quit-app', () => {
    app.isQuitting = true;
    app.quit();
});
