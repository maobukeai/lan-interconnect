/**
 * 猫步互联 Pro · Web 端应用逻辑
 * 登录 / 悬浮 Dock 导航 / Bento 大盘 sparkline / 影音剧院 / 剪贴板互通 / 组件接线
 */

(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const I = (name, size) => window.Icons ? Icons.render(name, size) : '';
    const auth = () => window.LanDiskAuth || null;
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
            const res = await fetch('/api/verify', { method: 'POST', headers: { 'x-pin': pin, 'x-qr-token': (auth() && auth().getToken()) || '' } });
            if (res.status === 429) { LanDiskUI.toast('尝试过于频繁，请稍后再试', 'error'); return; }
            if (res.ok) {
                try { localStorage.setItem('lan_disk_pin', pin); } catch (e) {}
                enterApp();
            } else {
                $('#login-error').style.display = 'block';
                setTimeout(() => { $('#login-error').style.display = 'none'; }, 2500);
            }
        } catch (e) {
            LanDiskUI.toast('连接服务器失败', 'error');
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
                const res = await fetch('/api/remote/volume', {
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
                    const res = await fetch('/api/remote/power', {
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
                fetch('/api/sys-info', { headers: auth().authHeaders() }),
                fetch('/api/devices', { headers: auth().authHeaders() })
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
                const count = (d.devices && d.devices.length) ? d.devices.length : 1;
                $('#dash-device-count').textContent = count;
                $('#dash-device-sub').textContent = count > 1 ? `${count} 台设备在线协同中` : '仅本机在线，等待手机接入';

                const fmtSpeed = b => b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB/s' : (b / 1024).toFixed(1) + ' KB/s';
                const tx = d.stats ? d.stats.txSpeed : 0;
                const rx = d.stats ? d.stats.rxSpeed : 0;
                $('#dash-tx-speed').textContent = fmtSpeed(tx);
                $('#dash-rx-speed').textContent = fmtSpeed(rx);
                sparkNet.push(tx + rx);
                dashTxBytes.tx = d.stats ? d.stats.txBytes : 0;
                dashTxBytes.rx = d.stats ? d.stats.rxBytes : 0;
                $('#dash-tx-total').textContent = `发送 ${fmtBytes(dashTxBytes.tx)} · 接收 ${fmtBytes(dashTxBytes.rx)}`;

                const list = $('#dash-devices-list');
                if (d.devices && d.devices.length) {
                    list.innerHTML = d.devices.map(dev => `
                        <div class="device-node-card">
                            <div style="color:var(--apple-system-blue);"><span data-icon="smartphone"></span></div>
                            <div class="device-node-meta">
                                <div class="device-node-name ellipsis">${escapeHtml(dev.alias || dev.ip)}</div>
                                <div class="device-node-sub ellipsis">${escapeHtml((dev.userAgent || '').slice(0, 30) || dev.ip)}</div>
                            </div>
                            <span class="status-dot on"></span>
                        </div>
                    `).join('');
                } else {
                    list.innerHTML = `
                        <div class="devices-empty-guide">
                            <div class="devices-empty-icon"><span data-icon="devices"></span></div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:600; font-size:12px; color:var(--apple-text-main);">等待其他设备加入局域网</div>
                                <div class="subtle" style="font-size:11px; margin-top:2px;">手机、平板或电脑打开浏览器访问即可极速互联</div>
                            </div>
                        </div>
                    `;
                }
                if (window.Icons) {
                    list.querySelectorAll('[data-icon]').forEach(iEl => {
                        iEl.innerHTML = Icons.render(iEl.getAttribute('data-icon'), 16);
                    });
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
                    const res = await fetch('/api/tools/clean-storage', {
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
                await fetch('/api/speedtest/ping?t=' + t0, { headers: auth().authHeaders(), cache: 'no-store' });
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
            const dlRes = await fetch('/api/speedtest/download?size=6', { headers: auth().authHeaders(), cache: 'no-store' });
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

    /* ---------- 启动 ---------- */
    async function init() {
        hydrateIcons();
        initTheme();
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

        // 静默校验登录态（扫码 token / 已存 PIN）
        try {
            const res = await fetch('/api/verify', { method: 'POST', headers: auth().authHeaders() });
            if (res.ok) {
                enterApp();
            } else {
                $('#login-overlay').style.display = 'flex';
                $('#pin-input').focus();
            }
        } catch (e) {
            $('#login-overlay').style.display = 'flex';
        }

        // PWA 横幅
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) {
            LanDiskUI.toast('添加到主屏幕，获得原生 App 体验', 'info', 4000);
        }

        // Service Worker：离线与视频秒播缓存
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
