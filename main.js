const { app, BrowserWindow, ipcMain, Menu, Tray, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');
const { startServer, stopServer } = require('./server.js');

let mainWindow = null;
let tray = null;
let serverRunning = false;
let currentServerInfo = null;

// 窗口位置/尺寸记忆（~/.landisk/window.json）
const WINDOW_STATE_FILE = path.join(os.homedir(), '.landisk', 'window.json');

function loadWindowState() {
    try {
        return JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf8'));
    } catch (e) { return null; }
}

function saveWindowState() {
    if (!mainWindow) return;
    try {
        const bounds = mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : mainWindow.getBounds();
        fs.mkdirSync(path.dirname(WINDOW_STATE_FILE), { recursive: true });
        fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(bounds));
    } catch (e) {}
}

// 校验坐标仍落在某个已连接显示器内（拔掉外接屏后不再把窗口恢复到屏幕外）
function isBoundsOnScreen(bounds) {
    try {
        const { screen } = require('electron');
        const visible = screen.getDisplayMatching(bounds).workArea;
        return bounds.x < visible.x + visible.width - 100 &&
            bounds.y < visible.y + visible.height - 100 &&
            bounds.x + bounds.width > visible.x + 100 &&
            bounds.y + bounds.height > visible.y + 100;
    } catch (e) {
        return true;
    }
}

// 日志统一放 ~/.landisk（asar 包内目录不可写，写项目根会静默失败），超 1MB 自动清空防膨胀
const logFile = path.join(os.homedir(), '.landisk', 'startup_debug.log');
function debugLog(msg) {
    const text = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        try {
            if (fs.statSync(logFile).size > 1024 * 1024) {
                fs.truncateSync(logFile, 0);
            }
        } catch (e) {}
        fs.appendFileSync(logFile, text);
    } catch(e) {}
    console.log(msg);
}

debugLog('App script starting...');

process.on('uncaughtException', (err) => {
    debugLog(`Uncaught Exception: ${err.stack || err}`);
});

process.on('unhandledRejection', (reason) => {
    debugLog(`Unhandled Rejection: ${reason}`);
});

const gotTheLock = app.requestSingleInstanceLock();
debugLog(`gotTheLock: ${gotTheLock}`);

if (!gotTheLock) {
    debugLog('Failed to get single instance lock, quitting.');
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        debugLog('second-instance triggered');
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        debugLog('app.whenReady triggered');
        createWindow();
        createTray();
    }).catch(err => {
        debugLog(`app.whenReady error: ${err.stack || err}`);
    });
}

function createWindow() {
    debugLog('createWindow called');
    const saved = loadWindowState();
    debugLog(`savedWindowState: ${JSON.stringify(saved)}`);
    const winOpts = {
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
    };
    if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height) &&
        saved.width >= 800 && saved.height >= 600) {
        winOpts.width = Math.min(saved.width, 3840);
        winOpts.height = Math.min(saved.height, 2160);
        if (Number.isFinite(saved.x) && Number.isFinite(saved.y) && isBoundsOnScreen(saved)) {
            winOpts.x = saved.x;
            winOpts.y = saved.y;
        } else {
            winOpts.center = true;
        }
    } else {
        winOpts.center = true;
    }
    mainWindow = new BrowserWindow(winOpts);
    debugLog('BrowserWindow instance created');

    mainWindow.loadFile('gui.html');
    mainWindow.once('ready-to-show', () => {
        debugLog('mainWindow ready-to-show fired');
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true);
        mainWindow.focus();
        mainWindow.setAlwaysOnTop(false);
    });

    // 记忆窗口位置与尺寸（去抖 800ms）
    let boundsTimer = null;
    const onBoundsChange = () => {
        clearTimeout(boundsTimer);
        boundsTimer = setTimeout(saveWindowState, 800);
    };
    mainWindow.on('resize', onBoundsChange);
    mainWindow.on('move', onBoundsChange);

    // 渲染进程 console 输出与报错记录到日志文件，便于排障
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        debugLog(`[renderer console][lvl:${level}] ${message} (${sourceId}:${line})`);
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        debugLog(`[renderer error] did-fail-load: ${errorCode} - ${errorDescription} (${validatedURL})`);
    });

    mainWindow.webContents.on('did-finish-load', () => {
        debugLog('mainWindow did-finish-load successfully');
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('window-state-changed', {
                minimized: mainWindow.isMinimized(),
                maximized: mainWindow.isMaximized()
            });
        }
    });

    // 支持 F12 与 Ctrl+Shift+I 快捷键直接切换 DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key && input.key.toLowerCase() === 'i'))) {
            if (mainWindow && mainWindow.webContents) {
                if (mainWindow.webContents.isDevToolsOpened()) {
                    mainWindow.webContents.closeDevTools();
                } else {
                    mainWindow.webContents.openDevTools({ mode: 'detach' });
                }
                event.preventDefault();
            }
        }
    });

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
        if (app.isQuitting) return;
        event.preventDefault();
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('request-window-close');
        }
    });
}

