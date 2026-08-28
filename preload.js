const { contextBridge, ipcRenderer } = require('electron');

// 允许渲染进程订阅的主进程事件白名单
const SUBSCRIBABLE_CHANNELS = ['window-state-changed', 'request-window-close'];

// 允许渲染进程调用的 IPC 通道白名单：只暴露显式封装，不再提供万能 invoke
const INVOKABLE_CHANNELS = new Set([
    'start-server',
    'stop-server',
    'minimize-window',
    'maximize-window',
    'close-window',
    'hide-window',
    'quit-app',
    'open-dev-tools',
    'open-url',
    'select-folder',
    'open-root',
    'open-path',
    'open-firewall',
    'get-autostart',
    'set-autostart',
    'get-home-dir',
    'get-network-info',
    'get-sys-info',
    'schedule-shutdown',
    'generate-qr'
]);

contextBridge.exposeInMainWorld('api', {
    startServer: (config) => ipcRenderer.invoke('start-server', config),
    stopServer: () => ipcRenderer.invoke('stop-server'),
    openRoot: () => ipcRenderer.invoke('open-root'),
    openPath: (p) => ipcRenderer.invoke('open-path', p),
    openUrl: (url) => ipcRenderer.invoke('open-url', url),
    openFirewall: () => ipcRenderer.invoke('open-firewall'),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    getSysInfo: () => ipcRenderer.invoke('get-sys-info'),
    getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
    getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
    setAutostart: (enable) => ipcRenderer.invoke('set-autostart', enable),
    toggleAutostart: (enable) => ipcRenderer.invoke('set-autostart', enable),
    getAutostart: () => ipcRenderer.invoke('get-autostart'),
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    hideWindow: () => ipcRenderer.invoke('hide-window'),
    quitApp: () => ipcRenderer.invoke('quit-app'),
    openDevTools: () => ipcRenderer.invoke('open-dev-tools'),
    scheduleShutdown: (minutes) => ipcRenderer.invoke('schedule-shutdown', minutes),
    generateQrCode: (text) => ipcRenderer.invoke('generate-qr', text),
    invoke: (channel, data) => {
        if (!INVOKABLE_CHANNELS.has(channel)) {
            return Promise.resolve({ success: false, error: `IPC 通道未授权: ${channel}` });
        }
        return ipcRenderer.invoke(channel, data);
    },
    on: (channel, callback) => {
        if (!SUBSCRIBABLE_CHANNELS.includes(channel) || typeof callback !== 'function') {
            return () => {};
        }
        const listener = (event, data) => callback(data);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
    }
});
