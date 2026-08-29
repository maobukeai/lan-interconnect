/**
 * 猫步互联 Pro · Web 端应用逻辑
 * 登录 / 悬浮 Dock 导航 / Bento 大盘 sparkline / 影音剧院 / 剪贴板互通 / 组件接线
 */

(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const I = (name, size) => window.Icons ? Icons.render(name, size) : '';
    const auth = () => window.LanDiskAuth || null;
    const api = (p) => (auth() && auth().api) ? auth().api(p) : (window.api ? window.api(p) : p);
    const fmtBytes = (b) => {
        if (!+b) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1);
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    window.__lanDiskLoggedIn = false;

    /* ---------- 图标注入 ---------- */
    function hydrateIcons() {
        document.querySelectorAll('[data-icon]').forEach(el => {
            const name = el.getAttribute('data-icon');
            const size = parseInt(el.getAttribute('data-icon-size'), 10) || (el.closest('.apple-card-title-text') ? 17 : 15);
            el.innerHTML = I(name, size);
        });
        // 工具栏纯图标按钮
        const btnIcon = (id, name, title) => {
            const b = document.getElementById(id);
            if (b) { b.innerHTML = I(name, 16); if (title) b.title = title; }
        };
        btnIcon('btn-refresh', 'refresh', '刷新数据');
        btnIcon('btn-go-up', 'chevronUp', '返回上级');
        btnIcon('btn-mkdir', 'folderPlus', '新建文件夹');
        btnIcon('btn-explorer-refresh', 'refresh', '刷新');
        btnIcon('image-modal-close', 'close');
        btnIcon('text-modal-close', 'close');
        $('#btn-upload-icon') && ($('#btn-upload-icon').innerHTML = I('upload', 15));
        // btn-add-bookmark formatted in HTML
        $('#login-logo') && ($('#login-logo').innerHTML = I('zap', 30));
    }

    /* ---------- Sparkline 迷你折线（共享库） ---------- */
    const sparkCpu = new LanDiskUI.Sparkline($('#spark-cpu'), 'var(--apple-system-blue)');
    const sparkMem = new LanDiskUI.Sparkline($('#spark-mem'), 'var(--apple-system-purple)');
    const sparkNet = new LanDiskUI.Sparkline($('#spark-net'), 'var(--apple-system-green)');
    const dashTxBytes = { tx: 0, rx: 0 };

    /* ---------- 主题 ---------- */
    function initTheme() {
        if (window.LanDiskUI) LanDiskUI.Theme.apply();
        updateThemeBtn();
        $('#btn-theme').addEventListener('click', () => { LanDiskUI.Theme.toggle(); updateThemeBtn(); });
    }
    function updateThemeBtn() { $('#btn-theme').innerHTML = I(LanDiskUI.Theme.icon(), 17); }

    /* ---------- 登录 ---------- */
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
        try { localStorage.setItem('lan_disk_qr_token', urlToken); } catch (e) {}
        history.replaceState(null, '', window.location.pathname);
    }

    async function verifyPin() {
        const pin = $('#pin-input').value.trim();
        try {
            const res = await fetch(api('/api/verify'), { method: 'POST', headers: { 'x-pin': pin, 'x-qr-token': (auth() && auth().getToken()) || '' } });
            if (res.status === 429) { LanDiskUI.toast('尝试过于频繁，请稍后再试', 'error'); return; }
            if (res.ok) {
                try { localStorage.setItem('lan_disk_pin', pin); } catch (e) {}
                enterApp();
            } else {
                $('#login-error').style.display = 'block';
                setTimeout(() => { $('#login-error').style.display = 'none'; }, 2500);
            }
        } catch (e) {
            LanDiskUI.toast('连接服务器失败，请检查网络或点击雷达重新扫描', 'error');
        }
    }

    function enterApp() {
        window.__lanDiskLoggedIn = true;
        $('#login-overlay').style.display = 'none';
        IMessageChatComponent.init('chat-messages');
        loadDashboard();
        loadHistoryFeed();
    }

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
    const viewInit = { files: false, media: false, tools: false, chat: false };

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

    function switchView(view, pushState = true) {
        if (LanDiskUI && LanDiskUI.Haptic) {
            LanDiskUI.Haptic.light();
        }

        let activeBtn = null;
        document.querySelectorAll('.dock-item').forEach(el => {
            const isMatch = el.getAttribute('data-view') === view;
            el.classList.toggle('active', isMatch);
            if (isMatch) activeBtn = el;
        });
        updateDockGlider(activeBtn, true);

        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        const target = $('#view-' + view);
        if (target) target.classList.add('active');

        if (pushState && history.pushState) history.pushState({ type: 'tab', tab: view }, '', '#tab=' + view);

        if (view === 'dashboard') { loadDashboard(); loadHistoryFeed(); }
        if (view === 'chat') { chatUnread = 0; updateChatBadge(); }
        if (view === 'files' && !viewInit.files) {
            viewInit.files = true;
            FileExplorerComponent.init('file-list', 'current-path');
        }
        if (view === 'media' && !viewInit.media) {
            viewInit.media = true;
            initMediaView();
        }
        if (view === 'tools' && !viewInit.tools) {
            viewInit.tools = true;
            if (typeof RemoteControl !== 'undefined' && $('#web-remote-control-container')) {
                window.webRemoteControl = new RemoteControl({
                    container: '#web-remote-control-container'
                });
            }
            ProcessMonitorComponent.load('process-list');
            WhiteboardComponent.init('whiteboard');
            const ps = $('#process-search');
            if (ps) ps.addEventListener('input', (e) => ProcessMonitorComponent.filter(e.target.value));
        }
    }

    document.querySelectorAll('.dock-item').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
    });

    window.addEventListener('resize', () => updateDockGlider(null, false));
    setTimeout(() => updateDockGlider(null, false), 60);

    // 手机返回键：关弹窗 → 回退目录 → 切 tab
    window.addEventListener('popstate', (e) => {
        const playerView = document.getElementById('view-player');
        if (playerView && playerView.classList.contains('active')) {
            if (window.AppleMediaPlayer) window.AppleMediaPlayer.close();
            return;
        }
        const imgModal = $('#image-modal');
        if (imgModal && imgModal.style.display === 'flex') { imgModal.style.display = 'none'; return; }
        const txtModal = $('#text-modal');
        if (txtModal && txtModal.style.display === 'flex') { txtModal.style.display = 'none'; return; }

        if (e.state && e.state.type === 'dir' && e.state.path) {
            FileExplorerComponent.loadPath(e.state.path, false);
        } else if (e.state && e.state.type === 'root') {
            FileExplorerComponent.loadDrives(false);
        } else if (e.state && e.state.type === 'tab' && e.state.tab) {
            switchView(e.state.tab, false);
        } else if (FileExplorerComponent.getInstance() && !FileExplorerComponent.getInstance().isRoot) {
            FileExplorerComponent.goUp(false);
        }
    });

    /* ---------- 大盘 ---------- */
    let dashTimer = null;

    function renderDashRemoteWidget() {
        const box = $('#dash-remote-widget-container');
        if (!box || box._rendered) return;
        box._rendered = true;
        box.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; font-size:13px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="color:var(--apple-blue); display:flex; align-items:center;">${Icons.render('remoteControl', 18)}</span>
                    <span id="dash-quick-control-text" style="font-weight:600; color:var(--apple-text-main);">电脑控制已在线</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-dash-quick-mute" style="height:28px; font-size:12px;">静音切换</button>
                    <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-dash-quick-lock" style="height:28px; font-size:12px;">${Icons.render('lock', 13)} 一键锁屏</button>
                </div>
            </div>
        `;
        $('#btn-dash-quick-mute')?.addEventListener('click', async () => {
            try {
                const headers = (auth() && auth().authHeaders) ? auth().authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
                const res = await fetch(api('/api/remote/volume'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ mute: 'toggle' })
                });
                const d = await res.json().catch(() => ({}));
                if (res.ok) {
                    LanDiskUI.toast(d.muted ? '已静音' : `音量: ${d.volume}%`, 'info');
                } else {
                    LanDiskUI.toast(d.error || '调节音量失败', 'error');
                }
            } catch(e) {
                LanDiskUI.toast('静音请求失败: ' + e.message, 'error');
            }
        });
        $('#btn-dash-quick-lock')?.addEventListener('click', async () => {
            const ok = await LanDiskUI.confirmDialog({ title: '一键锁屏', message: '确定要立即锁定电脑屏幕吗？' });
            if (ok) {
                try {
                    const headers = (auth() && auth().authHeaders) ? auth().authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
                    const res = await fetch(api('/api/remote/power'), {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ action: 'lock' })
                    });
                    const d = await res.json().catch(() => ({}));
                    if (res.ok) {
                        LanDiskUI.toast('系统已锁定', 'success');
                    } else {
                        LanDiskUI.toast(d.error || '锁屏失败', 'error');
                    }
                } catch(e) {
                    LanDiskUI.toast('锁屏请求失败: ' + e.message, 'error');
                }
            }
        });
    }

    async function loadDashboard() {
        if (!window.__lanDiskLoggedIn) return;
        renderDashRemoteWidget();
        try {
            const [sysRes, devRes] = await Promise.all([
                fetch(api('/api/sys-info'), { headers: auth().authHeaders() }),
                fetch(api('/api/devices'), { headers: auth().authHeaders() })
            ]);

            if (sysRes.ok) {
                const d = await sysRes.json();
                $('#dash-cpu').textContent = (d.cpuUsage || 0) + '%';
                sparkCpu.push(d.cpuUsage || 0);

                const usedMem = d.memTotal - d.memFree;
                const memPercent = Math.round((usedMem / d.memTotal) * 100) || 0;
                $('#dash-mem').textContent = memPercent + '%';
                sparkMem.push(memPercent);
                if ($('#dash-mem-sub')) $('#dash-mem-sub').textContent = `已用 ${fmtBytes(usedMem)} / 共 ${fmtBytes(d.memTotal)}`;

                const cpuModel = (d.cpu || '').split('@')[0].trim();
                if ($('#dash-cpu-name')) $('#dash-cpu-name').textContent = cpuModel || '多核处理器';

                if (d.diskSpace) {
                    if (d.diskSpace.includes('可用 / 共')) {
                        const parts = d.diskSpace.split('可用 / 共');
                        const freeStr = parts[0].trim();
                        const totalStr = (parts[1] || '').trim();
                        $('#dash-disk').textContent = freeStr + ' 可用';
                        if ($('#dash-disk-sub')) $('#dash-disk-sub').textContent = `总容量 ${totalStr}`;

                        // 解析数值更新下方的「存储空间容量」进度条卡片
                        const freeNum = parseFloat(freeStr) || 0;
                        const totalNum = parseFloat(totalStr) || 0;
                        if (totalNum > 0) {
                            const usedNum = Math.max(0, totalNum - freeNum);
                            const usedPercent = Math.min(100, Math.max(0, Math.round((usedNum / totalNum) * 100)));
                            if ($('#dash-storage-fill')) $('#dash-storage-fill').style.width = usedPercent + '%';
                            if ($('#dash-storage-detail')) $('#dash-storage-detail').textContent = `已用 ${usedNum.toFixed(1)} GB / 共 ${totalStr} (可用 ${freeStr})`;
                            
                            const healthEl = $('#dash-storage-health');
                            if (healthEl) {
                                if (usedPercent >= 95) {
                                    healthEl.textContent = '● 空间严重不足';
                                    healthEl.style.color = 'var(--apple-system-red, #ff3b30)';
                                } else if (usedPercent >= 85) {
                                    healthEl.textContent = '● 空间偏低';
                                    healthEl.style.color = 'var(--apple-system-orange, #ff9500)';
                                } else {
                                    healthEl.textContent = '● 状态健康';
                                    healthEl.style.color = 'var(--apple-system-green, #34c759)';
                                }
                            }
                        }
                    } else {
                        $('#dash-disk').textContent = d.diskSpace;
                        if ($('#dash-storage-detail')) $('#dash-storage-detail').textContent = d.diskSpace;
                    }
                }
            }

            if (devRes.ok) {
                const d = await devRes.json();
                const list = $('#dash-devices-list');
                const rawDevs = d.devices || [];
                const extDevs = rawDevs.filter(dev => dev.ip && dev.ip !== '127.0.0.1' && dev.ip !== 'localhost' && dev.ip !== '::1');
                const activeCount = extDevs.length;

                $('#dash-device-count').textContent = activeCount;
                $('#dash-device-sub').textContent = activeCount > 0 ? `${activeCount} 台设备在线协同中` : '等待其他设备接入局域网';

                if (list) {
                    if (extDevs.length > 0) {
                        list.innerHTML = extDevs.map(dev => `
                            <div class="device-node-card">
                                <div style="color:var(--apple-system-blue);"><span data-icon="smartphone"></span></div>
                                <div class="device-node-meta">
                                    <div class="device-node-name ellipsis">${escapeHtml(dev.alias || dev.ip)}</div>
                                    <div class="device-node-sub ellipsis">${escapeHtml((dev.userAgent || '').slice(0, 30) || dev.ip)} · 在线</div>
                                </div>
                                <span class="status-dot on"></span>
                            </div>
                        `).join('');
                    } else {
                        list.innerHTML = `
                            <div class="device-node-card host-card">
                                <div style="color:var(--apple-system-blue);"><span data-icon="monitor"></span></div>
                                <div class="device-node-meta">
                                    <div class="device-node-name ellipsis">当前设备 (已连接)</div>
                                    <div class="device-node-sub ellipsis">局域网服务运行中</div>
                                </div>
                                <span class="status-dot on"></span>
                            </div>
                            <div class="device-node-card qr-card">
                                <div style="color:var(--apple-system-blue);"><span data-icon="devices"></span></div>
                                <div class="device-node-meta">
                                    <div class="device-node-name ellipsis">等待其他设备加入</div>
                                    <div class="device-node-sub ellipsis">手机扫码或输入网址即可直连</div>
                                </div>
                                <span class="apple-badge apple-badge-sm apple-badge-primary" style="font-size:10px;">待命</span>
                            </div>
                        `;
                    }
                    if (window.Icons) {
                        list.querySelectorAll('[data-icon]').forEach(iEl => {
                            iEl.innerHTML = Icons.render(iEl.getAttribute('data-icon'), 16);
                        });
                    }
                }
            }
        } catch (e) { /* 静默：轮询失败不打扰 */ }
    }

    async function loadHistoryFeed() {
        if (!window.__lanDiskLoggedIn) return;
        try {
            const res = await fetch('/api/history?limit=8', { headers: auth().authHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            const list = $('#history-list');
            if (!data.items || !data.items.length) {
                list.innerHTML = '<div class="empty-state">暂无传输记录，去文件页传点东西吧</div>';
                return;
            }
            list.innerHTML = data.items.map(it => `
                <div class="history-item">
                    <div class="hicon ${it.kind === 'upload' ? 'up' : 'down'}">${I(it.kind === 'upload' ? 'upload' : 'download', 15)}</div>
                    <div style="flex:1; min-width:0">
                        <div class="ellipsis" style="font-weight:600">${escapeHtml(it.name)}</div>
                        <div class="subtle" style="font-size:11px">${fmtBytes(it.size)} · ${new Date(it.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}${it.ip && it.ip !== '127.0.0.1' ? ' · ' + escapeHtml(it.ip) : ''}</div>
                    </div>
                    <span class="apple-badge ${it.kind === 'upload' ? 'apple-badge-success' : 'apple-badge-info'}">${it.kind === 'upload' ? '收' : '发'}</span>
                </div>
            `).join('');
        } catch (e) {}
    }

    // 大盘轮询：仅登录后且当前页可见时
    dashTimer = setInterval(() => {
        if (!window.__lanDiskLoggedIn) return;
        if (document.hidden) return;
        const v = $('#view-dashboard');
        if (v && v.classList.contains('active')) loadDashboard();
    }, 3000);

    /* ---------- 文件页按钮 ---------- */
    function bindFilesView() {
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

    }

    /* ---------- 影音剧院（共享组件） ---------- */
    function initMediaView() {
        MediaTheaterComponent.init({
            grid: '#poster-grid',
            folderLabel: '#media-folder-label',
            chipRow: '#media-folders-chip-row'
        });
        $('#btn-media-scan').addEventListener('click', () => MediaTheaterComponent.scan());
        $('#btn-media-folder').addEventListener('click', () => MediaTheaterComponent.pickFolder());
        // 若本地已有保存的媒体目录，自动聚合扫描呈现
        const savedRaw = localStorage.getItem('landisk_media_folders') || localStorage.getItem('landisk_media_folder');
        if (savedRaw) {
            MediaTheaterComponent.scan();
        }
    }

    /* ---------- 剪贴板互通 ---------- */
    function bindClipboard() {
        $('#btn-clip-pull').addEventListener('click', async () => {
            try {
                const res = await fetch('/api/clipboard', { headers: auth().authHeaders() });
                const data = await res.json();
                if (res.ok) {
                    $('#clip-text').value = data.text || '';
                    LanDiskUI.toast(data.text ? '已拉取电脑剪贴板' : '电脑剪贴板为空', 'success');
                } else {
                    LanDiskUI.toast(data.error || '拉取失败（免密模式下仅限本机）', 'error');
                }
            } catch (e) { LanDiskUI.toast('拉取失败', 'error'); }
        });
        $('#btn-clip-push').addEventListener('click', async () => {
            const text = $('#clip-text').value;
            if (!text.trim()) { LanDiskUI.toast('没有可推送的文本', 'info'); return; }
            try {
                const res = await fetch('/api/clipboard', {
                    method: 'POST',
                    headers: auth().authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ text })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) LanDiskUI.toast('已推送到电脑剪贴板', 'success');
                else LanDiskUI.toast(data.error || '推送失败（免密模式下仅限本机）', 'error');
            } catch (e) { LanDiskUI.toast('推送失败', 'error'); }
        });
    }

    /* ---------- 其余按钮接线 ---------- */
    function bindMisc() {
        $('#btn-login').addEventListener('click', verifyPin);
        $('#pin-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyPin(); });
        $('#btn-refresh').addEventListener('click', () => { loadDashboard(); loadHistoryFeed(); LanDiskUI.toast('已刷新', 'success'); });
        $('#btn-history-refresh').addEventListener('click', loadHistoryFeed);

        // 聊天
        $('#btn-chat-send').addEventListener('click', () => IMessageChatComponent.sendMessage());
        $('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') IMessageChatComponent.sendMessage(); });
        $('#chat-image-input').addEventListener('change', (e) => IMessageChatComponent.sendImage(e.target));
        $('#btn-chat-clear').addEventListener('click', () => IMessageChatComponent.clearChat());

        // 工具箱分段切换
        document.querySelectorAll('#tools-segmented .segmented-item').forEach(btn => {
            btn.addEventListener('click', () => {
                if (LanDiskUI && LanDiskUI.Haptic) {
                    LanDiskUI.Haptic.light();
                }
                const sub = btn.getAttribute('data-sub');
                document.querySelectorAll('#tools-segmented .segmented-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                ['remote', 'clip', 'proc', 'term', 'draw', 'speed'].forEach(id => {
                    const el = document.getElementById('sub-tool-' + id);
                    if (el) el.style.display = (id === sub ? 'block' : 'none');
                });

                if (sub === 'remote' && window.webRemoteControl) {
                    window.webRemoteControl.fetchVolume();
                }
                if (sub === 'proc') ProcessMonitorComponent.load('process-list');
                if (sub === 'draw') {
                    const inst = WhiteboardComponent.init('whiteboard');
                    if (inst) inst.resize();
                }
            });
        });

        // 大盘快捷打开遥控
        $('#btn-dash-open-remote')?.addEventListener('click', () => {
            switchView('tools');
            const remoteBtn = document.querySelector('#tools-segmented .segmented-item[data-sub="remote"]');
            if (remoteBtn) remoteBtn.click();
        });

        // 终端 / 进程 / 涂鸦
        $('#btn-terminal-run').addEventListener('click', () => WebTerminalComponent.execute('terminal-input', 'terminal-output'));
        $('#btn-proc-refresh').addEventListener('click', () => ProcessMonitorComponent.load('process-list'));
        $('#btn-draw-clear').addEventListener('click', () => WhiteboardComponent.clear('whiteboard'));
        $('#btn-draw-save').addEventListener('click', () => WhiteboardComponent.save());

        $('#btn-start-speedtest')?.addEventListener('click', runLanSpeedTest);

        // 一键清理临时存储
        const btnClean = $('#btn-clean-storage');
        if (btnClean) {
            btnClean.addEventListener('click', async () => {
                try {
                    btnClean.disabled = true;
                    btnClean.textContent = '正在清理…';
                    const res = await fetch(api('/api/tools/clean-storage'), {
                        method: 'POST',
                        headers: auth().authHeaders()
                    });
                    const d = await res.json();
                    if (d.success) {
                        const totalCleaned = (d.cleanedChunks || 0) + (d.cleanedTrash || 0);
                        LanDiskUI.toast(totalCleaned > 0 ? `已清理 ${totalCleaned} 项临时文件与回收站` : '存储空间状态良好，无多余临时文件', 'success');
                        loadDashboard();
                    } else {
                        LanDiskUI.toast(d.error || '清理失败', 'error');
                    }
                } catch (e) {
                    LanDiskUI.toast('清理遇到异常', 'error');
                } finally {
                    btnClean.disabled = false;
                    btnClean.innerHTML = `${I('trash', 14)} 一键释放空间`;
                }
            });
        }

        // 模态框关闭
        $('#image-modal-close').addEventListener('click', () => { $('#image-modal').style.display = 'none'; });
        $('#text-modal-close').addEventListener('click', () => { $('#text-modal').style.display = 'none'; });
        $('#img-prev').addEventListener('click', () => window.MediaHubInstance && MediaHubInstance.prevImage());
        $('#img-next').addEventListener('click', () => window.MediaHubInstance && MediaHubInstance.nextImage());

        // 文件操作后刷新大盘传输记录
        window.onFileActivity = () => loadHistoryFeed();
    }

    
        /* ---------- 局域网即时测速引擎 (Apple Speedometer Pro) ---------- */
    let isSpeedtesting = false;

    window.runLanSpeedTest = runLanSpeedTest;
    async function runLanSpeedTest() {
        if (isSpeedtesting) return;
        isSpeedtesting = true;

        const btnStart = $('#btn-start-speedtest');
        const numDisplay = $('#speed-display-num');
        const unitDisplay = $('#speed-display-unit');
        const stageDisplay = $('#speed-display-stage');
        const gaugeBar = $('#speed-gauge-bar');
        const pingDisplay = $('#metric-ping');
        const dlDisplay = $('#metric-download');
        const ulDisplay = $('#metric-upload');
        const ratingBadge = $('#speed-rating-badge');
        const ratingTitle = $('#speed-rating-title');
        const ratingDesc = $('#speed-rating-desc');

        if (btnStart) {
            btnStart.disabled = true;
            btnStart.classList.add('loading');
        }
        if (ratingBadge) ratingBadge.style.display = 'none';

        // 环形进度条动画辅助 (总周长 427.26)
        const circumference = 427.26;
        const setGaugeProgress = (percent) => {
            if (!gaugeBar) return;
            const p = Math.max(0, Math.min(100, percent));
            const offset = circumference - (p / 100) * circumference;
            gaugeBar.style.strokeDashoffset = offset;
        };

        setGaugeProgress(10);

        try {
            // 阶段 1：测量 Ping 延迟
            stageDisplay.textContent = '正在探测局域网延迟…';
            let pingTotal = 0;
            const pingCount = 3;
            for (let i = 0; i < pingCount; i++) {
                const t0 = performance.now();
                await fetch(api('/api/speedtest/ping?t=' + t0), { headers: auth().authHeaders(), cache: 'no-store' });
                const rtt = performance.now() - t0;
                pingTotal += rtt;
                numDisplay.textContent = Math.round(rtt);
                unitDisplay.textContent = 'ms';
                setGaugeProgress(15 + (i + 1) * 8);
                await new Promise(r => setTimeout(r, 60));
            }
            const avgPing = Math.max(1, Math.round(pingTotal / pingCount));
            pingDisplay.textContent = avgPing + ' ms';

            // 阶段 2：测量下行带宽 (下载测试)
            stageDisplay.textContent = '正在测试下行带宽 (下载)…';
            unitDisplay.textContent = 'MB/s';
            setGaugeProgress(45);
            const dlT0 = performance.now();
            const dlRes = await fetch(api('/api/speedtest/download?size=6'), { headers: auth().authHeaders(), cache: 'no-store' });
            const dlBuf = await dlRes.arrayBuffer();
            const dlDurationSec = Math.max(0.01, (performance.now() - dlT0) / 1000);
            const finalDlMBs = (dlBuf.byteLength / 1024 / 1024) / dlDurationSec;
            numDisplay.textContent = finalDlMBs.toFixed(1);
            dlDisplay.textContent = finalDlMBs.toFixed(1) + ' MB/s';
            setGaugeProgress(75);

            // 阶段 3：测量上行带宽 (上传测试)
            stageDisplay.textContent = '正在测试上行带宽 (上传)…';
            const ulBytes = 4 * 1024 * 1024;
            const ulBuffer = new Uint8Array(ulBytes);
            const ulT0 = performance.now();
            const ulRes = await fetch('/api/speedtest/upload', {
                method: 'POST',
                headers: auth().authHeaders({ 'Content-Type': 'application/octet-stream' }),
                body: ulBuffer
            });
            const ulData = await ulRes.json().catch(() => ({}));
            const ulDurationSec = Math.max(0.01, (performance.now() - ulT0) / 1000);
            const finalUlMBs = ulData.speedMBs || ((ulBytes / 1024 / 1024) / ulDurationSec);
            ulDisplay.textContent = finalUlMBs.toFixed(1) + ' MB/s';
            setGaugeProgress(100);

            // 测速完成与展示
            stageDisplay.textContent = '测速完成';
            numDisplay.textContent = finalDlMBs.toFixed(1);
            unitDisplay.textContent = 'MB/s';

            if (ratingBadge) {
                ratingBadge.style.display = 'flex';
                if (finalDlMBs > 35) {
                    if (ratingTitle) ratingTitle.textContent = '局域网极佳 · 千兆高速直连';
                    if (ratingDesc) ratingDesc.textContent = '支持 4K HDR 零缓冲瞬时点播与超大文件秒级同步';
                } else if (finalDlMBs > 12) {
                    if (ratingTitle) ratingTitle.textContent = '局域网良好 · 百兆高速连接';
                    if (ratingDesc) ratingDesc.textContent = '支持 1080P 超清流畅观影与日常流畅传输';
                } else {
                    if (ratingTitle) ratingTitle.textContent = '局域网稳定 · 标准无线连接';
                    if (ratingDesc) ratingDesc.textContent = '建议靠近 Wi-Fi 路由器以解锁更高千兆吞吐带宽';
                }
            }
            LanDiskUI.toast('局域网测速完成', 'success');
        } catch (err) {
            stageDisplay.textContent = '测速遇到异常';
            LanDiskUI.toast('测速失败，请检查网络连接', 'error');
            setGaugeProgress(0);
        } finally {
            isSpeedtesting = false;
            if (btnStart) {
                btnStart.disabled = false;
                btnStart.classList.remove('loading');
            }
        }
    }

    /* ---------- 移动端手势（下拉刷新与屏幕边缘轻扫切页） ---------- */
    function setupMobileGestures() {
        // 1. 挂载 iOS 弹性阻尼下拉刷新
        if (LanDiskUI && LanDiskUI.PullToRefresh) {
            new LanDiskUI.PullToRefresh('#view-dashboard', async () => {
                await loadDashboard();
                await loadHistoryFeed();
                LanDiskUI.toast('大盘数据已更新', 'success');
            });
            new LanDiskUI.PullToRefresh('#view-files', async () => {
                const inst = FileExplorerComponent.getInstance();
                if (inst) await inst.refresh();
                LanDiskUI.toast('文件列表已刷新', 'success');
            });
            new LanDiskUI.PullToRefresh('#view-media', async () => {
                if (typeof MediaTheaterComponent !== 'undefined' && MediaTheaterComponent.refresh) {
                    await MediaTheaterComponent.refresh();
                }
                LanDiskUI.toast('影音资料库已刷新', 'success');
            });
            new LanDiskUI.PullToRefresh('#view-tools', async () => {
                if (viewInit.tools) {
                    ProcessMonitorComponent.load('process-list');
                    if (window.webRemoteControl) window.webRemoteControl.fetchVolume();
                }
                LanDiskUI.toast('工具箱状态已同步', 'success');
            });
        }

        // 2. 屏幕左右边缘轻扫切换 Tab
        const TABS = ['dashboard', 'files', 'media', 'chat', 'tools'];
        let startX = 0;
        let startY = 0;
        let isEdgeTouch = false;

        window.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            const x = touch.clientX;
            const screenW = window.innerWidth;

            // 仅在屏幕左/右边缘 32px 以内起手
            const isLeftEdge = x < 32;
            const isRightEdge = x > (screenW - 32);
            if (!isLeftEdge && !isRightEdge) {
                isEdgeTouch = false;
                return;
            }

            // 智能防误触冲突检测：白板、屏幕镜像、播放器、全屏 Modal 排除
            const target = e.target;
            if (target && target.closest('#whiteboard, #remote-screen-viewport, #remote-landscape-modal, #view-player, .apple-player-fullscreen, canvas')) {
                isEdgeTouch = false;
                return;
            }

            startX = x;
            startY = touch.clientY;
            isEdgeTouch = true;
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
            if (!isEdgeTouch || e.changedTouches.length !== 1) return;
            isEdgeTouch = false;

            const touch = e.changedTouches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;

            // 水平滑动距离 > 60px 且 垂直偏移 < 45px
            if (Math.abs(dx) > 60 && Math.abs(dy) < 45) {
                const activeDock = document.querySelector('.dock-item.active');
                const currentView = activeDock ? activeDock.getAttribute('data-view') : 'dashboard';
                const currentIdx = TABS.indexOf(currentView);
                if (currentIdx === -1) return;

                if (dx > 0 && startX < 32 && currentIdx > 0) {
                    switchView(TABS[currentIdx - 1]);
                } else if (dx < 0 && startX > (window.innerWidth - 32) && currentIdx < TABS.length - 1) {
                    switchView(TABS[currentIdx + 1]);
                }
            }
        }, { passive: true });
    }

    /* ---------- 局域网高速雷达与连接器 (Mobile & Web Radar Engine) ---------- */
    function initRadar() {
        const modal = $('#radar-modal');
        const btnOpen = $('#btn-radar-modal');
        const btnClose = $('#btn-radar-close');
        const btnScan = $('#btn-start-radar-scan');
        const btnManual = $('#btn-manual-connect');
        const ipInput = $('#manual-server-ip');
        const listEl = $('#radar-device-list');
        const labelEl = $('#current-connected-label');
        const btnLabel = $('#radar-btn-label');
        const statusEl = $('#radar-scan-status');
        const subnetSelect = $('#radar-subnet-select');

        const isAppContainer = typeof window !== 'undefined' && (
            window.Capacitor ||
            window.location.protocol === 'file:' ||
            (window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '3001' && window.location.port !== '3002' && window.location.port !== '3003' && window.location.port !== '3999')
        );

        let savedServer = (auth() && auth().getServerUrl) ? auth().getServerUrl() : (localStorage.getItem('landisk_custom_server') || '');
        if (savedServer) {
            window.currentServerUrl = savedServer;
            const displayHost = savedServer.replace(/^https?:\/\//, '');
            if (labelEl) labelEl.textContent = `当前已绑定: ${displayHost}`;
            if (btnLabel) btnLabel.textContent = displayHost.length > 18 ? displayHost.substring(0, 16) + '…' : displayHost;
        } else if (isAppContainer) {
            if (labelEl) labelEl.textContent = '未连接电脑 (请扫描雷达或输入 IP)';
            if (btnLabel) btnLabel.textContent = '雷达连电脑';
        }

        if (!modal) return;

        btnOpen && btnOpen.addEventListener('click', () => {
            modal.style.display = 'flex';
            if (ipInput && savedServer) ipInput.value = savedServer.replace(/^https?:\/\//, '');
            hydrateIcons();
        });

        btnClose && btnClose.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        const connectToServer = async (url) => {
            let fullUrl = url.trim();
            if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'http://' + fullUrl;
            fullUrl = fullUrl.replace(/\/$/, '');

            if (btnManual) {
                btnManual.disabled = true;
                btnManual.textContent = '连接中…';
            }
            if (statusEl) statusEl.textContent = `正在握手连接 ${fullUrl}…`;

            let reachable = false;
            let requiresPin = false;
            let serverInfo = null;

            try {
                // 1. 优先探测免鉴权轻量发现接口
                const pingRes = await fetch(`${fullUrl}/api/ping`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(2500)
                });
                if (pingRes.ok) {
                    serverInfo = await pingRes.json().catch(() => ({}));
                    reachable = true;
                    requiresPin = !!serverInfo.requiresPin;
                }
            } catch (e) {}

            if (!reachable) {
                // 2. 降级探测 /api/verify（用 GET：写方法在免密模式下会被服务端来源防护视为跨站写而拒绝）
                try {
                    const vRes = await fetch(`${fullUrl}/api/verify`, {
                        method: 'GET',
                        headers: (auth() ? auth().authHeaders() : {}),
                        signal: AbortSignal.timeout(2500)
                    });
                    if (vRes.ok || vRes.status === 401) {
                        reachable = true;
                        requiresPin = (vRes.status === 401);
                    }
                } catch (e2) {}
            }

            if (btnManual) {
                btnManual.disabled = false;
                btnManual.textContent = '直连';
            }

            if (!reachable) {
                if (statusEl) statusEl.textContent = `❌ 无法连通 ${fullUrl}`;
                LanDiskUI.toast(`连接失败：无法连通 ${fullUrl}，请检查 IP 端口与 Wi-Fi`, 'error', 4500);
                return;
            }

            // 保存服务端配置
            if (auth() && auth().setServerUrl) {
                auth().setServerUrl(fullUrl);
            } else {
                localStorage.setItem('landisk_custom_server', fullUrl);
                window.currentServerUrl = fullUrl;
            }

            const displayHost = fullUrl.replace(/^https?:\/\//, '');
            if (labelEl) labelEl.textContent = `当前已绑定: ${displayHost}`;
            if (btnLabel) btnLabel.textContent = displayHost.length > 18 ? displayHost.substring(0, 16) + '…' : displayHost;

            modal.style.display = 'none';

            if (!requiresPin) {
                LanDiskUI.toast(`已成功直连电脑 (${displayHost})！`, 'success');
                enterApp();
            } else {
                // 检查已存 PIN 是否可以直接通过
                const savedPin = (auth() && auth().getPin) ? auth().getPin() : (localStorage.getItem('lan_disk_pin') || '');
                if (savedPin) {
                    try {
                        const testAuth = await fetch(`${fullUrl}/api/verify`, {
                            method: 'POST',
                            headers: { 'x-pin': savedPin, 'x-qr-token': (auth() ? auth().getToken() : '') },
                            signal: AbortSignal.timeout(2000)
                        });
                        if (testAuth.ok) {
                            LanDiskUI.toast(`已通过已存密码连入 (${displayHost})`, 'success');
                            enterApp();
                            return;
                        }
                    } catch (e) {}
                }
                $('#login-overlay').style.display = 'flex';
                $('#pin-input').value = '';
                $('#pin-input').focus();
                LanDiskUI.toast(`已连通电脑，请输入电脑端设置的 PIN 密码`, 'info', 4000);
            }
        };

        btnManual && btnManual.addEventListener('click', () => {
            const val = ipInput ? ipInput.value.trim() : '';
            if (!val) return LanDiskUI.toast('请输入电脑 IP 地址 (如 192.168.0.104:3000)', 'error');
            connectToServer(val);
        });

        async function triggerRadarScan(silent = false) {
            if (!silent && LanDiskUI.Haptic) LanDiskUI.Haptic.light();
            if (statusEl) statusEl.textContent = '⚡ 正在全网并发探测局域网电脑……';
            listEl.innerHTML = `
                <div class="subtle" style="text-align:center; padding:18px 0; font-size:12px; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:var(--apple-system-blue); animation:pulseDot 1.2s infinite ease-in-out;"></span>
                    雷达正在高速扫描局域网网段与端口……
                </div>
            `;

            const foundMap = new Map(); // key: deviceKey (基于唯一 hostname 或 IP 去重)
            const ports = [3000, 3001, 3002, 3003, 3999];

            const hostPool = new Set();
            const isLocalEnv = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

            if (savedServer) {
                try {
                    const h = new URL(savedServer).hostname;
                    if (h && h !== '127.0.0.1' && h !== 'localhost') hostPool.add(h);
                } catch (e) {}
            }
            if (ipInput && ipInput.value.trim()) {
                try {
                    const raw = ipInput.value.trim();
                    const parsed = raw.includes(':') ? raw.split(':')[0] : raw;
                    const cleanH = parsed.replace(/^https?:\/\//, '');
                    if (cleanH && cleanH !== '127.0.0.1' && cleanH !== 'localhost') hostPool.add(cleanH);
                } catch (e) {}
            }
            if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                hostPool.add(window.location.hostname);
            }

            const selectedSubnet = subnetSelect ? subnetSelect.value : 'auto';
            if (selectedSubnet === 'auto') {
                // 优先根据当前访问 IP 推导所在主网段
                const curIp = window.location.hostname || '';
                const m = curIp.match(/^(\d+\.\d+\.\d+)\.\d+$/);
                const curSub = m ? m[1] : null;

                const candidateSubnets = curSub ? [curSub, '192.168.0', '192.168.1', '192.168.31', '192.168.50', '192.168.2', '10.0.0', '172.20.10'] : ['192.168.0', '192.168.1', '192.168.31', '192.168.50', '192.168.2', '10.0.0', '172.20.10'];
                const subnetsToScan = Array.from(new Set(candidateSubnets));

                const priorityHostIds = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 30, 50, 88, 120, 150, 188, 200, 1];
                for (const sub of subnetsToScan) {
                    for (const hid of priorityHostIds) {
                        hostPool.add(`${sub}.${hid}`);
                    }
                }
            } else {
                // 指定特定子网时，全量探测该子网 1~254
                for (let hid = 1; hid <= 254; hid++) {
                    hostPool.add(`${selectedSubnet}.${hid}`);
                }
            }

            // 仅当在本地浏览器运行且尚未发现局域网 IP 时作为备选
            if (isLocalEnv) {
                hostPool.add('127.0.0.1');
            }

            const hostList = Array.from(hostPool);
            const batchSize = 40;

            function renderFoundCards() {
                if (foundMap.size === 0) return;
                listEl.innerHTML = Array.from(foundMap.values()).map(item => `
                    <div class="row" style="justify-content:space-between; align-items:center; padding:11px 14px; background:var(--apple-bg-card); border:1px solid var(--apple-border); border-radius:14px; cursor:pointer; box-shadow:var(--shadow-1); transition:all 0.2s;" data-connect-url="${item.url}">
                        <div class="row" style="gap:10px; align-items:center; min-width:0; flex:1;">
                            <div style="width:34px; height:34px; border-radius:10px; background:rgba(52,199,89,0.15); color:var(--apple-system-green); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                <span data-icon="monitor" data-icon-size="18"></span>
                            </div>
                            <div style="min-width:0; flex:1;">
                                <div style="font-size:13.5px; font-weight:600; letter-spacing:-0.01em; display:flex; align-items:center; gap:6px;">
                                    <span class="ellipsis">${escapeHtml(item.name)}</span>
                                    ${item.requiresPin ? '<span style="font-size:10px; padding:1px 5px; border-radius:4px; background:rgba(255,159,10,0.15); color:var(--apple-system-orange); white-space:nowrap;">需密码</span>' : '<span style="font-size:10px; padding:1px 5px; border-radius:4px; background:rgba(52,199,89,0.15); color:var(--apple-system-green); white-space:nowrap;">免密直连</span>'}
                                </div>
                                <div style="font-size:11.5px; color:var(--apple-system-blue); font-family:monospace;" class="ellipsis">${escapeHtml(item.url)}</div>
                            </div>
                        </div>
                        <button class="apple-btn apple-btn-primary" style="padding:6px 14px; font-size:12px; border-radius:10px; font-weight:600; flex-shrink:0; margin-left:8px;">一键连接</button>
                    </div>
                `).join('');

                hydrateIcons();

                listEl.querySelectorAll('[data-connect-url]').forEach(card => {
                    card.addEventListener('click', () => {
                        connectToServer(card.getAttribute('data-connect-url'));
                    });
                });
            }

            async function probeUrl(targetUrl) {
                let parsedHost = '';
                try { parsedHost = new URL(targetUrl).hostname; } catch (e) {}
                const isTargetLoopback = (parsedHost === '127.0.0.1' || parsedHost === 'localhost');

                try {
                    const r = await fetch(`${targetUrl}/api/ping`, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(800)
                    });
                    if (r.ok) {
                        const data = await r.json().catch(() => ({}));
                        const osName = data.os || '电脑';
                        const hostName = data.hostname || parsedHost || '猫步互联电脑';
                        const displayName = `💻 ${hostName} (${osName})`;

                        // 智能设备去重键：同一主机名 (hostname) 视为同一台电脑
                        const deviceKey = data.hostname ? `device_${data.hostname}` : `host_${parsedHost}`;

                        const existing = foundMap.get(deviceKey);
                        // 若已存在但之前是 127.0.0.1 回环地址，当前发现真实局域网 IP 则覆盖为局域网 IP
                        if (!existing || (existing.isLoopback && !isTargetLoopback)) {
                            foundMap.set(deviceKey, {
                                url: targetUrl,
                                name: displayName,
                                requiresPin: !!data.requiresPin,
                                isLoopback: isTargetLoopback,
                                hostname: data.hostname
                            });
                            renderFoundCards();
                            if (statusEl) statusEl.textContent = `🎯 已发现 ${foundMap.size} 台在线电脑！`;
                        }
                        return;
                    }
                } catch (e) {}

                try {
                    const r2 = await fetch(`${targetUrl}/api/verify`, {
                        method: 'POST',
                        signal: AbortSignal.timeout(600)
                    });
                    if (r2.ok || r2.status === 401) {
                        const deviceKey = `host_${parsedHost}`;
                        const existing = foundMap.get(deviceKey);
                        if (!existing || (existing.isLoopback && !isTargetLoopback)) {
                            foundMap.set(deviceKey, {
                                url: targetUrl,
                                name: `💻 猫步互联电脑 (${targetUrl.replace(/^https?:\/\//, '')})`,
                                requiresPin: (r2.status === 401),
                                isLoopback: isTargetLoopback
                            });
                            renderFoundCards();
                            if (statusEl) statusEl.textContent = `🎯 已发现 ${foundMap.size} 台在线电脑！`;
                        }
                    }
                } catch (e2) {}
            }

            const tasks = [];
            for (const h of hostList) {
                for (const p of ports) {
                    tasks.push(`http://${h}:${p}`);
                }
            }

            for (let i = 0; i < tasks.length; i += batchSize) {
                const chunk = tasks.slice(i, i + batchSize);
                await Promise.all(chunk.map(url => probeUrl(url)));
                if (foundMap.size > 0 && selectedSubnet === 'auto' && i > 120) break; // 智能模式已发现设备则提早收尾
            }

            if (foundMap.size === 0) {
                if (statusEl) statusEl.textContent = '未扫描到其他在线电脑';
                listEl.innerHTML = `
                    <div class="subtle" style="text-align:center; padding:16px 8px; font-size:12px; line-height:1.6;">
                        未探测到在线电脑。请确保电脑端已打开「猫步互联 Pro」，<br>在上方直接输入电脑显示的 IP 进行直连。
                    </div>
                `;
            } else {
                if (statusEl) statusEl.textContent = `🎉 扫描完成，共发现 ${foundMap.size} 台在线电脑`;
            }
        }

        btnScan && btnScan.addEventListener('click', () => triggerRadarScan(false));
        if (subnetSelect) {
            subnetSelect.addEventListener('change', () => triggerRadarScan(false));
        }

        window.triggerAppRadar = () => {
            modal.style.display = 'flex';
            triggerRadarScan(true);
        };
    }

    /* ---------- 启动 ---------- */
    async function init() {
        hydrateIcons();
        initTheme();
        initRadar();
        bindFilesView();
        bindClipboard();
        bindMisc();
        setupMobileGestures();

        window.MediaHubInstance = new MediaHubComponent({
            imageModal: '#image-modal',
            imageViewer: '#image-viewer',
            textModal: '#text-modal',
            textViewer: '#text-viewer',
            textTitle: '#text-title'
        });

        const isAppContainer = typeof window !== 'undefined' && (
            window.Capacitor ||
            window.location.protocol === 'file:' ||
            (window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '3001' && window.location.port !== '3002' && window.location.port !== '3003' && window.location.port !== '3999')
        );

        const currentServer = (auth() && auth().getServerUrl) ? auth().getServerUrl() : (localStorage.getItem('landisk_custom_server') || '');

        // 在独立移动端 App 且尚未绑定任何服务器 IP 时，直接弹出局域网雷达引导
        if (isAppContainer && !currentServer) {
            $('#login-overlay').style.display = 'none';
            if (window.triggerAppRadar) {
                window.triggerAppRadar();
            }
            return;
        }

        // 静默校验登录态（扫码 token / 已存 PIN / 免密）
        try {
            const res = await fetch(api('/api/verify'), {
                method: 'POST',
                headers: auth().authHeaders(),
                signal: AbortSignal.timeout(3000)
            });
            if (res.ok) {
                enterApp();
            } else {
                $('#login-overlay').style.display = 'flex';
                $('#pin-input').focus();
            }
        } catch (e) {
            if (isAppContainer && !currentServer) {
                if (window.triggerAppRadar) window.triggerAppRadar();
            } else {
                $('#login-overlay').style.display = 'flex';
            }
        }

        // PWA 横幅
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !isAppContainer) {
            LanDiskUI.toast('添加到主屏幕，获得原生 App 体验', 'info', 4000);
        }

        // Service Worker：离线与视频秒播缓存
        if ('serviceWorker' in navigator && !isAppContainer) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