function updateTray() {
    if (!tray) return;
    const isRunning = serverRunning;
    const url = currentServerInfo ? `http://${currentServerInfo.ip}:${currentServerInfo.port}` : '';

    tray.setToolTip(`猫步互联 Pro\n状态：${isRunning ? '服务运行中' : '服务已停止'}${isRunning ? '\n' + url : '\n双击打开控制面板'}`);

    let isAutostart = false;
    try {
        isAutostart = app.getLoginItemSettings().openAtLogin;
    } catch (e) {}

    const template = [
        {
            label: isRunning ? `🟢 服务运行中 (${currentServerInfo ? currentServerInfo.port : 3000})` : '⚪ 服务未启动',
            enabled: isRunning,
            click: () => {
                if (url) shell.openExternal(url);
            }
        },
        { type: 'separator' },
        {
            label: '🪟 打开控制面板',
            click: () => {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    if (!mainWindow.isVisible()) mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: isRunning ? '⏹ 停止共享服务' : '▶ 启动共享服务',
            click: async () => {
                try {
                    if (serverRunning) {
                        await stopServer();
                        serverRunning = false;
                        currentServerInfo = null;
                    } else {
                        const info = await startServer({});
                        serverRunning = true;
                        currentServerInfo = info;
                        console.log(`[Tray] 服务已启动 http://${info.ip}:${info.port}`);
                    }
                    updateTray();
                    if (mainWindow && mainWindow.webContents) {
                        mainWindow.webContents.send('window-state-changed', { minimized: false, serviceChanged: true });
                    }
                } catch (e) {
                    console.error('[Tray] 服务切换失败:', e.message);
                }
            }
        },
        { type: 'separator' },
        {
            label: '📋 复制访问地址',
            enabled: isRunning,
            click: () => {
                if (url) {
                    const { clipboard } = require('electron');
                    clipboard.writeText(url);
                }
            }
        },
        {
            label: '📁 打开共享文件夹',
            click: async () => {
                const defaultSharedDir = path.join(os.homedir(), 'Downloads', 'LanDiskShared');
                if (!fs.existsSync(defaultSharedDir)) {
                    try { fs.mkdirSync(defaultSharedDir, { recursive: true }); } catch (e) {}
                }
                shell.openPath(defaultSharedDir);
            }
        },
        {
            label: '🌐 在浏览器中打开',
            enabled: isRunning,
            click: () => {
                if (url) shell.openExternal(url);
            }
        },
        { type: 'separator' },
        {
            label: '⚙️ 更多设置与工具',
            submenu: [
                {
                    label: '开机自动启动',
                    type: 'checkbox',
                    checked: isAutostart,
                    click: (menuItem) => {
                        app.setLoginItemSettings({
                            openAtLogin: menuItem.checked,
                            openAsHidden: true
                        });
                        updateTray();
                    }
                },
                {
                    label: '🛡️ 打开 Windows 防火墙设置',
                    click: () => {
                        const { exec } = require('child_process');
                        exec('control firewall.cpl');
                    }
                },
                {
                    label: '⏱️ 定时关机',
                    click: () => {
                        if (mainWindow) {
                            if (mainWindow.isMinimized()) mainWindow.restore();
                            if (!mainWindow.isVisible()) mainWindow.show();
                            mainWindow.focus();
                            mainWindow.webContents.send('trigger-shutdown-dialog');
                        }
                    }
                },
                {
                    label: '🛠️ 开发者调试工具 (DevTools)',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.show();
                            mainWindow.webContents.toggleDevTools();
                        }
                    }
                }
            ]
        },
        { type: 'separator' },
        {
            label: '❌ 退出猫步互联',
            click: async () => {
                app.isQuitting = true;
                try {
                    await stopServer();
                } catch (e) {}
                app.quit();
            }
        }
    ];

    const contextMenu = Menu.buildFromTemplate(template);
    tray.setContextMenu(contextMenu);
    return contextMenu;
}

