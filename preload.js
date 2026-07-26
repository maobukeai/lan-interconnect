const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startServer: (config) => ipcRenderer.invoke('start-server', config),
    stopServer: () => ipcRenderer.invoke('stop-server'),
    openRoot: () => ipcRenderer.invoke('open-root'),
    openUrl: (url) => ipcRenderer.invoke('open-url', url),
    openFirewall: () => ipcRenderer.invoke('open-firewall'),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    getSysInfo: () => ipcRenderer.invoke('get-sys-info'),
    getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
    toggleAutostart: (enable) => ipcRenderer.invoke('toggle-autostart', enable),
    getAutostart: () => ipcRenderer.invoke('get-autostart'),
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    invoke: (channel, data) => ipcRenderer.invoke(channel, data)
});
