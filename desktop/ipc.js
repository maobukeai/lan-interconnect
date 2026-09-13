/**
 * 猫步互联 · 桌面端 IPC 桥 (LanDiskIPC)
 * 封装 Electron 主进程能力（启停服务/窗口/系统信息/自启等），
 * 提供纯浏览器环境下的降级实现，并集中管理服务生命周期与运行配置。
 */

(function (global) {
    'use strict';

    // 支持 Electron 与 Tauri 双环境桥接
    const isTauriEnv = typeof window !== 'undefined' && (!!window.isTauri || !!window.__TAURI__ || !!window.__TAURI_INTERNALS__);
    const hasExistingDesktopApi = typeof window !== 'undefined' && !!window.api && typeof window.api.startServer === 'function';

    if (isTauriEnv && !hasExistingDesktopApi) {
        const invoke = (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
            || (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);

        const channelToCommand = {
            'start-server': 'start_server',
            'stop-server': 'stop_server',
            'get-server-status': 'get_server_status',
            'select-folder': 'select_folder',
            'open-path': 'open_path',
            'open-root': 'open_root',
            'open-url': 'open_url',
            'open-firewall': 'open_firewall',
            'get-sys-info': 'get_sys_info',
            'get-network-info': 'get_network_info',
            'get-home-dir': 'get_home_dir',
            'schedule-shutdown': 'schedule_shutdown',
            'get-autostart': 'get_autostart',
            'set-autostart': 'set_autostart',
            'minimize-window': 'minimize_window',
            'maximize-window': 'maximize_window',
            'start-dragging': 'start_dragging',
            'close-window': 'close_window',
            'hide-window': 'hide_window',
            'quit-app': 'quit_app',
            'open-dev-tools': 'open_dev_tools'
        };

        const windowStateListeners = [];
        const emitWindowState = (st) => {
            windowStateListeners.forEach(cb => { try { cb(st); } catch (e) {} });
        };

        window.addEventListener('resize', () => {
            if (typeof window.isMaximized !== 'undefined') {
                const isMax = window.innerWidth >= screen.availWidth - 20 && window.innerHeight >= screen.availHeight - 60;
                if (isMax !== window.isMaximized) {
                    window.isMaximized = isMax;
                    emitWindowState({ maximized: isMax });
                }
            }
        });

        const genericInvoke = async (channel, data) => {
            const cmd = channelToCommand[channel] || channel;
            try {
                if (channel === 'start-server') return await invoke('start_server', { cfg: data });
                if (channel === 'open-path') return await invoke('open_path', { path: data });
                if (channel === 'open-url') return await invoke('open_url', { url: data });
                if (channel === 'set-autostart') return await invoke('set_autostart', { enable: !!data });
                if (channel === 'schedule-shutdown') return await invoke('schedule_shutdown', { minutes: data });
                return await invoke(cmd, data ? { data } : undefined);
            } catch (e) {
                return { success: false, error: String(e) };
            }
        };

        function desktopApi(endpoint) {
            return (window.LanDiskAuth && typeof window.LanDiskAuth.api === 'function')
                ? window.LanDiskAuth.api(endpoint)
                : (typeof endpoint === 'string' ? endpoint : '');
        }

        Object.assign(desktopApi, {
            startServer: async (cfg) => {
                try {
                    return await invoke('start_server', { cfg });
                } catch (e) {
                    return { success: false, error: String(e) };
                }
            },
            stopServer: async () => {
                try {
                    return await invoke('stop_server');
                } catch (e) {
                    return { success: false, error: String(e) };
                }
            },
            getServerStatus: async () => {
                try {
                    return await invoke('get_server_status');
                } catch (e) {
                    return { running: false };
                }
            },
            selectFolder: async () => {
                try {
                    return await invoke('select_folder');
                } catch (e) {
                    return null;
                }
            },
            openPath: async (p) => {
                try {
                    return await invoke('open_path', { path: p });
                } catch (e) {
                    return { success: false, error: String(e) };
                }
            },
            openRoot: async () => {
                try {
                    return await invoke('open_root');
                } catch (e) {
                    return { success: false, error: String(e) };
                }
            },
            openUrl: async (url) => {
                try {
                    return await invoke('open_url', { url });
                } catch (e) {
                    window.open(url, '_blank');
                    return { success: true };
                }
            },
            openFirewall: async () => {
                try {
                    return await invoke('open_firewall');
                } catch (e) {
                    return { success: false, error: String(e) };
                }
            },
            getSysInfo: async () => {
                try {
                    return await invoke('get_sys_info');
                } catch (e) {
                    return null;
                }
            },
            getNetworkInfo: async () => {
                try {
                    return await invoke('get_network_info');
                } catch (e) {
                    return [];
                }
            },
            getHomeDir: async () => {
                try {
                    return await invoke('get_home_dir');
                } catch (e) {
                    return 'C:\\';
                }
            },
            getAutostart: async () => {
                try {
                    return await invoke('get_autostart');
                } catch (e) {
                    return false;
                }
            },
            setAutostart: async (enable) => {
                try {
                    return await invoke('set_autostart', { enable: !!enable });
                } catch (e) {
                    return { success: false, error: String(e) };
                }
            },
            toggleAutostart: async (enable) => {
                try {
                    return await invoke('set_autostart', { enable: !!enable });
                } catch (e) {
                    return { success: false, error: String(e) };
                }
            },
            scheduleShutdown: async (minutes) => {
                try {
                    return await invoke('schedule_shutdown', { minutes });
                } catch (e) {
                    return { success: false, message: String(e) };
                }
            },
            minimizeWindow: async () => {
                try {
                    return await invoke('minimize_window');
                } catch (e) {
                    return { success: false };
                }
            },
            maximizeWindow: async () => {
                try {
                    const isMax = await invoke('maximize_window');
                    window.isMaximized = isMax;
                    emitWindowState({ maximized: isMax });
                    return { success: true, maximized: isMax };
                } catch (e) {
                    return { success: false };
                }
            },
            startDragging: async () => {
                try {
                    return await invoke('start_dragging');
                } catch (e) {
                    return null;
                }
            },
            closeWindow: async () => {
                try {
                    return await invoke('close_window');
                } catch (e) {
                    return { success: false };
                }
            },
            hideWindow: async () => {
                try {
                    return await invoke('hide_window');
                } catch (e) {
                    return { success: false };
                }
            },
            quitApp: async () => {
                try {
                    return await invoke('quit_app');
                } catch (e) {
                    return { success: false };
                }
            },
            openDevTools: async () => {
                try {
                    return await invoke('open_dev_tools');
                } catch (e) {
                    return { success: false };
                }
            },
            invoke: genericInvoke,
            on: (channel, callback) => {
                if (channel === 'window-state-changed') {
                    windowStateListeners.push(callback);
                    return () => {
                        const idx = windowStateListeners.indexOf(callback);
                        if (idx >= 0) windowStateListeners.splice(idx, 1);
                    };
                }
                return () => {};
            }
        });
        window.api = desktopApi;
    }

    const hasApi = typeof window !== 'undefined' && !!window.api && typeof window.api.startServer === 'function';

    /* ---------- 运行日志（内存 + localStorage，上限 200 条） ---------- */
    let logs = [];
    try {
        const raw = localStorage.getItem('landisk_logs');
        if (raw) logs = JSON.parse(raw) || [];
    } catch (e) {}
    const logListeners = [];

    function addLog(msg, type) {
        const line = { t: Date.now(), type: type || 'info', msg: String(msg) };
        logs.push(line);
        if (logs.length > 200) logs = logs.slice(-200);
        try { localStorage.setItem('landisk_logs', JSON.stringify(logs.slice(-100))); } catch (e) {}
        logListeners.forEach(cb => { try { cb(line); } catch (e) {} });
    }

    function clearLogs() {
        logs = [];
        try { localStorage.removeItem('landisk_logs'); } catch (e) {}
        logListeners.forEach(cb => { try { cb(null); } catch (e) {} });
    }

    function getLogs() { return logs.slice().reverse(); }

    /* ---------- 服务配置持久化 ---------- */
    const DEFAULT_CFG = { mode: 'full', pin: '', port: 3000, customDir: '', bindIp: '', whitelistMode: false, whitelistIps: [] };

    function getConfig() {
        try {
            const raw = localStorage.getItem('landisk_cfg');
            if (raw) return Object.assign({}, DEFAULT_CFG, JSON.parse(raw));
        } catch (e) {}
        return Object.assign({}, DEFAULT_CFG);
    }

    function saveConfig(cfg) {
        try { localStorage.setItem('landisk_cfg', JSON.stringify(cfg)); } catch (e) {}
    }

    /* ---------- 服务状态 ---------- */
    const state = {
        running: false,
        url: '',
        token: '',
        qrDataUrl: ''
    };
    const serviceListeners = [];

    function notifyServiceChange() {
        window.isRunning = state.running;
        window.currentServerUrl = state.running ? `http://127.0.0.1:${state.port || 3000}` : '';
        serviceListeners.forEach(cb => { try { cb(state); } catch (e) {} });
    }

    async function startService(cfgOverride) {
        const cfg = Object.assign(getConfig(), cfgOverride || {});
        saveConfig(cfg);

        // 同步 PIN 到共享鉴权器，桌面端自身请求也携带凭据
        try {
            if (cfg.pin) localStorage.setItem('lan_disk_pin', cfg.pin);
        } catch (e) {}

        if (!hasApi || typeof window.api.startServer !== 'function') {
            LanDiskUI.toast('当前环境不支持启动本机服务（需要桌面客户端）', 'error');
            return false;
        }
        const res = await window.api.startServer(cfg);
        if (!res || !res.success) {
            addLog('服务启动失败: ' + ((res && res.error) || '未知错误'), 'error');
            LanDiskUI.toast('启动失败：' + ((res && res.error) || '未知错误'), 'error');
            return false;
        }

        const actualPort = res.port || cfg.port || 3000;
        state.running = true;
        state.url = res.url;
        state.token = res.token;
        state.qrDataUrl = res.qrDataUrl || '';
        state.port = actualPort;
        window.currentServerUrl = `http://127.0.0.1:${actualPort}`;
        try { localStorage.setItem('lan_disk_qr_token', res.token); } catch (e) {}

        const localApiUrl = `http://127.0.0.1:${actualPort}`;
        if (!state.qrDataUrl) {
            try {
                const probeRes = await fetch(`${localApiUrl}/api/control/status`);
                if (probeRes.ok) {
                    const d = await probeRes.json();
                    if (d.qrDataUrl) state.qrDataUrl = d.qrDataUrl;
                    if (d.qrUrl) state.qrUrl = d.qrUrl;
                }
            } catch (e) {}
        }
        
        if (res.fallbackFromPort && res.fallbackFromPort !== actualPort) {
            addLog(`端口 ${res.fallbackFromPort} 已被占用，已自动切换至空闲端口 ${actualPort} 成功启动`, 'warn');
            LanDiskUI.toast(`端口 ${res.fallbackFromPort} 被占用，已自动解决冲突切换至端口 ${actualPort} 启动`, 'warning');
        } else {
            addLog(`服务已启动 ${res.url}（端口 ${actualPort}）`, 'ok');
            LanDiskUI.toast(`服务已成功启动（端口 ${actualPort}）`, 'success');
        }
        notifyServiceChange();
        return true;
    }

    async function stopService() {
        if (hasApi) await window.api.stopServer();
        state.running = false;
        addLog('服务已停止', 'warn');
        notifyServiceChange();
    }

    // 托盘等其他入口切换服务后，由此同步渲染进程状态
    async function syncServiceState() {
        let running = false;
        let url = '';
        let qrDataUrl = '';
        let qrUrl = '';
        try {
            const port = (getConfig().port || 3000);
            const probeUrl = state.url || `http://127.0.0.1:${port}`;
            const headers = (global.LanDiskAuth && global.LanDiskAuth.authHeaders) ? global.LanDiskAuth.authHeaders() : {};
            const res = await fetch(probeUrl.replace(/\/$/, '') + '/api/control/status', { headers });
            if (res.ok) {
                const d = await res.json();
                running = !!d.running;
                url = d.url || probeUrl;
                qrDataUrl = d.qrDataUrl || '';
                qrUrl = d.qrUrl || url;
                // 服务由托盘启动时渲染进程拿不到 Token，这里从 qrUrl 补存，
                // 保证免密模式下桌面端（file:// 来源）的写请求也携带有效凭据
                const tokenMatch = qrUrl && qrUrl.match(/[?&]token=([0-9a-fA-F]+)/);
                if (tokenMatch && tokenMatch[1]) {
                    try { localStorage.setItem('lan_disk_qr_token', tokenMatch[1]); } catch (e) {}
                    state.token = tokenMatch[1];
                }
            }
        } catch (e) {}
        
        state.running = running;
        state.url = url;
        if (qrDataUrl) state.qrDataUrl = qrDataUrl;
        if (qrUrl) state.qrUrl = qrUrl;
        window.isRunning = running;
        window.currentServerUrl = running ? `http://127.0.0.1:${state.port || 3000}` : '';
        notifyServiceChange();
    }

    /* ---------- 对外接口 ---------- */
    global.LanDiskIPC = {
        available: hasApi,

        /* 窗口控制（仅 Electron） */
        minimize: () => {
            if (!hasApi) return;
            if (typeof window.api.minimizeWindow === 'function') return window.api.minimizeWindow();
            if (typeof window.api.invoke === 'function') return window.api.invoke('minimize-window');
        },
        maximize: () => {
            if (!hasApi) return;
            if (typeof window.api.maximizeWindow === 'function') return window.api.maximizeWindow();
            if (typeof window.api.invoke === 'function') return window.api.invoke('maximize-window');
        },
        close: () => {
            if (!hasApi) return;
            if (typeof window.api.closeWindow === 'function') return window.api.closeWindow();
            if (typeof window.api.invoke === 'function') return window.api.invoke('close-window');
        },
        quit: async () => {
            try {
                if (state.running) await stopService();
            } catch (e) {}
            try {
                if (hasApi && typeof window.api.quitApp === 'function') return await window.api.quitApp();
                if (hasApi && typeof window.api.invoke === 'function') return await window.api.invoke('quit-app');
                if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
                    return await window.__TAURI__.core.invoke('quit_app');
                }
                if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
                    return await window.__TAURI_INTERNALS__.invoke('quit_app');
                }
            } catch (e) {}
            try { window.close(); } catch (e) {}
        },
        openDevTools: async () => {
            if (hasApi && typeof window.api.openDevTools === 'function') return await window.api.openDevTools();
            if (hasApi && typeof window.api.invoke === 'function') return await window.api.invoke('open-dev-tools');
            return { success: false, error: 'browser_env' };
        },

        /* 系统能力（含浏览器降级） */
        openUrl: (url) => hasApi ? window.api.openUrl(url) : window.open(url, '_blank'),
        selectFolder: async () => {
            if (hasApi) return await window.api.selectFolder();
            return LanDiskUI.promptDialog({ title: '输入目录路径', placeholder: 'C:\\Users\\...\\Downloads' });
        },
        getNetworkInfo: async () => {
            if (hasApi && typeof window.api.getNetworkInfo === 'function') return await window.api.getNetworkInfo() || [];
            try {
                const res = await fetch('/api/network-info');
                return res.ok ? await res.json() : [];
            } catch (e) { return []; }
        },
        getSysInfo: async () => {
            if (hasApi && typeof window.api.getSysInfo === 'function') return await window.api.getSysInfo();
            return null;
        },
        openRoot: () => hasApi ? window.api.openRoot() : global.LanDiskUI.toast('仅桌面客户端支持', 'info'),
        openPath: async (p) => {
            if (hasApi && window.api.openPath) return await window.api.openPath(p);
            return { success: false, error: '仅桌面客户端支持' };
        },
        openFirewall: async () => {
            if (hasApi && window.api.openFirewall) return await window.api.openFirewall();
            if (hasApi && window.api.invoke) return await window.api.invoke('open-firewall');
            return { success: false, error: '仅桌面客户端支持打开防火墙' };
        },
        openHome: () => hasApi && window.api.invoke('open-root'), // 打开资源管理器兜底
        getAutostart: async () => {
            if (hasApi) { try { return await window.api.getAutostart(); } catch (e) { return false; } }
            return localStorage.getItem('landisk_autostart_flag') === 'on';
        },
        setAutostart: async (on) => {
            localStorage.setItem('landisk_autostart_flag', on ? 'on' : 'off');
            if (hasApi) return await window.api.setAutostart(on);
            return { success: true };
        },
        scheduleShutdown: async (minutes) => {
            if (hasApi) return await window.api.scheduleShutdown(minutes);
            return { success: false, message: '仅桌面客户端支持定时关机' };
        },
        onWindowState: (cb) => {
            if (hasApi && window.api.on) window.api.on('window-state-changed', cb);
        },

        /* 关于与自动更新服务 */
        getAppInfo: async () => {
            try {
                const res = await fetch((window.currentServerUrl || 'http://127.0.0.1:3000').replace(/\/$/, '') + '/api/system/version');
                if (res.ok) return await res.json();
            } catch (e) {}
            return {
                name: '猫步互联 Pro',
                version: '2.3.6',
                author: '猫步可爱 (maobukeai)',
                repoUrl: 'https://github.com/maobukeai/lan-interconnect',
                releasesUrl: 'https://github.com/maobukeai/lan-interconnect/releases'
            };
        },
        checkAppUpdate: async () => {
            // 优先请求本地服务的 check-update 接口
            try {
                const srvUrl = ((state.running ? state.url : '') || window.currentServerUrl || 'http://127.0.0.1:3000').replace(/\/$/, '');
                const res = await fetch(srvUrl + '/api/system/check-update');
                if (res.ok) {
                    const text = await res.text();
                    const trimmed = (text || '').trim();
                    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                        const data = JSON.parse(trimmed);
                        if (data && (data.latest || data.current_version)) return data;
                    }
                }
            } catch (e) {}

            // 前端免限流 CDN 直连探针 Fallback
            const cdnUrls = [
                'https://ghfast.top/https://raw.githubusercontent.com/maobukeai/lan-interconnect/main/version.json',
                'https://ghproxy.net/https://raw.githubusercontent.com/maobukeai/lan-interconnect/main/version.json',
                'https://cdn.jsdelivr.net/gh/maobukeai/lan-interconnect@main/version.json',
                'https://fastly.jsdelivr.net/gh/maobukeai/lan-interconnect@main/version.json'
            ];
            for (const url of cdnUrls) {
                try {
                    const r = await fetch(url, { cache: 'no-store' });
                    if (r.ok) {
                        const text = await r.text();
                        const trimmed = (text || '').trim();
                        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                            const json = JSON.parse(trimmed);
                            const ver = String(json.version || '').replace(/^[vV]/, '').trim();
                            if (ver) {
                                return {
                                    latest: json,
                                    has_update: false,
                                    current_version: ver,
                                    error: null
                                };
                            }
                        }
                    }
                } catch (err) {}
            }

            return {
                latest: {
                    version: '2.3.6',
                    release_date: '2026-09-13',
                    download_url: 'https://github.com/maobukeai/lan-interconnect/releases',
                    release_notes: '当前运行的已是最新稳定版本 (v2.3.6)。'
                },
                has_update: false,
                current_version: '2.3.6',
                error: null
            };
        },
        downloadUpdate: async (url) => {
            try {
                const srvUrl = (window.currentServerUrl || 'http://127.0.0.1:3000').replace(/\/$/, '');
                const res = await fetch(srvUrl + '/api/system/download-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                return await res.json();
            } catch (e) {
                return { success: false, error: e.message };
            }
        },
        getUpdateProgress: async () => {
            try {
                const srvUrl = (window.currentServerUrl || 'http://127.0.0.1:3000').replace(/\/$/, '');
                const res = await fetch(srvUrl + '/api/system/update-progress');
                return await res.json();
            } catch (e) {
                return { active: false, stage: 'error', error: e.message };
            }
        },
        installUpdate: async (silent) => {
            try {
                const srvUrl = (window.currentServerUrl || 'http://127.0.0.1:3000').replace(/\/$/, '');
                const res = await fetch(srvUrl + '/api/system/install-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ silent: !!silent })
                });
                return await res.json();
            } catch (e) {
                return { success: false, error: e.message };
            }
        },
        openExternalUrl: (url) => {
            if (hasApi && window.api.openUrl) {
                return window.api.openUrl(url);
            }
            window.open(url, '_blank', 'noopener,noreferrer');
        },

        /* 服务生命周期 */
        state,
        getConfig,
        saveConfig,
        startService,
        stopService,
        syncServiceState,
        onServiceChange: (cb) => serviceListeners.push(cb),

        /* 日志 */
        addLog,
        clearLogs,
        getLogs,
        onLog: (cb) => logListeners.push(cb)
    };
})(typeof window !== 'undefined' ? window : this);