function updateJumpList() {
    if (process.platform !== 'win32') return;
    try {
        app.setUserTasks([
            {
                program: process.execPath,
                arguments: '--action=open',
                iconPath: process.execPath,
                iconIndex: 0,
                title: '打开猫步互联',
                description: '激活并显示主界面'
            },
            {
                program: process.execPath,
                arguments: '--action=shared',
                iconPath: process.execPath,
                iconIndex: 0,
                title: '打开共享文件夹',
                description: '在文件资源管理器中打开共享目录'
            }
        ]);
    } catch (e) {}
}

function createTray() {
    const icoPath = path.join(__dirname, 'icon.ico');
    const pngPath = path.join(__dirname, 'icon.png');
    const iconFile = fs.existsSync(icoPath) ? icoPath : pngPath;
    const trayIcon = nativeImage.createFromPath(iconFile);

    tray = new Tray(trayIcon);
    updateTray();
    updateJumpList();

    // 单击：打开或激活主界面
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
        }
    });

    // 双击：打开或激活主界面
    tray.on('double-click', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
        }
    });
}

// IPC 通信：生成二维码
ipcMain.handle('generate-qr', async (event, text) => {
    try {
        return await QRCode.toDataURL(text || 'http://localhost:3000', { width: 250, margin: 2 });
    } catch (e) {
        return '';
    }
});

