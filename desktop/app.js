/**
 * 猫步互联 Pro · 桌面端应用逻辑
 * 悬浮 Dock 导航 / Bento 主页 / 设置面板（安全·设备·回收站·分享·记录·应用·日志）/ 传输抽屉
 */

(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const I = (name, size) => window.Icons ? Icons.render(name, size) : '';
    const IPC = window.LanDiskIPC;
    const UI = window.LanDiskUI;
    const auth = () => window.LanDiskAuth;

        const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

    const fmtBytes = (b) => {
        if (!+b) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1);
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };
    const api = (p) => (window.currentServerUrl || 'http://127.0.0.1:3000').replace(/\/$/, '') + p;

    /* ---------- 图标注入 ---------- */
    function hydrateIcons() {
        $$('[data-icon]').forEach(el => {
            const name = el.getAttribute('data-icon');
            const size = parseInt(el.getAttribute('data-icon-size'), 10) || (el.closest('.apple-card-title-text') ? 17 : 15);
            el.innerHTML = I(name, size);
        });
        $('#win-close').innerHTML = I('close', 11);
        $('#win-min').innerHTML = I('winMin', 11);
        updateMaximizeIcon();
        $('#btn-go-up') && ($('#btn-go-up').innerHTML = I('chevronUp', 16));
        $('#btn-mkdir') && ($('#btn-mkdir').innerHTML = I('folderPlus', 16));
        $('#btn-explorer-refresh') && ($('#btn-explorer-refresh').innerHTML = I('refresh', 16));
        $('#btn-upload-icon') && ($('#btn-upload-icon').innerHTML = I('upload', 15));
        $('#btn-add-bookmark') && ($('#btn-add-bookmark').innerHTML = I('sparkles', 13) + ' 收藏路径');
    }

    /* ---------- 主题 ---------- */
    function initTheme() {
        UI.Theme.apply();
        updateThemeBtn();
        $('#btn-theme').addEventListener('click', () => { UI.Theme.toggle(); updateThemeBtn(); });
        // 设置页分段控件
        const t = UI.Theme.get();
        $$('#cfg-theme .segmented-item').forEach(b => b.classList.toggle('active', b.getAttribute('data-v') === t));
        $$('#cfg-theme .segmented-item').forEach(b => {
            b.addEventListener('click', () => {
                $$('#cfg-theme .segmented-item').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                UI.Theme.set(b.getAttribute('data-v'));
                updateThemeBtn();
            });
        });
    }
    function updateThemeBtn() { $('#btn-theme').innerHTML = I(UI.Theme.icon(), 16); }

    /* ---------- 窗口控制 ---------- */
    let winMaximized = false;
    function updateMaximizeIcon() {
        const btn = $('#win-max');
        if (btn) btn.innerHTML = I(winMaximized ? 'winRestore' : 'winMax', 11);
    }

    function bindWindowControls() {
        $('#win-close').addEventListener('click', () => handleWindowClose());
        $('#win-min').addEventListener('click', () => IPC.minimize());
        $('#win-max').addEventListener('click', () => IPC.maximize());
        $('#btn-devtools').addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                if (window.api && typeof window.api.openDevTools === 'function') {
                    const res = await window.api.openDevTools();
                    if (res && res.opened) {
                        UI.toast('已开启开发者调试工具 (DevTools)', 'success');
                    } else if (res && res.opened === false) {
                        UI.toast('已关闭开发者调试工具', 'info');
                    } else {
                        UI.toast('已切换开发者调试工具', 'info');
                    }
                } else if (IPC && typeof IPC.openDevTools === 'function') {
                    const res = await IPC.openDevTools();
                    if (res && res.opened) {
                        UI.toast('已开启开发者调试工具 (DevTools)', 'success');
                    } else if (res && res.opened === false) {
                        UI.toast('已关闭开发者调试工具', 'info');
                    } else {
                        UI.toast('已切换开发者调试工具', 'info');
                    }
                } else {
                    UI.toast('浏览器环境请按 F12 打开开发者工具', 'info');
                }
            } catch (err) {
                console.error('Failed to toggle DevTools:', err);
                UI.toast('切换开发者工具失败: ' + err.message, 'error');
            }
        });
        $('#btn-devtools').style.display = IPC.available ? '' : 'none';
        $('#btn-quit') && $('#btn-quit').addEventListener('click', () => doQuitApp());

        // 订阅主进程关闭请求 (如窗口关闭事件)
        if (window.api && window.api.on) {
            window.api.on('request-window-close', () => handleWindowClose());
        }
    }

    /* ---------- 服务状态 ---------- */
    let minPaused = false;
    IPC.onWindowState((s) => {
        minPaused = !!(s && s.minimized);
        if (s && typeof s.maximized === 'boolean' && s.maximized !== winMaximized) {
            winMaximized = s.maximized;
            updateMaximizeIcon();
        }
        // 托盘菜单等入口切换了服务：重新同步界面状态
        if (s && s.serviceChanged) IPC.syncServiceState();
    });

    function updateServiceUI() {
        const st = IPC.state;
        const light = $('#service-light');
        const badge = $('#service-badge');
        const btn = $('#btn-service-toggle');

        light.classList.toggle('off', !st.running);
        badge.className = 'apple-badge ' + (st.running ? 'apple-badge-success' : '');
        badge.innerHTML = `<span class="apple-badge-dot"></span>${st.running ? '在线' : '离线'}`;

        if (st.running) {
            $('#service-title').textContent = '服务运行中';
            $('#service-sub').textContent = `${st.url} · 手机扫码或浏览器访问`;
            btn.innerHTML = I('power', 15) + ' 停止服务';
            btn.classList.remove('apple-btn-primary');
            btn.classList.add('apple-btn-danger');
            $('#btn-show-qr').style.display = '';
        } else {
            $('#service-title').textContent = '服务未启动';
            $('#service-sub').textContent = '点击右侧按钮启动局域网共享服务';
            btn.innerHTML = I('power', 15) + ' 启动服务';
            btn.classList.add('apple-btn-primary');
            btn.classList.remove('apple-btn-danger');
            $('#btn-show-qr').style.display = 'none';
        }
    }

    let serviceBusy = false;
    async function toggleService() {
        if (serviceBusy) return;
        serviceBusy = true;
        const btn = $('#btn-service-toggle');
        
        try {
            if (IPC.state && IPC.state.running) {
                if (btn) btn.innerHTML = I('power', 15) + ' 正在停止…';
                if (UI && UI.toast) UI.toast('正在停止服务…', 'info');
                await IPC.stopService();
                if (UI && UI.toast) UI.toast('服务已停止', 'info');
            } else {
                if (btn) btn.innerHTML = I('power', 15) + ' 正在启动…';
                if (UI && UI.toast) UI.toast('正在启动局域网服务…', 'info');
                const ok = await IPC.startService();
                if (ok) {
                    try { bootChat(); } catch (e) {}
                    try { if (filesInited && typeof FileExplorerComponent !== 'undefined' && FileExplorerComponent.refresh) FileExplorerComponent.refresh(); } catch (e) {}
                    try { if (mediaInited && typeof MediaTheaterComponent !== 'undefined' && MediaTheaterComponent.scan) MediaTheaterComponent.scan(); } catch (e) {}
                }
            }
        } catch (err) {
            console.error('toggleService error:', err);
            if (UI && UI.toast) UI.toast('操作失败: ' + (err.message || err), 'error');
        } finally {
            serviceBusy = false;
            updateServiceUI();
        }
    }

            let isQrModalOpen = false;
    function showQrModal(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        
        // 单例防重入：如果当前已有弹窗打开，直接忽略重复点击
        if (isQrModalOpen || document.querySelector('.qr-modal-container')) return;
        isQrModalOpen = true;

        const st = (IPC && IPC.state) || {};
        let qrImg = st.qrDataUrl || '';
        let targetUrl = st.qrUrl || st.url || window.currentServerUrl || ('http://' + (window.location.hostname || '127.0.0.1') + ':' + (st.port || 3000));

        const ui = window.LanDiskUI || window.UI;
        if (!ui || !ui.openModal) {
            isQrModalOpen = false;
            console.error('LanDiskUI.openModal is not available');
            return;
        }

        const modal = ui.openModal(`
            <div class="qr-modal-container">
                <div class="modal-title" style="display:flex; align-items:center; gap:8px;">
                    <span style="color:var(--apple-system-blue)">${I('qr', 20)}</span>
                    <span>手机扫码连接</span>
                </div>
                <div class="modal-message">用手机相机 / 微信扫一扫，免密接入局域网</div>
                <div style="display:grid; place-items:center; margin:16px 0">
                    <div class="qr-box" id="qr-modal-box" style="background:#ffffff; padding:12px; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.12); width:224px; height:224px; display:flex; align-items:center; justify-content:center;">
                        ${qrImg ? `<img src="${qrImg}" alt="QR" style="width:200px; height:200px; display:block;">` : `<div style="font-size:13px; color:#8e8e93; display:flex; flex-direction:column; align-items:center; gap:8px;"><span class="apple-badge-dot" style="background:var(--apple-system-blue); animation:apple-pulse 1.2s infinite"></span>正在生成连接码…</div>`}
                    </div>
                </div>
                <div class="row-between" style="background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:12px; padding:10px 14px; margin-bottom:16px">
                    <span class="mono ellipsis" id="qr-modal-url" style="font-size:12.5px; flex:1; min-width:0; color:var(--apple-text-main)">${escapeHtml(targetUrl)}</span>
                    <button class="apple-btn apple-btn-glass apple-btn-sm" data-act="copy">${I('copy', 13)} 复制</button>
                </div>
                <div id="qr-remote-section" style="display:none; margin:-8px 0 16px"></div>
                <div class="modal-actions">
                    <button class="apple-btn apple-btn-glass" data-act="close">关闭</button>
                    <button class="apple-btn apple-btn-primary" data-act="open">${I('external', 15)} 在浏览器打开</button>
                </div>
            </div>
        `, {
            width: 420,
            onClose: () => {
                isQrModalOpen = false;
            }
        });

        const origClose = modal.close;
        modal.close = function() {
            isQrModalOpen = false;
            origClose.apply(this, arguments);
        };

        modal.el.querySelector('[data-act="close"]').addEventListener('click', () => modal.close());
        modal.el.querySelector('[data-act="open"]').addEventListener('click', () => {
            if (IPC && IPC.openUrl) IPC.openUrl(targetUrl);
            else window.open(targetUrl, '_blank');
        });
        modal.el.querySelector('[data-act="copy"]').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(targetUrl);
                if (ui.toast) ui.toast('地址已复制到剪贴板', 'success');
            } catch (e) {}
        });

        // 渲染 Tailscale 远程连接区：展示跨网络直连地址，支持复制与切换远程二维码
        const renderRemoteSection = (tsIps, port) => {
            const section = modal.el.querySelector('#qr-remote-section');
            if (!section) return;
            const remoteRows = tsIps.map(ip => `http://${ip}:${port}`);
            section.style.display = 'block';
            section.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px; margin:0 0 8px 2px; font-size:12px; font-weight:600; color:var(--apple-text-secondary)">
                    ${I('globe', 13)} Tailscale 远程连接（跨网络可用，地址永久固定）
                </div>
                ${remoteRows.map((rUrl, i) => `
                <div class="row-between" style="background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:12px; padding:8px 14px; margin-bottom:8px">
                    <span class="mono ellipsis" style="font-size:12.5px; flex:1; min-width:0; color:var(--apple-text-main)">${escapeHtml(rUrl)}</span>
                    <button class="apple-btn apple-btn-glass apple-btn-sm" data-remote-copy="${i}">${I('copy', 12)} 复制</button>
                    <button class="apple-btn apple-btn-glass apple-btn-sm" data-remote-qr="${i}">${I('qr', 12)} 二维码</button>
                </div>`).join('')}
            `;
            remoteRows.forEach((rUrl, i) => {
                const copyBtn = section.querySelector(`[data-remote-copy="${i}"]`);
                if (copyBtn) copyBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(rUrl);
                        if (ui.toast) ui.toast('远程地址已复制到剪贴板', 'success');
                    } catch (e) {}
                });
                const qrBtn = section.querySelector(`[data-remote-qr="${i}"]`);
                if (qrBtn) qrBtn.addEventListener('click', async () => {
                    if (!(window.api && window.api.generateQrCode)) {
                        if (ui.toast) ui.toast('当前环境不支持生成远程二维码，请复制地址使用', 'info');
                        return;
                    }
                    try {
                        const remoteQr = await window.api.generateQrCode(rUrl);
                        if (remoteQr && isQrModalOpen) {
                            const box = modal.el.querySelector('#qr-modal-box');
                            const urlEl = modal.el.querySelector('#qr-modal-url');
                            if (box) box.innerHTML = `<img src="${remoteQr}" alt="QR" style="width:200px; height:200px; display:block;">`;
                            if (urlEl) urlEl.textContent = rUrl;
                        }
                    } catch (e) {}
                });
            });
        };

        // 异步在后台拉取或本地生成高保真二维码并替换
        (async () => {
            try {
                // 始终拉取 status：既补齐二维码，也获取服务端识别的 Tailscale 远程地址
                const probeUrl = targetUrl.startsWith('http') ? targetUrl : `http://127.0.0.1:${st.port || 3000}`;
                const headers = (window.LanDiskAuth && window.LanDiskAuth.authHeaders) ? window.LanDiskAuth.authHeaders() : {};
                const res = await fetch(probeUrl.replace(/\/$/, '') + '/api/control/status', { headers }).then(r => r.json()).catch(() => ({}));
                if (res && res.qrDataUrl && !qrImg) {
                    qrImg = res.qrDataUrl;
                    st.qrDataUrl = qrImg;
                    if (res.url) targetUrl = res.qrUrl || res.url;
                }
                // 服务端识别到 Tailscale 网卡时，展示跨网络远程连接区
                if (res && res.addresses && Array.isArray(res.addresses.tailscale) && res.addresses.tailscale.length) {
                    renderRemoteSection(res.addresses.tailscale, res.port || st.port || 3000);
                }
            } catch (e) {}

            if (!qrImg && window.api && window.api.generateQrCode) {
                try {
                    qrImg = await window.api.generateQrCode(targetUrl);
                    if (qrImg) st.qrDataUrl = qrImg;
                } catch (e) {}
            }

            if (qrImg && isQrModalOpen) {
                const box = modal.el.querySelector('#qr-modal-box');
                if (box) box.innerHTML = `<img src="${qrImg}" alt="QR" style="width:200px; height:200px; display:block;">`;
                const urlEl = modal.el.querySelector('#qr-modal-url');
                if (urlEl) urlEl.textContent = targetUrl;
            }
        })();
    }
    window.LanDiskShowQrModal = showQrModal;

    /* ---------- 聊天未读角标 ---------- */
    let chatUnread = 0;
    window.onChatIncoming = () => {
        const chatView = $('#view-chat');
        if (chatView && chatView.classList.contains('active')) return;
        chatUnread++;
        updateChatBadge();
    };

    function updateChatBadge() {
        document.querySelectorAll('.dock-item[data-view="chat"]').forEach(item => {
            let badge = item.querySelector('.dock-badge');
            if (chatUnread > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'dock-badge';
                    item.appendChild(badge);
                }
                badge.textContent = chatUnread > 99 ? '99+' : String(chatUnread);
            } else if (badge) {
                badge.remove();
            }
        });
    }

    /* ---------- 视图切换 ---------- */
    let filesInited = false, mediaInited = false, toolsInited = false, chatBooted = false;
    let settingsPanelsVisited = {};

    function updateDockGlider(activeBtn, animate = true) {
        const dock = document.getElementById('main-dock') || document.querySelector('nav.dock');
        if (!dock) return;
        let glider = dock.querySelector('.dock-glider');
        if (!glider) {
            glider = document.createElement('div');
            glider.className = 'dock-glider';
            glider.id = 'dock-glider';
            dock.insertBefore(glider, dock.firstChild);
        }
        dock.classList.add('has-glider');

        const target = activeBtn || dock.querySelector('.dock-item.active');
        if (!target) {
            glider.style.opacity = '0';
            return;
        }

        const targetLeft = target.offsetLeft;
        const targetWidth = target.offsetWidth;

        if (!animate) {
            glider.style.transition = 'none';
        } else {
            glider.style.transition = 'transform 0.36s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
        }

        glider.style.transform = `translateX(${targetLeft}px)`;
        glider.style.width = `${targetWidth}px`;
        glider.style.opacity = '1';

        if (!animate) {
            void glider.offsetWidth;
            glider.style.transition = 'transform 0.36s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
        }
    }

    function switchView(view) {
        let activeBtn = null;
        $$('.dock-item').forEach(el => {
            const isMatch = el.getAttribute('data-view') === view;
            el.classList.toggle('active', isMatch);
            if (isMatch) activeBtn = el;
        });
        updateDockGlider(activeBtn, true);

        $$('.view-section').forEach(el => el.classList.remove('active'));
        const target = $('#view-' + view);
        if (target) target.classList.add('active');
        $('.app-viewport').scrollTop = 0;

        if (view === 'home') { pollHome(true); loadHomeHistory(); }
        if (view === 'chat') { chatUnread = 0; updateChatBadge(); bootChat(); }
        if (view === 'files' && IPC.state.running && !filesInited) {
            filesInited = true;
            FileExplorerComponent.init('file-list', 'current-path');
        }
        if (view === 'media' && !mediaInited) {
            mediaInited = true;
            MediaTheaterComponent.init({ grid: '#poster-grid', folderLabel: '#media-folder-label', chipRow: '#media-folders-chip-row' });
            if (IPC.state.running) MediaTheaterComponent.scan();
        }
        if (view === 'tools' && !toolsInited) {
            toolsInited = true;
            if (typeof RemoteControl !== 'undefined' && $('#desktop-remote-control-container')) {
                window.desktopRemoteControl = new RemoteControl({
                    container: '#desktop-remote-control-container',
                    getPin: () => IPC.getConfig().pin || ''
                });
            }
            ProcessMonitorComponent.load('process-list');
            WhiteboardComponent.init('whiteboard');
            const ps = $('#process-search');
            if (ps) ps.addEventListener('input', (e) => ProcessMonitorComponent.filter(e.target.value));
        }
        if (view === 'settings') {
            initSettingsVisit();
            refreshCurrentSettingsPanel();
        }
    }

    function bootChat() {
        if (chatBooted || !IPC.state.running) return;
        chatBooted = true;
        IMessageChatComponent.init('chat-messages');
    }

    $$('.dock-item').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
    });

    window.addEventListener('resize', () => updateDockGlider(null, false));
    setTimeout(() => updateDockGlider(null, false), 60);

    /* ---------- 主页仪表 ---------- */
    const sparkCpu = new UI.Sparkline($('#spark-cpu'), 'var(--apple-system-blue)');
    const sparkMem = new UI.Sparkline($('#spark-mem'), 'var(--apple-system-purple)');
    const sparkNet = new UI.Sparkline($('#spark-net'), 'var(--apple-system-green)');
    let homeVisible = true;

    async function pollHome(force) {
        if (!homeVisible && !force) return;
        if (minPaused) return;

        if (IPC.state.running) {
            try {
                const [sysRes, devRes] = await Promise.all([
                    fetch(api('/api/sys-info'), { headers: auth().authHeaders() }),
                    fetch(api('/api/devices'), { headers: auth().authHeaders() })
                ]);
                if (sysRes.ok) {
                    const d = await sysRes.json();
                    $('#dash-cpu').textContent = (d.cpuUsage || 0) + '%';
                    sparkCpu.push(d.cpuUsage || 0);
                    const cpuModel = (d.cpu || '').split('@')[0].trim();
                    if ($('#dash-cpu-name')) $('#dash-cpu-name').textContent = cpuModel || '多核高能效处理器';

                    const memPercent = Math.round(((d.memTotal - d.memFree) / d.memTotal) * 100) || 0;
                    $('#dash-mem').textContent = memPercent + '%';
                    sparkMem.push(memPercent);
                    if ($('#dash-mem-sub')) {
                        const usedMem = fmtBytes(d.memTotal - d.memFree);
                        const totalMem = fmtBytes(d.memTotal);
                        $('#dash-mem-sub').textContent = `已用 ${usedMem} / 共 ${totalMem}`;
                    }

                    if (d.diskSpace) {
                        if (d.diskSpace.includes('可用 / 共')) {
                            const parts = d.diskSpace.split('可用 / 共');
                            const freeStr = parts[0].trim();
                            const totalStr = (parts[1] || '').trim();
                            $('#dash-disk').textContent = freeStr + ' 可用';
                            if ($('#dash-disk-sub')) $('#dash-disk-sub').textContent = `总容量 ${totalStr}`;
                        } else {
                            $('#dash-disk').textContent = d.diskSpace;
                        }
                    }
                }
                if (devRes.ok) {
                    const d = await devRes.json();
                    const rawDevices = d.devices || [];
                    // 过滤出真正连入的外接设备 (排除本机 127.0.0.1 / localhost)
                    const externalDevices = rawDevices.filter(dev => dev.ip && dev.ip !== '127.0.0.1' && dev.ip !== 'localhost' && dev.ip !== '::1');
                    const count = externalDevices.length;

                    $('#dash-device-count').textContent = count;
                    $('#dash-device-sub').textContent = count > 0 ? `${count} 台外接终端在线协同` : '等待手机/平板扫码连接';
                    
                    const badge = $('#dash-device-badge');
                    const badgeText = $('#dash-device-status-text');
                    if (badge && badgeText) {
                        badge.className = 'apple-badge apple-badge-sm ' + (count > 0 ? 'apple-badge-success' : '');
                        badgeText.textContent = count > 0 ? '极速互联' : '广播就绪';
                    }
                    if ($('#dash-devices-summary')) {
                        $('#dash-devices-summary').textContent = count > 0 ? `已连 ${count} 台终端` : '免客户端直连';
                    }

                    const fmtSpeed = b => b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB/s' : (b / 1024).toFixed(1) + ' KB/s';
                    const tx = d.stats ? d.stats.txSpeed : 0;
                    const rx = d.stats ? d.stats.rxSpeed : 0;
                    $('#dash-tx-speed').textContent = fmtSpeed(tx);
                    $('#dash-rx-speed').textContent = fmtSpeed(rx);
                    sparkNet.push(tx + rx);
                    if ($('#dash-net-sub')) {
                        $('#dash-net-sub').textContent = (tx + rx > 0) ? `双向流量 ${(tx + rx > 1024 * 1024 ? ((tx + rx) / 1024 / 1024).toFixed(1) + ' MB/s' : ((tx + rx) / 1024).toFixed(1) + ' KB/s')}` : '局域网千兆就绪';
                    }
                    renderHomeDevices(externalDevices, IPC.state.info);
                }
            } catch (e) { /* 轮询静默 */ }
        } else if (IPC.available) {
            // 服务未启动：展示本机硬件状态
            try {
                const d = await IPC.getSysInfo();
                if (d) {
                    $('#dash-cpu').textContent = (d.cpuUsage || 0) + '%';
                    sparkCpu.push(d.cpuUsage || 0);
                    const cpuModel = (d.cpu || '').split('@')[0].trim();
                    if ($('#dash-cpu-name')) $('#dash-cpu-name').textContent = cpuModel || '多核高能效处理器';

                    const memPercent = d.memTotal ? Math.round(((d.memTotal - d.memFree) / d.memTotal) * 100) : 0;
                    $('#dash-mem').textContent = memPercent + '%';
                    sparkMem.push(memPercent);
                    if ($('#dash-mem-sub') && d.memTotal) {
                        $('#dash-mem-sub').textContent = `已用 ${fmtBytes(d.memTotal - (d.memFree || 0))} / 共 ${fmtBytes(d.memTotal)}`;
                    }

                    if (d.diskSpace) {
                        if (d.diskSpace.includes('可用 / 共')) {
                            const parts = d.diskSpace.split('可用 / 共');
                            $('#dash-disk').textContent = parts[0].trim() + ' 可用';
                            if ($('#dash-disk-sub')) $('#dash-disk-sub').textContent = `总容量 ${(parts[1] || '').trim()}`;
                        } else {
                            $('#dash-disk').textContent = d.diskSpace;
                        }
                    }
                }
            } catch (e) {}
            $('#dash-device-count').textContent = '0';
            $('#dash-device-sub').textContent = '服务离线（点击上方启动）';
            const badge = $('#dash-device-badge');
            const badgeText = $('#dash-device-status-text');
            if (badge && badgeText) {
                badge.className = 'apple-badge apple-badge-sm';
                badgeText.textContent = '待启动';
            }
            if ($('#dash-devices-summary')) $('#dash-devices-summary').textContent = '启动后显示';
            renderHomeDevices([], null);
        }
    }

    function renderHomeDevices(devices, serverInfo) {
        const el = $('#dash-devices-list');
        if (!el) return;
        
        const isRunning = IPC.state.running;
        const hostIp = (serverInfo && serverInfo.ip) ? serverInfo.ip : '127.0.0.1';
        const hostPort = (serverInfo && serverInfo.port) ? serverInfo.port : 3000;

        if (!devices || !devices.length) {
            // 无外接设备时：对称渲染【本机主机服务节点】 + 【扫码连接引导卡片】
            el.innerHTML = `
                <div class="device-node-card host-card">
                    <div style="color:var(--apple-system-blue);"><span data-icon="monitor"></span></div>
                    <div class="device-node-meta">
                        <div class="device-node-name ellipsis">本机 (主控节点)</div>
                        <div class="device-node-sub ellipsis">${isRunning ? `${hostIp}:${hostPort} · 服务待命中` : '服务未启动'}</div>
                    </div>
                    <span class="status-dot ${isRunning ? 'on' : ''}"></span>
                </div>
                <div class="device-node-card qr-card" id="dash-quick-qr-card" style="cursor:pointer;" title="点击查看连接二维码">
                    <div style="color:var(--apple-system-blue);"><span data-icon="qr"></span></div>
                    <div class="device-node-meta">
                        <div class="device-node-name ellipsis">扫码连接手机/平板</div>
                        <div class="device-node-sub ellipsis">${isRunning ? '点击查看局域网连接码' : '启动服务后扫码接入'}</div>
                    </div>
                    <span class="apple-badge apple-badge-sm apple-badge-primary" style="font-size:10px; padding:2px 7px;">扫码 &gt;</span>
                </div>
            `;
            if (window.Icons) {
                el.querySelectorAll('[data-icon]').forEach(iEl => {
                    iEl.innerHTML = Icons.render(iEl.getAttribute('data-icon'), 17);
                });
            }
            $('#dash-quick-qr-card')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isRunning) showQrModal(e);
            });
            return;
        }

        // 有外接设备连接时：渲染所有外部设备卡片 + 快速加设备卡片
        const cards = devices.slice(0, 4).map(dev => `
            <div class="device-node-card">
                <div style="color:var(--apple-system-blue);"><span data-icon="smartphone"></span></div>
                <div class="device-node-meta">
                    <div class="device-node-name ellipsis">${escapeHtml(dev.alias || dev.ip)}</div>
                    <div class="device-node-sub ellipsis">${escapeHtml((dev.userAgent || '').slice(0, 24) || dev.ip)} · 协同中</div>
                </div>
                <span class="status-dot on"></span>
            </div>
        `);

        if (devices.length < 2) {
            cards.push(`
                <div class="device-node-card qr-card" id="dash-quick-qr-card" style="cursor:pointer;" title="点击查看连接二维码">
                    <div style="color:var(--apple-system-blue);"><span data-icon="qr"></span></div>
                    <div class="device-node-meta">
                        <div class="device-node-name ellipsis">+ 连接更多设备</div>
                        <div class="device-node-sub ellipsis">手机扫码即连</div>
                    </div>
                    <span class="apple-badge apple-badge-sm apple-badge-primary" style="font-size:10px; padding:2px 7px;">扫码 &gt;</span>
                </div>
            `);
        }

        el.innerHTML = cards.join('');
        if (window.Icons) {
            el.querySelectorAll('[data-icon]').forEach(iEl => {
                iEl.innerHTML = Icons.render(iEl.getAttribute('data-icon'), 17);
            });
        }
        $('#dash-quick-qr-card')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isRunning) showQrModal(e);
        });
    }

    async function loadHomeHistory() {
        if (!IPC.state.running) return;
        try {
            const res = await fetch(api('/api/history?limit=6'), { headers: auth().authHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            const el = $('#home-history');
            if (!data.items || !data.items.length) {
                el.innerHTML = '<div class="empty-state">暂无传输记录</div>';
                return;
            }
            el.innerHTML = data.items.map(it => `
                <div class="history-item">
                    <div class="hicon ${it.kind === 'upload' ? 'up' : 'down'}">${I(it.kind === 'upload' ? 'upload' : 'download', 15)}</div>
                    <div style="flex:1; min-width:0">
                        <div class="ellipsis" style="font-weight:600">${escapeHtml(it.name)}</div>
                        <div class="subtle" style="font-size:11px">${fmtBytes(it.size)} · ${new Date(it.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}${it.ip && it.ip !== '127.0.0.1' ? ' · ' + escapeHtml(it.ip) : ''}</div>
                    </div>
                    <span class="apple-badge ${it.kind === 'upload' ? 'apple-badge-success' : 'apple-badge-info'}">${it.kind === 'upload' ? '收到' : '发出'}</span>
                </div>
            `).join('');
        } catch (e) {}
    }

    setInterval(() => {
        const home = $('#view-home');
        homeVisible = !!(home && home.classList.contains('active'));
        pollHome();
    }, 2500);

    /* ---------- 快捷操作 ---------- */
    function bindQuickActions() {
        $('#btn-service-toggle').addEventListener('click', toggleService);
        const qrBtn = $('#btn-show-qr');
        if (qrBtn) {
            qrBtn.onclick = (e) => { if (e && e.preventDefault) e.preventDefault(); showQrModal(e); };
            qrBtn.addEventListener('click', showQrModal);
        }
        $('#btn-home-history-refresh').addEventListener('click', loadHomeHistory);
        $('#tile-devices').addEventListener('click', () => switchView('settings'));

        $('#qa-open-shared').addEventListener('click', async () => {
            const cfg = IPC.getConfig();
            let dir = cfg.customDir;
            if (!dir) {
                const home = (window.api ? await window.api.getHomeDir() : '') || '';
                dir = home ? home.replace(/\\+$/, '') + '\\Downloads\\LanDiskShared' : 'C:\\';
            }
            const res = await IPC.openPath(dir);
            if (res && res.success === false) {
                // 目录不存在时先创建（首次使用共享目录场景）
                if (window.api && IPC.available) {
                    try {
                        const st = await fetch(api('/api/mkdir'), {
                            method: 'POST',
                            headers: auth().authHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({ path: dir.replace(/\\[^\\]+$/, ''), name: 'LanDiskShared' })
                        }).then(r => r.json()).catch(() => ({}));
                        if (st.success) { await IPC.openPath(dir); return; }
                    } catch (e) {}
                }
                UI.toast(res.error || '目录不存在', 'error');
            }
        });
        $('#qa-firewall').addEventListener('click', async () => {
            try {
                UI.toast('正在打开防火墙设置…', 'info');
                const res = await IPC.openFirewall();
                if (res && res.success === false) {
                    UI.toast(res.error || '无法打开系统防火墙', 'error');
                }
            } catch (e) {
                UI.toast('打开防火墙失败: ' + e.message, 'error');
            }
        });
        $('#qa-shutdown').addEventListener('click', async () => {
            const input = await UI.promptDialog({ title: '定时关机', message: '输入分钟数（0 = 取消已有关机任务）', value: '0', confirmText: '设置' });
            if (input === null) return;
            const m = parseInt(input, 10);
            if (isNaN(m) || m < 0) { UI.toast('请输入有效分钟数', 'error'); return; }
            const res = await IPC.scheduleShutdown(m);
            UI.toast((res && res.message) || '已设置', (res && res.success) ? 'success' : 'error');
            IPC.addLog(`定时关机设置：${m} 分钟`, 'warn');
        });
        $('#qa-copy-link').addEventListener('click', async () => {
            if (!IPC.state.running) { UI.toast('服务未启动', 'info'); return; }
            try { await navigator.clipboard.writeText(IPC.state.url); UI.toast('访问地址已复制', 'success'); } catch (e) {}
        });
    }

    /* ---------- 传输抽屉 ---------- */
    const transferTasks = new Map(); // name -> {percent, speed, state}

    function renderTransferDrawer() {
        const drawer = $('#transfer-drawer');
        const body = $('#transfer-body');
        const active = Array.from(transferTasks.entries()).filter(([, t]) => t.state !== 'done');
        $('#transfer-count').textContent = String(transferTasks.size);

        if (!transferTasks.size) {
            drawer.style.display = 'none';
            return;
        }
        drawer.style.display = '';

        body.innerHTML = Array.from(transferTasks.entries()).map(([name, t]) => {
            const label = t.state === 'merging' ? '合并中' :
                t.state === 'instant' ? '秒传完成' :
                t.state === 'error' ? '失败' :
                t.state === 'done' ? '完成' : (t.speed || '…');
            const color = t.state === 'error' ? 'var(--apple-system-red)' :
                (t.state === 'done' || t.state === 'instant') ? 'var(--apple-system-green)' : 'var(--apple-system-blue)';
            return `
                <div class="transfer-item">
                    <div class="row-between" style="font-size:12px; margin-bottom:5px">
                        <span class="ellipsis" style="font-weight:600; min-width:0">${escapeHtml(name)}</span>
                        <span style="color:${color}; flex-shrink:0; font-size:11px">${label}${t.state === 'uploading' ? ' · ' + t.percent + '%' : ''}</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill" style="width:${t.percent || 0}%; background:${color}; box-shadow:none"></div></div>
                </div>
            `;
        }).join('');

        if (!active.length) {
            setTimeout(() => {
                transferTasks.clear();
                renderTransferDrawer();
            }, 2200);
        }
    }

    window.onTransferStatus = (info) => {
        const cur = transferTasks.get(info.name) || {};
        transferTasks.set(info.name, Object.assign(cur, info));
        renderTransferDrawer();
    };

    $('#transfer-drawer-head').addEventListener('click', () => {
        $('#transfer-drawer').classList.toggle('collapsed');
    });

    /* ---------- 设置页 ---------- */
    function initSettingsVisit() {
        // 面板切换
        $$('#settings-nav [data-panel]').forEach(btn => {
            if (btn._bound) return;
            btn._bound = true;
            btn.addEventListener('click', () => {
                $$('#settings-nav [data-panel]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const p = btn.getAttribute('data-panel');
                $$('.settings-panel').forEach(x => x.classList.toggle('active', x.getAttribute('data-panel') === p));
                refreshCurrentSettingsPanel(p);
            });
        });
    }

    function refreshCurrentSettingsPanel(p) {
        if (!p) {
            const activeBtn = $('#settings-nav [data-panel].active');
            p = activeBtn ? activeBtn.getAttribute('data-panel') : 'security';
        }
        if (p === 'security') loadSecurityForm();
        else if (p === 'devices') refreshDevices();
        else if (p === 'trash') refreshTrash();
        else if (p === 'shares') refreshShares();
        else if (p === 'history') refreshSettingsHistory();
        else if (p === 'app') { /* 静态表单 */ }
        else if (p === 'logs') renderLogs();
    }

    function loadSecurityForm() {
        const cfg = IPC.getConfig();
        $('#cfg-pin').value = cfg.pin || '';
        $$('#cfg-mode .segmented-item').forEach(b => b.classList.toggle('active', b.getAttribute('data-v') === (cfg.mode || 'full')));
        $('#cfg-dir-label').textContent = cfg.customDir ? cfg.customDir : '默认：下载/LanDiskShared';
        $('#cfg-port').value = cfg.port || 3000;
        $('#cfg-whitelist').checked = !!cfg.whitelistMode;
        $('#cfg-whitelist-row').style.display = cfg.whitelistMode ? '' : 'none';
        $('#cfg-whitelist-ips').value = (cfg.whitelistIps || []).join(', ');

        // 网卡列表（防止重复追加）
        IPC.getNetworkInfo().then(list => {
            const sel = $('#cfg-bindip');
            if (!sel) return;
            sel.innerHTML = '<option value="">全部网卡 (0.0.0.0)</option>';
            const seen = new Set();
            (list || []).forEach(n => {
                if (!n || !n.address || seen.has(n.address)) return;
                seen.add(n.address);
                const opt = document.createElement('option');
                opt.value = n.address;
                opt.textContent = `${n.name} (${n.address})`;
                sel.appendChild(opt);
            });
            sel.value = cfg.bindIp || '';
        });
    }

    function readSecurityForm() {
        const cfg = IPC.getConfig();
        cfg.pin = $('#cfg-pin').value.trim();
        cfg.mode = ($('#cfg-mode .segmented-item.active') || {}).getAttribute?.('data-v') || 'full';
        cfg.port = parseInt($('#cfg-port').value, 10) || 3000;
        cfg.bindIp = $('#cfg-bindip').value || '';
        cfg.whitelistMode = $('#cfg-whitelist').checked;
        cfg.whitelistIps = $('#cfg-whitelist-ips').value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
        return cfg;
    }

    function bindSettings() {
        // 安全表单
        $$('#cfg-mode .segmented-item').forEach(b => {
            b.addEventListener('click', () => {
                $$('#cfg-mode .segmented-item').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
            });
        });
        $('#cfg-whitelist').addEventListener('change', (e) => {
            $('#cfg-whitelist-row').style.display = e.target.checked ? '' : 'none';
        });
        $('#btn-select-dir').addEventListener('click', async () => {
            const dir = await IPC.selectFolder();
            if (dir) {
                IPC.saveConfig(Object.assign(IPC.getConfig(), { customDir: dir }));
                $('#cfg-dir-label').textContent = dir;
                UI.toast('共享目录已更新（重启服务后生效）', 'success');
            }
        });
        $('#btn-apply-config').addEventListener('click', async () => {
            const cfg = readSecurityForm();
            if (cfg.port < 1024 || cfg.port > 65535) { UI.toast('端口范围 1024-65535', 'error'); return; }
            IPC.saveConfig(cfg);
            if (IPC.state.running) {
                UI.toast('正在重启服务…', 'info');
                const ok = await IPC.startService(cfg);
                UI.toast(ok ? '配置已生效' : '重启失败，请检查端口', ok ? 'success' : 'error');
            } else {
                UI.toast('配置已保存（服务未启动）', 'success');
            }
        });

        // 设备管理
        $('#btn-kick-all').addEventListener('click', async () => {
            const ok = await UI.confirmDialog({ title: '断开全部设备', message: '将强制断开所有已连接设备的会话。', danger: true, confirmText: '断开' });
            if (!ok) return;
            await fetch(api('/api/tools/kick-devices'), { method: 'POST', headers: auth().authHeaders() });
            UI.toast('已断开全部设备', 'success');
            refreshDevices();
        });

        // 回收站
        $('#btn-trash-refresh').addEventListener('click', refreshTrash);
        $('#btn-trash-clear').addEventListener('click', async () => {
            const ok = await UI.confirmDialog({ title: '清空回收站', message: '回收站内所有文件将被彻底删除，无法恢复。', danger: true, confirmText: '清空' });
            if (!ok) return;
            const res = await fetch(api('/api/trash/purge'), { method: 'POST', headers: auth().authHeaders({ 'Content-Type': 'application/json' }), body: '{}' });
            const data = await res.json().catch(() => ({}));
            UI.toast(`已清理 ${data.cleaned || 0} 项`, 'success');
            refreshTrash();
        });

        // 分享管理
        $('#btn-shares-refresh').addEventListener('click', refreshShares);

        // 传输记录
        $('#btn-history-clear').addEventListener('click', async () => {
            const ok = await UI.confirmDialog({ title: '清空传输记录', message: '仅清除记录，不影响已传输的文件。', danger: true, confirmText: '清空' });
            if (!ok) return;
            await fetch(api('/api/history/clear'), { method: 'POST', headers: auth().authHeaders() });
            refreshSettingsHistory();
            loadHomeHistory();
            UI.toast('记录已清空', 'success');
        });

        // 应用
        IPC.getAutostart().then(v => {
            const el = $('#cfg-autostart');
            if (el) el.checked = !!v;
        });
        $('#cfg-autostart').addEventListener('change', async (e) => {
            const res = await IPC.setAutostart(e.target.checked);
            if (res && res.success === false) {
                UI.toast('开机自启设置失败: ' + (res.error || ''), 'error');
                e.target.checked = !e.target.checked;
            } else {
                UI.toast(e.target.checked ? '已开启开机自启动' : '已关闭开机自启动', 'success');
            }
        });
        $('#cfg-autoserve').checked = localStorage.getItem('landisk_autostart_server') !== 'off';
        $('#cfg-autoserve').addEventListener('change', (e) => {
            localStorage.setItem('landisk_autostart_server', e.target.checked ? 'on' : 'off');
            UI.toast(e.target.checked ? '已开启「启动软件即开服务」' : '已关闭「启动软件即开服务」', 'success');
        });
        $('#btn-open-home').addEventListener('click', async () => {
            const home = (await (window.api ? window.api.getHomeDir() : 'C:\\')) || 'C:\\';
            const res = await IPC.openPath(home + '\\.landisk');
            if (res && res.success === false) UI.toast('数据目录尚未创建', 'info');
        });
        $('#btn-quit').addEventListener('click', async () => {
            const ok = await UI.confirmDialog({ title: '退出应用', message: '退出后将停止局域网共享服务。', danger: true, confirmText: '退出' });
            if (ok) IPC.quit();
        });

        // 日志
        $('#btn-logs-clear').addEventListener('click', () => { IPC.clearLogs(); renderLogs(); });
    }

    /* ---------- 设备管理 ---------- */
    async function refreshDevices() {
        const kickAllBtn = $('#btn-kick-all');
        if (!IPC.state.running) {
            if (kickAllBtn) kickAllBtn.style.display = 'none';
            $('#devices-list').innerHTML = `
                <div class="empty-state">
                    ${I('devices', 36)}
                    <div style="font-size:14.5px; font-weight:600; margin-top:6px">局域网共享服务未启动</div>
                    <div class="subtle" style="font-size:12px; margin-bottom:10px">启动服务后即可实时查看局域网中已接入的手机与电脑</div>
                    <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-dev-start-srv">${I('power', 14)} 启动服务</button>
                </div>
            `;
            const srvBtn = $('#btn-dev-start-srv');
            if (srvBtn) srvBtn.addEventListener('click', toggleService);
            $('#blacklist-list').innerHTML = '<span class="subtle" style="font-size:12.5px">服务未启动</span>';
            return;
        }
        try {
            const res = await fetch(api('/api/devices'), { headers: auth().authHeaders() });
            const data = await res.json();
            const devices = data.devices || [];
            if (kickAllBtn) kickAllBtn.style.display = devices.length ? '' : 'none';
            
            $('#devices-list').innerHTML = devices.length ? devices.map(dev => `
                <div class="device-card">
                    <div style="width:36px; height:36px; border-radius:11px; background:rgba(10,132,255,0.13); color:var(--apple-system-blue); display:grid; place-items:center; flex-shrink:0">${I('smartphone', 18)}</div>
                    <div style="flex:1; min-width:0">
                        <div class="row" style="gap:8px">
                            <b style="font-size:13.5px">${escapeHtml(dev.alias || dev.ip)}</b>
                            <span class="status-dot on"></span>
                        </div>
                        <div class="subtle ellipsis" style="font-size:11px">${escapeHtml(dev.ip)} · ${escapeHtml((dev.userAgent || '').slice(0, 36))}</div>
                    </div>
                    <div class="row" style="flex-shrink:0">
                        <button class="apple-btn apple-btn-glass apple-btn-sm" data-alias="${escapeHtml(dev.ip)}" data-cur="${escapeHtml(dev.alias || '')}" title="备注">${I('pencil', 13)}</button>
                        <button class="apple-btn apple-btn-danger apple-btn-sm" data-kick="${escapeHtml(dev.ip)}">断开</button>
                        <button class="apple-btn apple-btn-danger apple-btn-sm" data-ban="${escapeHtml(dev.ip)}">封禁</button>
                    </div>
                </div>
            `).join('') : `
                <div class="empty-state">
                    ${I('smartphone', 36)}
                    <div style="font-size:14.5px; font-weight:600; margin-top:6px">暂无其他设备接入</div>
                    <div class="subtle" style="font-size:12px; margin-bottom:10px">用同一局域网下的手机或平板扫描主页二维码即可极速互联</div>
                    <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-dev-show-qr">${I('qr', 14)} 扫码连接</button>
                </div>
            `;

            const qrBtn = $('#btn-dev-show-qr');
            if (qrBtn) qrBtn.addEventListener('click', showQrModal);

            $$('#devices-list [data-kick]').forEach(b => b.addEventListener('click', async () => {
                await fetch(api('/api/tools/kick-device'), { method: 'POST', headers: auth().authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ip: b.getAttribute('data-kick') }) });
                UI.toast('已断开', 'success'); refreshDevices();
            }));
            $$('#devices-list [data-ban]').forEach(b => b.addEventListener('click', async () => {
                await fetch(api('/api/tools/block-ip'), { method: 'POST', headers: auth().authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ip: b.getAttribute('data-ban') }) });
                UI.toast('已封禁该 IP', 'success'); IPC.addLog('封禁 IP: ' + b.getAttribute('data-ban'), 'warn'); refreshDevices();
            }));
            $$('#devices-list [data-alias]').forEach(b => b.addEventListener('click', async () => {
                const ip = b.getAttribute('data-alias');
                const name = await UI.promptDialog({ title: '设备备注', value: b.getAttribute('data-cur'), placeholder: '如：我的手机' });
                if (name === null) return;
                await fetch(api('/api/tools/set-device-alias'), { method: 'POST', headers: auth().authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ip, alias: name }) });
                UI.toast('备注已更新', 'success'); refreshDevices();
            }));

            const blocked = data.blockedIps || [];
            $('#blacklist-list').innerHTML = blocked.length ? blocked.map(ip => `
                <span class="blacklist-chip">${escapeHtml(ip)}<button data-unban="${escapeHtml(ip)}" style="border:none; background:none; color:inherit; cursor:pointer; display:inline-flex; padding:1px">${I('close', 10)}</button></span>
            `).join('') : '<span class="subtle" style="font-size:12.5px">暂无封禁 IP</span>';
            $$('#blacklist-list [data-unban]').forEach(b => b.addEventListener('click', async () => {
                await fetch(api('/api/tools/unblock-ip'), { method: 'POST', headers: auth().authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ip: b.getAttribute('data-unban') }) });
                UI.toast('已解封', 'success'); refreshDevices();
            }));
        } catch (e) {
            $('#devices-list').innerHTML = '<div class="empty-state">加载失败</div>';
        }
    }

    /* ---------- 回收站 ---------- */
    async function refreshTrash() {
        if (!IPC.state.running) {
            $('#trash-list').innerHTML = `
                <div class="empty-state">
                    ${I('trash', 36)}
                    <div style="font-size:14.5px; font-weight:600; margin-top:6px">局域网共享服务未启动</div>
                    <div class="subtle" style="font-size:12px; margin-bottom:10px">启动服务后即可管理回收站并支持误删文件一键恢复</div>
                    <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-trash-start-srv">${I('power', 14)} 启动服务</button>
                </div>
            `;
            const srvBtn = $('#btn-trash-start-srv');
            if (srvBtn) srvBtn.addEventListener('click', toggleService);
            return;
        }
        try {
            const res = await fetch(api('/api/trash'), { headers: auth().authHeaders() });
            const data = await res.json();
            const items = data.items || [];
            $('#trash-list').innerHTML = items.length ? items.map(it => `
                <div class="history-item">
                    <div class="hicon" style="background:rgba(255,159,10,0.13); color:var(--apple-system-orange)">${I(it.isDirectory ? 'folder' : 'fileText', 15)}</div>
                    <div style="flex:1; min-width:0">
                        <div class="ellipsis" style="font-weight:600">${escapeHtml(it.name)}</div>
                        <div class="subtle ellipsis" style="font-size:11px">原路径：${escapeHtml(it.originPath)} · ${fmtBytes(it.size)}</div>
                    </div>
                    <div class="row" style="flex-shrink:0">
                        <button class="apple-btn apple-btn-glass apple-btn-sm" data-restore="${it.id}">恢复</button>
                        <button class="apple-btn apple-btn-danger apple-btn-sm" data-purge="${it.id}">彻底删除</button>
                    </div>
                </div>
            `).join('') : `
                <div class="empty-state">
                    ${I('trash', 36)}
                    <div style="font-size:14px; font-weight:600; margin-top:6px">回收站为空</div>
                    <div class="subtle" style="font-size:12px">在文件页删除的文件将安全存放在此处，可随时还原</div>
                </div>
            `;

            $$('#trash-list [data-restore]').forEach(b => b.addEventListener('click', async () => {
                const res = await fetch(api('/api/trash/restore'), { method: 'POST', headers: auth().authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id: b.getAttribute('data-restore') }) });
                const data = await res.json().catch(() => ({}));
                UI.toast(data.success ? `已恢复到 ${data.restoredTo}` : (data.error || '恢复失败'), data.success ? 'success' : 'error');
                refreshTrash();
            }));
            $$('#trash-list [data-purge]').forEach(b => b.addEventListener('click', async () => {
                await fetch(api('/api/trash/purge'), { method: 'POST', headers: auth().authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id: b.getAttribute('data-purge') }) });
                UI.toast('已彻底删除', 'success');
                refreshTrash();
            }));
        } catch (e) {}
    }

    /* ---------- 分享管理 ---------- */
    async function refreshShares() {
        if (!IPC.state.running) {
            $('#shares-list').innerHTML = `
                <div class="empty-state">
                    ${I('qr', 36)}
                    <div style="font-size:14.5px; font-weight:600; margin-top:6px">局域网共享服务未启动</div>
                    <div class="subtle" style="font-size:12px; margin-bottom:10px">启动服务后可生成与管理临时文件分享链接</div>
                    <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-shares-start-srv">${I('power', 14)} 启动服务</button>
                </div>
            `;
            const srvBtn = $('#btn-shares-start-srv');
            if (srvBtn) srvBtn.addEventListener('click', toggleService);
            return;
        }
        try {
            const res = await fetch(api('/api/shares'), { headers: auth().authHeaders() });
            const data = await res.json();
            const items = data.items || [];
            $('#shares-list').innerHTML = items.length ? items.map(s => {
                const left = s.expiresAt - Date.now();
                const leftTxt = left > 3600e3 ? Math.round(left / 3600e3) + ' 小时' : Math.max(0, Math.round(left / 60e3)) + ' 分钟';
                return `
                    <div class="history-item">
                        <div class="hicon" style="background:rgba(10,132,255,0.13); color:var(--apple-system-blue)">${I('link', 15)}</div>
                        <div style="flex:1; min-width:0">
                            <div class="ellipsis" style="font-weight:600">${escapeHtml(s.fileName)}</div>
                            <div class="subtle" style="font-size:11px">剩余 ${leftTxt} · ${escapeHtml(s.shareId)}</div>
                        </div>
                        <div class="row" style="flex-shrink:0">
                            <button class="apple-btn apple-btn-glass apple-btn-sm" data-copy="${escapeHtml(api('/api/shared/download/' + s.shareId))}">复制</button>
                            <button class="apple-btn apple-btn-danger apple-btn-sm" data-revoke="${s.shareId}">撤销</button>
                        </div>
                    </div>
                `;
            }).join('') : `
                <div class="empty-state">
                    ${I('qr', 36)}
                    <div style="font-size:14px; font-weight:600; margin-top:6px">暂无活动分享</div>
                    <div class="subtle" style="font-size:12px">在文件页右键任意文件，即可生成临时免密分享链接</div>
                </div>
            `;

            $$('#shares-list [data-copy]').forEach(b => b.addEventListener('click', async () => {
                try { await navigator.clipboard.writeText(b.getAttribute('data-copy')); UI.toast('链接已复制', 'success'); } catch (e) {}
            }));
            $$('#shares-list [data-revoke]').forEach(b => b.addEventListener('click', async () => {
                await fetch(api('/api/share/revoke'), { method: 'POST', headers: auth().authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ shareId: b.getAttribute('data-revoke') }) });
                UI.toast('已撤销', 'success');
                refreshShares();
            }));
        } catch (e) {}
    }

    /* ---------- 传输记录（设置页） ---------- */
    async function refreshSettingsHistory() {
        if (!IPC.state.running) {
            $('#settings-history').innerHTML = `
                <div class="empty-state">
                    ${I('history', 36)}
                    <div style="font-size:14.5px; font-weight:600; margin-top:6px">局域网共享服务未启动</div>
                    <div class="subtle" style="font-size:12px; margin-bottom:10px">启动服务后将在此记录跨端文件上传与下载传输明细</div>
                    <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-hist-start-srv">${I('power', 14)} 启动服务</button>
                </div>
            `;
            const srvBtn = $('#btn-hist-start-srv');
            if (srvBtn) srvBtn.addEventListener('click', toggleService);
            return;
        }
        try {
            const res = await fetch(api('/api/history?limit=50'), { headers: auth().authHeaders() });
            const data = await res.json();
            const items = data.items || [];
            $('#settings-history').innerHTML = items.length ? items.map(it => `
                <div class="history-item">
                    <div class="hicon ${it.kind === 'upload' ? 'up' : 'down'}">${I(it.kind === 'upload' ? 'upload' : 'download', 15)}</div>
                    <div style="flex:1; min-width:0">
                        <div class="ellipsis" style="font-weight:600">${escapeHtml(it.name)}</div>
                        <div class="subtle ellipsis" style="font-size:11px">${new Date(it.time).toLocaleString('zh-CN')} · ${fmtBytes(it.size)}${it.ip && it.ip !== '127.0.0.1' ? ' · ' + escapeHtml(it.ip) : ''}</div>
                    </div>
                    <span class="apple-badge ${it.kind === 'upload' ? 'apple-badge-success' : 'apple-badge-info'}">${it.kind === 'upload' ? '收到' : '发出'}</span>
                </div>
            `).join('') : `
                <div class="empty-state">
                    ${I('history', 36)}
                    <div style="font-size:14px; font-weight:600; margin-top:6px">暂无传输记录</div>
                    <div class="subtle" style="font-size:12px">跨设备上传或下载的文件都会自动记录在这里</div>
                </div>
            `;
        } catch (e) {}
    }

    /* ---------- 日志 ---------- */
    function renderLogs() {
        const el = $('#log-view');
        const logs = IPC.getLogs();
        el.innerHTML = logs.length ? logs.map(l =>
            `<div class="log-line ${l.type}">[${new Date(l.t).toLocaleTimeString('zh-CN')}] ${escapeHtml(l.msg)}</div>`
        ).join('') : '<div class="subtle">暂无日志</div>';
    }

    /* ---------- 工具页 / 文件页 / 影音页 / 聊天页按钮 ---------- */
    function bindViews() {
        // 文件页
        $('#btn-go-up').addEventListener('click', () => FileExplorerComponent.goUp());
        $('#btn-mkdir').addEventListener('click', () => FileExplorerComponent.newFolder());
        $('#btn-explorer-refresh').addEventListener('click', () => FileExplorerComponent.refresh());
        $('#btn-add-bookmark').addEventListener('click', () => FileExplorerComponent.addBookmark());

        // 分类筛选药丸
        document.querySelectorAll('#file-category-pills .file-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.getAttribute('data-cat');
                document.querySelectorAll('#file-category-pills .file-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (window.FileExplorerComponent && typeof window.FileExplorerComponent.setCategory === 'function') {
                    window.FileExplorerComponent.setCategory(cat);
                }
            });
        });

        // 排序按钮
        const btnSort = document.getElementById('btn-file-sort');
        const sortLabel = document.getElementById('file-sort-label');
        if (btnSort) {
            const sortModes = ['name', 'size', 'time'];
            let currentSortIdx = 0;
            const sortNames = { name: '名称', size: '大小', time: '时间' };

            btnSort.addEventListener('click', () => {
                currentSortIdx = (currentSortIdx + 1) % sortModes.length;
                const mode = sortModes[currentSortIdx];
                if (window.FileExplorerComponent && typeof window.FileExplorerComponent.setSort === 'function') {
                    const info = window.FileExplorerComponent.setSort(mode);
                    if (sortLabel) sortLabel.textContent = sortNames[mode] + (info.sortOrder === 'asc' ? ' ↑' : ' ↓');
                }
            });
        }

        // 影音页
        $('#btn-media-scan').addEventListener('click', () => {
            if (!IPC.state.running) { UI.toast('请先启动服务', 'info'); return; }
            MediaTheaterComponent.scan();
        });
        $('#btn-media-folder').addEventListener('click', () => {
            MediaTheaterComponent.pickFolder();
        });

        // 聊天页
        $('#btn-chat-send').addEventListener('click', () => IMessageChatComponent.sendMessage());
        $('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') IMessageChatComponent.sendMessage(); });
        $('#chat-image-input').addEventListener('change', (e) => IMessageChatComponent.sendImage(e.target));
        $('#btn-chat-clear').addEventListener('click', () => IMessageChatComponent.clearChat());

        // 快捷操作
        const qaRemote = $('#qa-remote-control');
        if (qaRemote) qaRemote.addEventListener('click', () => switchView('tools'));

        // 工具页
        $('#btn-terminal-run').addEventListener('click', () => WebTerminalComponent.execute('terminal-input', 'terminal-output'));
        $('#btn-proc-refresh').addEventListener('click', () => ProcessMonitorComponent.load('process-list'));
        $('#btn-draw-clear').addEventListener('click', () => WhiteboardComponent.clear('whiteboard'));
        $('#btn-draw-save').addEventListener('click', () => WhiteboardComponent.save());

        $('#btn-clip-pull').addEventListener('click', async () => {
            if (!IPC.state.running) { UI.toast('请先启动服务', 'info'); return; }
            const res = await fetch(api('/api/clipboard'), { headers: auth().authHeaders() });
            const data = await res.json().catch(() => ({}));
            if (res.ok) { $('#clip-text').value = data.text || ''; UI.toast(data.text ? '已拉取系统剪贴板' : '剪贴板为空', 'success'); }
            else UI.toast(data.error || '拉取失败', 'error');
        });
        $('#btn-clip-push').addEventListener('click', async () => {
            if (!IPC.state.running) { UI.toast('请先启动服务', 'info'); return; }
            const text = $('#clip-text').value;
            if (!text.trim()) { UI.toast('没有可推送的文本', 'info'); return; }
            const res = await fetch(api('/api/clipboard'), {
                method: 'POST',
                headers: auth().authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ text })
            });
            UI.toast(res.ok ? '已推送到系统剪贴板' : '推送失败', res.ok ? 'success' : 'error');
        });

        // 模态框
        $('#image-modal-close').addEventListener('click', () => { $('#image-modal').style.display = 'none'; });
        $('#text-modal-close').addEventListener('click', () => { $('#text-modal').style.display = 'none'; });
        $('#img-prev').addEventListener('click', () => window.MediaHubInstance && MediaHubInstance.prevImage());
        $('#img-next').addEventListener('click', () => window.MediaHubInstance && MediaHubInstance.nextImage());

        // 文件操作后刷新主页传输记录
        window.onFileActivity = () => loadHomeHistory();
    }

    /* ---------- 退出与后台运行机制 ---------- */
    function syncCloseActionSetting(val) {
        const v = val || localStorage.getItem('landisk_close_action') || 'ask';
        $$('#cfg-close-action .segmented-item').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-v') === v);
        });
    }

    function initCloseActionSetting() {
        syncCloseActionSetting();
        $$('#cfg-close-action .segmented-item').forEach(b => {
            b.addEventListener('click', () => {
                const val = b.getAttribute('data-v');
                localStorage.setItem('landisk_close_action', val);
                syncCloseActionSetting(val);
                if (UI && UI.toast) {
                    const tipMap = {
                        ask: '已设置为：每次关闭窗口时询问',
                        minimize: '已设置为：点击关闭直接在后台运行',
                        quit: '已设置为：点击关闭直接完全退出并停止互联'
                    };
                    UI.toast(tipMap[val] || '已更新设置', 'success');
                }
            });
        });
    }

    function handleWindowClose() {
        const savedAction = localStorage.getItem('landisk_close_action') || 'ask';
        if (savedAction === 'minimize') {
            if (window.api && window.api.hideWindow) {
                window.api.hideWindow();
            } else if (window.api && window.api.invoke) {
                window.api.invoke('hide-window');
            } else {
                IPC.close();
            }
            return;
        }
        if (savedAction === 'quit') {
            doQuitApp();
            return;
        }
        showExitModal();
    }

    function showExitModal() {
        const ui = window.LanDiskUI || window.UI;
        if (!ui || !ui.openModal) {
            IPC.close();
            return;
        }

        const modal = ui.openModal(`
            <div class="exit-modal-box">
                <div class="modal-title" style="display:flex; align-items:center; gap:8px;">
                    <span style="color:var(--apple-system-blue)">${Icons ? Icons.render('power', 18) : ''}</span>
                    <span>关闭猫步互联</span>
                </div>
                <div class="modal-message" style="margin-bottom:14px;">
                    请选择关闭窗口后的运行方式：
                </div>
                
                <div class="exit-options-grid">
                    <div class="exit-option-card active" data-action="minimize">
                        <div class="exit-option-radio"></div>
                        <div class="exit-option-content">
                            <div class="exit-option-title">最小化到托盘 (后台运行)</div>
                            <div class="exit-option-desc">隐藏窗口，保持手机与电脑的局域网连接、文件互传与影音播放</div>
                        </div>
                    </div>
                    <div class="exit-option-card" data-action="quit">
                        <div class="exit-option-radio"></div>
                        <div class="exit-option-content">
                            <div class="exit-option-title" style="color:var(--apple-system-red)">完全退出软件</div>
                            <div class="exit-option-desc">彻底关闭软件，自动停止局域网互联服务并释放端口</div>
                        </div>
                    </div>
                </div>

                <div class="row" style="margin:14px 0 16px; font-size:12px; color:var(--apple-text-muted); cursor:pointer;">
                    <input type="checkbox" class="apple-checkbox" id="cb-exit-remember">
                    <label for="cb-exit-remember" style="cursor:pointer; user-select:none; margin-left:4px;">记住我的选择，以后不再提示</label>
                </div>

                <div class="modal-actions">
                    <button class="apple-btn apple-btn-glass" data-act="cancel">取消</button>
                    <button class="apple-btn apple-btn-primary" data-act="confirm">确定</button>
                </div>
            </div>
        `, { width: 440 });

        let selectedAction = 'minimize';
        const cards = modal.el.querySelectorAll('.exit-option-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                cards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                selectedAction = card.getAttribute('data-action');
            });
        });

        modal.el.querySelector('[data-act="cancel"]').addEventListener('click', () => {
            modal.close();
        });

        modal.el.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
            const remember = modal.el.querySelector('#cb-exit-remember').checked;
            if (remember) {
                localStorage.setItem('landisk_close_action', selectedAction);
                syncCloseActionSetting(selectedAction);
            }
            modal.close();

            if (selectedAction === 'minimize') {
                if (window.api && window.api.hideWindow) {
                    window.api.hideWindow();
                } else if (window.api && window.api.invoke) {
                    window.api.invoke('hide-window');
                } else {
                    IPC.close();
                }
            } else {
                doQuitApp();
            }
        });
    }

    async function doQuitApp() {
        if (window.LanDiskUI && window.LanDiskUI.toast) {
            window.LanDiskUI.toast('正在停止局域网服务并退出…', 'info');
        }
        if (window.api && window.api.quitApp) {
            await window.api.quitApp();
        } else if (window.api && window.api.invoke) {
            await window.api.invoke('quit-app');
        }
    }

    /* ---------- 启动 ---------- */
    function init() {
        try { hydrateIcons(); } catch (e) { console.error('hydrateIcons error:', e); }
        try { initTheme(); } catch (e) { console.error('initTheme error:', e); }
        try { initCloseActionSetting(); } catch (e) { console.error('initCloseActionSetting error:', e); }
        try { bindWindowControls(); } catch (e) { console.error('bindWindowControls error:', e); }
        try { bindQuickActions(); } catch (e) { console.error('bindQuickActions error:', e); }
        try { bindSettings(); } catch (e) { console.error('bindSettings error:', e); }
        try { bindViews(); } catch (e) { console.error('bindViews error:', e); }

        try {
            window.MediaHubInstance = new MediaHubComponent({
                imageModal: '#image-modal',
                imageViewer: '#image-viewer',
                textModal: '#text-modal',
                textViewer: '#text-viewer',
                textTitle: '#text-title'
            });
        } catch (e) { console.error('MediaHubComponent error:', e); }

        IPC.onServiceChange(() => {
            updateServiceUI();
            loadHomeHistory();
            refreshDevices();
            if (IPC.state.running) bootChat();
        });
        IPC.onLog(() => {
            if ($('#view-settings').classList.contains('active') && $('#log-view')) renderLogs();
        });

        window.isRunning = IPC.state.running;
        window.currentServerUrl = IPC.state.url;
        updateServiceUI();
        loadSecurityForm();
        pollHome(true);

        if (IPC.available && localStorage.getItem('landisk_autostart_server') !== 'off') {
            setTimeout(async () => {
                if (!IPC.state.running) {
                    await IPC.startService();
                    bootChat();
                }
            }, 500);
        }

        IPC.addLog('猫步互联 Pro 桌面端已启动', 'ok');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