// IPC 通信：启动服务
ipcMain.handle('start-server', async (event, config) => {
    try {
        const info = await startServer(config);
        serverRunning = true;
        currentServerInfo = info;
        updateTray();
        const url = `http://${info.ip}:${info.port}`;
        const qrUrl = `${url}?token=${info.token}`;

        // 生成包含 Token 免密授权的二维码
        const qrDataUrl = await QRCode.toDataURL(qrUrl, {
            width: 250,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        });

        return {
            success: true,
            url,
            qrUrl,
            token: info.token,
            qrDataUrl,
            port: info.port,
            fallbackFromPort: info.fallbackFromPort
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC 通信：停止服务
ipcMain.handle('stop-server', async () => {
    await stopServer();
    serverRunning = false;
    updateTray();
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

ipcMain.handle('hide-window', () => {
    if (mainWindow) mainWindow.hide();
});

ipcMain.handle('quit-app', async () => {
    app.isQuitting = true;
    try {
        await stopServer();
    } catch (e) {}
    app.quit();
});

ipcMain.handle('open-dev-tools', () => {
    if (mainWindow && mainWindow.webContents) {
        if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools();
            return { success: true, opened: false };
        } else {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
            return { success: true, opened: true };
        }
    }
    return { success: false, error: '主窗口未就绪' };
});

ipcMain.handle('open-url', async (event, targetUrl) => {
    // 只允许 http/https 链接，防止渲染进程被注入后唤起任意协议处理器
    let finalUrl = String(targetUrl || '').trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
        return { success: false, error: '仅支持打开 http/https 链接' };
    }
    try { new URL(finalUrl); } catch (e) {
        return { success: false, error: 'URL 格式不合法' };
    }

    // 优先使用 Electron 原生 shell.openExternal，失败时才回退到系统指令，
    // 两种方式都执行会把浏览器打开两次
    let opened = false;
    try {
        await shell.openExternal(finalUrl);
        opened = true;
    } catch (e) {
        console.warn('shell.openExternal failed, using OS fallback:', e.message);
    }

    if (!opened) {
        const { exec } = require('child_process');
        try {
            if (process.platform === 'win32') {
                exec(`start "" "${finalUrl}"`);
            } else if (process.platform === 'darwin') {
                exec(`open "${finalUrl}"`);
            } else {
                exec(`xdg-open "${finalUrl}"`);
            }
        } catch (err) {}
    }

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

// 打开已存在的本地目录（资源管理器）。仅接受目录，防渲染层传文件/URL。
ipcMain.handle('open-path', async (event, targetPath) => {
    try {
        const p = String(targetPath || '');
        if (!p || /[\\/]?\.\.[\\/]/.test(p) || !path.isAbsolute(p)) {
            return { success: false, error: '路径不合法' };
        }
        const st = fs.statSync(p);
        if (!st.isDirectory()) return { success: false, error: '仅支持打开目录' };
        await shell.openPath(p);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('open-firewall', async () => {
    try {
        const { exec } = require('child_process');
        if (process.platform === 'win32') {
            // Windows: 优先通过 control firewall.cpl 打开经典的 Windows 防火墙面板，最兼容最稳定
            exec('control firewall.cpl', (err) => {
                if (err) {
                    exec('start firewall.cpl', (err2) => {
                        if (err2) {
                            shell.openExternal('windowsdefender:').catch(() => {
                                shell.openExternal('ms-settings:windowsdefender').catch(() => {});
                            });
                        }
                    });
                }
            });
            return { success: true };
        } else if (process.platform === 'darwin') {
            exec('open "x-apple.systempreferences:com.apple.preference.security?Firewall" || open /System/Library/PreferencePanes/Security.prefPane');
            return { success: true };
        } else {
            exec('gufw || firewall-config || system-config-firewall');
            return { success: true };
        }
    } catch (e) {
        console.error('open-firewall error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-autostart', () => {
    try {
        const settings = app.getLoginItemSettings();
        return settings.openAtLogin;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('set-autostart', (event, enable) => {
    try {
        app.setLoginItemSettings({
            openAtLogin: !!enable,
            openAsHidden: false
        });
        const current = app.getLoginItemSettings();
        return { success: true, openAtLogin: current.openAtLogin };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-home-dir', () => {
    return os.homedir();
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

// 上一次 CPU 采样，用于计算两次轮询之间的实时占用率（而非开机以来的平均值）
let lastCpuSample = null;

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

    let cpuUsage = 0;
    if (lastCpuSample) {
        const idleDiff = totalIdle - lastCpuSample.idle;
        const tickDiff = totalTick - lastCpuSample.tick;
        if (tickDiff > 0) {
            cpuUsage = Math.min(100, Math.max(0, Math.round(100 * (1 - idleDiff / tickDiff))));
        }
    }
    lastCpuSample = { idle: totalIdle, tick: totalTick };

    // C 盘剩余空间（statfsSync 在 Node 18.15+ 可用；失败时返回空串由渲染层兜底）
    let diskSpace = '';
    try {
        if (fs.statfsSync) {
            const st = fs.statfsSync(process.platform === 'win32' ? 'C:\\' : '/');
            const free = (st.bsize * st.bfree / 1024 / 1024 / 1024).toFixed(1);
            const total = (st.bsize * st.blocks / 1024 / 1024 / 1024).toFixed(1);
            diskSpace = `${free} GB 可用 / 共 ${total} GB`;
        }
    } catch (e) {}

    return {
        cpu: cpus[0] ? cpus[0].model : 'CPU',
        cpuUsage,
        memTotal: parseFloat(totalMem),
        memFree: parseFloat(freeMem),
        platform: os.platform(),
        arch: os.arch(),
        diskSpace
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


app.on('before-quit', async (event) => {
    if (!app.isQuitting) {
        app.isQuitting = true;
        try {
            await stopServer();
        } catch (e) {}
    }
});
