/**
 * 猫步互联 · 影音剧院组件 (MediaTheater)
 * 目录选择 → 限深扫描媒体 → 海报墙（视频懒生成缩略图）→ AppleMediaPlayer 播放。
 * Web 端与桌面端共用。
 */

(function (global) {
    'use strict';

    const I = (name, size) => (global.Icons ? global.Icons.render(name, size) : '');
    const MEDIA_RE = /\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i;
    const AUDIO_RE = /\.(mp3|wav|flac|aac|m4a)$/i;
    const escapeHtml = global.escapeHtml || (s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

    class MediaTheater {
        constructor(config = {}) {
            this.grid = typeof config.grid === 'string' ? document.querySelector(config.grid) : config.grid;
            this.folderLabel = typeof config.folderLabel === 'string' ? document.querySelector(config.folderLabel) : config.folderLabel;
            this.chipRow = typeof config.chipRow === 'string' ? document.querySelector(config.chipRow) : (document.getElementById('media-folders-chip-row') || config.chipRow);
            this.getApiUrl = config.getApiUrl || ((p) => {
                if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
                    const baseUrl = window.currentServerUrl || 'http://localhost:3000';
                    return baseUrl.replace(/\/$/, '') + p;
                }
                return p;
            });
            this.folders = [];
            this.items = [];
            this.isScanning = false;
        }

        _authHeaders(extra) {
            return (global.LanDiskAuth && global.LanDiskAuth.authHeaders) ? global.LanDiskAuth.authHeaders(extra) : (extra || {});
        }

        _authQuery() {
            return (global.LanDiskAuth && global.LanDiskAuth.authQuery) ? global.LanDiskAuth.authQuery() : '';
        }

        // 从本地存储还原已保存的多媒体目录
        restoreFolders() {
            try {
                let savedList = null;
                const rawFolders = localStorage.getItem('landisk_media_folders');
                if (rawFolders) {
                    try { savedList = JSON.parse(rawFolders); } catch (e) {}
                }
                if (!Array.isArray(savedList) || !savedList.length) {
                    const oldSingle = localStorage.getItem('landisk_media_folder');
                    if (oldSingle && typeof oldSingle === 'string' && oldSingle.trim()) {
                        savedList = [oldSingle.trim()];
                    }
                }

                if (Array.isArray(savedList)) {
                    this.folders = Array.from(new Set(savedList.filter(p => p && typeof p === 'string' && p.trim())));
                } else {
                    this.folders = [];
                }
            } catch (e) {
                this.folders = [];
            }
            this.renderFolderChips();
        }

        _saveFolders() {
            try {
                localStorage.setItem('landisk_media_folders', JSON.stringify(this.folders));
                localStorage.setItem('landisk_media_folder', this.folders[0] || '');
            } catch (e) {}
        }

        // 渲染已添加的媒体源目录胶囊标签栏
        renderFolderChips() {
            const chipRowEl = this.chipRow || document.getElementById('media-folders-chip-row');
            if (this.folderLabel) {
                this.folderLabel.textContent = this.folders.length ? `已绑定 ${this.folders.length} 个媒体源目录` : '未选择目录';
            }

            if (!chipRowEl) return;

            if (!this.folders.length) {
                chipRowEl.innerHTML = `
                    <div class="media-folder-empty-tip">
                        ${I('folder', 14)} 暂未添加媒体目录，点击上方“+ 添加媒体目录”将电影/音乐文件夹加入资料库
                    </div>
                `;
                return;
            }

            const html = this.folders.map((fPath, idx) => {
                const normalized = fPath.replace(/\\/g, '/');
                const parts = normalized.split('/').filter(Boolean);
                const dirName = parts.length ? parts[parts.length - 1] : fPath;
                return `
                    <div class="media-folder-chip" title="${escapeHtml(fPath)}">
                        ${I('folder', 14)}
                        <span class="chip-name">${escapeHtml(dirName)}</span>
                        <button class="chip-remove" data-del-idx="${idx}" title="移除此目录">×</button>
                    </div>
                `;
            }).join('');

            chipRowEl.innerHTML = html;

            chipRowEl.querySelectorAll('.chip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const delIdx = parseInt(btn.getAttribute('data-del-idx'), 10);
                    this.removeFolder(delIdx);
                });
            });
        }

        // 追加新目录并自动保存与扫描
        addFolder(folderPath) {
            if (!folderPath || typeof folderPath !== 'string') return;
            const cleaned = folderPath.trim();
            if (!cleaned) return;

            const ui = global.LanDiskUI;
            if (this.folders.includes(cleaned)) {
                if (ui) ui.toast('该目录已在媒体资料库中', 'info');
                return;
            }

            this.folders.push(cleaned);
            this._saveFolders();
            this.renderFolderChips();
            if (ui) ui.toast(`已成功追加目录: ${cleaned}`, 'success');
            this.scan();
        }

        // 移除指定目录
        removeFolder(target) {
            const ui = global.LanDiskUI;
            if (typeof target === 'number') {
                if (target >= 0 && target < this.folders.length) {
                    const removed = this.folders.splice(target, 1)[0];
                    this._saveFolders();
                    this.renderFolderChips();
                    if (ui) ui.toast(`已移除媒体目录: ${removed}`, 'info');
                }
            } else if (typeof target === 'string') {
                this.folders = this.folders.filter(f => f !== target);
                this._saveFolders();
                this.renderFolderChips();
                if (ui) ui.toast('已移除媒体目录', 'info');
            }

            if (this.folders.length > 0) {
                this.scan();
            } else {
                this.items = [];
                if (this.grid) {
                    this.grid.innerHTML = `
                        <div class="empty-state" style="grid-column:1/-1">
                            <span data-icon="playCircle" data-icon-size="34"></span>
                            已清空所有媒体源，请点击上方“+ 添加媒体目录”重新添加
                        </div>
                    `;
                }
            }
        }

        // 目录选择入口（支持原生桌面与 Web 模态浏览）
        async pickFolder() {
            const ui = global.LanDiskUI;

            // 桌面端调用原生 OS 文件夹选择窗口
            if (global.IPC && typeof global.IPC.selectFolder === 'function') {
                try {
                    const chosen = await global.IPC.selectFolder();
                    if (chosen && typeof chosen === 'string') {
                        this.addFolder(chosen);
                        return;
                    }
                } catch (err) {
                    console.warn('Native folder picker cancelled or failed:', err);
                }
            }

            // Web 端或备用交互式目录选择弹窗
            const modal = ui.openModal(`
                <div class="modal-title">添加媒体目录到资料库</div>
                <div class="modal-message" data-mf="path">加载中…</div>
                <div class="col" data-mf="list" style="gap:4px; margin-bottom:16px; max-height:46vh; overflow-y:auto"></div>
                <div class="modal-actions">
                    <button class="apple-btn apple-btn-glass" data-act="cancel">取消</button>
                    <button class="apple-btn apple-btn-primary" data-act="pick">${I('check', 15)} 选定并加入资料库</button>
                </div>
            `, { width: 440 });

            let currentPath = '';
            const listEl = modal.el.querySelector('[data-mf="list"]');
            const pathEl = modal.el.querySelector('[data-mf="path"]');

            const renderList = async (p) => {
                try {
                    if (!p) {
                        const res = await fetch(this.getApiUrl('/api/drives'), { headers: this._authHeaders() });
                        if (!res.ok) throw new Error();
                        const drives = await res.json();
                        pathEl.textContent = '设备根目录（盘符）';
                        currentPath = '';
                        listEl.innerHTML = drives.map(dr => `
                            <button class="ctx-menu-item" data-p="${escapeHtml(dr.path)}">${I('drive', 16)}<span>${escapeHtml(dr.name)}</span></button>
                        `).join('');
                    } else {
                        const res = await fetch(this.getApiUrl(`/api/files?path=${encodeURIComponent(p)}`), { headers: this._authHeaders() });
                        if (!res.ok) throw new Error();
                        const data = await res.json();
                        currentPath = data.currentPath;
                        pathEl.textContent = currentPath;
                        const dirs = (data.files || []).filter(f => f.isDirectory);
                        listEl.innerHTML = (dirs.length ? dirs.map(d => `
                            <button class="ctx-menu-item" data-p="${escapeHtml(d.path)}">${I('folder', 16)}<span>${escapeHtml(d.name)}</span></button>
                        `).join('') : '<div class="subtle" style="padding:8px; font-size:12.5px">此目录下没有更深子文件夹</div>');
                    }
                    listEl.querySelectorAll('[data-p]').forEach(btn => {
                        btn.addEventListener('click', () => renderList(btn.getAttribute('data-p')));
                    });
                } catch (e) {
                    listEl.innerHTML = '<div class="empty-state">加载失败，请确认服务已正常启动</div>';
                }
            };

            renderList(this.folders[this.folders.length - 1] || '');

            modal.el.querySelector('[data-act="cancel"]').addEventListener('click', () => modal.close());
            modal.el.querySelector('[data-act="pick"]').addEventListener('click', () => {
                if (!currentPath) {
                    if (ui) ui.toast('请先点击进入一个有效的文件夹目录', 'info');
                    return;
                }
                modal.close();
                this.addFolder(currentPath);
            });
        }

        // 聚合扫描所有已添加的媒体目录（多源深度扫描与去重）
        async scan() {
            const ui = global.LanDiskUI;
            if (!this.folders.length) {
                this.pickFolder();
                return;
            }

            if (this.isScanning) return;
            this.isScanning = true;

            if (this.grid) {
                this.grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${I('playCircle', 34)}正在扫描 ${this.folders.length} 个媒体目录…</div>`;
            }
            if (ui) ui.toast(`正在聚合扫描 ${this.folders.length} 个媒体目录…`, 'info');

            const found = [];
            const foundPathSet = new Set();
            const visitedDirs = new Set();

            const walk = async (dir, depth) => {
                if (depth > 3 || found.length >= 600 || visitedDirs.has(dir)) return;
                visitedDirs.add(dir);
                try {
                    const res = await fetch(this.getApiUrl(`/api/files?path=${encodeURIComponent(dir)}`), { headers: this._authHeaders() });
                    if (!res.ok) return;
                    const data = await res.json();
                    for (const f of (data.files || [])) {
                        if (found.length >= 600) break;
                        if (f.isDirectory) {
                            if (!/^[.#]/.test(f.name)) await walk(f.path, depth + 1);
                        } else if (MEDIA_RE.test(f.name)) {
                            if (!foundPathSet.has(f.path)) {
                                foundPathSet.add(f.path);
                                found.push(f);
                            }
                        }
                    }
                } catch (e) {}
            };

            for (const fld of this.folders) {
                await walk(fld, 0);
            }

            this.items = found;
            this.isScanning = false;

            if (!this.grid) return;

            if (!found.length) {
                this.grid.innerHTML = `
                    <div class="empty-state" style="grid-column:1/-1">
                        ${I('playCircle', 34)}
                        已绑定的 ${this.folders.length} 个目录中暂未发现视频/音乐文件
                    </div>
                `;
                return;
            }

            if (ui) ui.toast(`扫描完成，共汇集 ${found.length} 个媒体文件`, 'success');

            // 获取断点续播历史并合并本地记录
            let progressMap = {};
            try {
                let authQ = '';
                if (window.LanDiskAuth && typeof window.LanDiskAuth.authQuery === 'function') {
                    const q = window.LanDiskAuth.authQuery();
                    if (q) authQ = q.replace(/^\?/, '&');
                }
                const res = await fetch(this.getApiUrl('/api/media/progress') + authQ, { headers: this._authHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.progressMap) {
                        progressMap = data.progressMap;
                    }
                }
            } catch (e) {}

            try {
                const raw = localStorage.getItem('landisk_player_history');
                if (raw) {
                    const localHistory = JSON.parse(raw);
                    for (const p in localHistory) {
                        if (!progressMap[p] && localHistory[p].percentage > 0) {
                            progressMap[p] = { percentage: localHistory[p].percentage };
                        }
                    }
                }
            } catch (e) {}

            this.grid.innerHTML = found.map((f, i) => {
                const isAudio = AUDIO_RE.test(f.name);
                const prog = progressMap[f.path];
                const percentage = prog ? (prog.percentage || 0) : 0;

                return `
                    <div class="poster-card" data-idx="${i}" title="${escapeHtml(f.name)}">
                        <span data-ph="1">${I(isAudio ? 'music' : 'video', 30)}</span>
                        <img alt="" style="display:none" data-thumb="1" data-path="${escapeHtml(f.path)}">
                        <span class="poster-badge">${isAudio ? I('music', 11) + '音频' : I('video', 11) + '视频'}</span>
                        ${percentage > 0 ? `<span class="poster-watched-badge">已看 ${percentage}%</span>` : ''}
                        <span class="poster-play">${I('playCircle', 34)}</span>
                        <span class="poster-name">${escapeHtml(f.name)}</span>
                        ${percentage > 0 ? `
                            <div class="poster-progress-bar">
                                <div class="poster-progress-fill" style="width: ${percentage}%"></div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            this.grid.querySelectorAll('.poster-card').forEach(card => {
                card.addEventListener('click', () => this.playAt(parseInt(card.getAttribute('data-idx'), 10)));
            });

            this._lazyThumbnails();
        }

        _lazyThumbnails() {
            if (!this.grid || !('IntersectionObserver' in window)) return;
            const imgs = Array.from(this.grid.querySelectorAll('[data-thumb]'));
            let generated = 0;
            const io = new IntersectionObserver((entries) => {
                entries.forEach(en => {
                    if (!en.isIntersecting || generated > 100) return;
                    const img = en.target;
                    io.unobserve(img);
                    generated++;
                    const path = img.getAttribute('data-path');
                    if (AUDIO_RE.test(path)) return;
                    this._makeThumb(img, this.getApiUrl(`/api/stream?path=${encodeURIComponent(path)}`) + this._authQuery().replace(/^\?/, '&'));
                });
            }, { root: this.grid, rootMargin: '200px' });
            imgs.forEach(img => io.observe(img));
        }

        // video 标签 seek 到 8% 处截帧生成 2:3 影院海报
        _makeThumb(img, url) {
            try {
                const v = document.createElement('video');
                v.muted = true; v.preload = 'metadata'; v.playsInline = true;
                v.src = url + '#t=0.1';
                const cleanup = () => { try { v.removeAttribute('src'); v.load(); } catch (e) {} };
                const timer = setTimeout(() => { cleanup(); img.remove(); }, 8000);
                v.addEventListener('loadeddata', () => {
                    try { v.currentTime = Math.max(1, (v.duration || 10) * 0.08); } catch (e) {}
                }, { once: true });
                v.addEventListener('seeked', () => {
                    clearTimeout(timer);
                    try {
                        const c = document.createElement('canvas');
                        c.width = 240; c.height = 360;
                        const ctx = c.getContext('2d');
                        const vw = v.videoWidth, vh = v.videoHeight;
                        if (!vw || !vh) throw new Error('no dim');
                        const srcRatio = vw / vh, dstRatio = 240 / 360;
                        let sw = vw, sh = vh, sx = 0, sy = 0;
                        if (srcRatio > dstRatio) { sw = vh * dstRatio; sx = (vw - sw) / 2; }
                        else { sh = vw / dstRatio; sy = (vh - sh) / 2; }
                        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, 240, 360);
                        img.src = c.toDataURL('image/jpeg', 0.72);
                        img.style.display = '';
                        const ph = img.parentElement && img.parentElement.querySelector('[data-ph]');
                        if (ph) ph.style.display = 'none';
                    } catch (e) { img.remove(); }
                    cleanup();
                }, { once: true });
                v.addEventListener('error', () => { clearTimeout(timer); img.remove(); }, { once: true });
            } catch (e) { img.remove(); }
        }

        playAt(idx) {
            const item = this.items[idx];
            if (!item || !global.AppleMediaPlayer) return;
            const q = this._authQuery().replace(/^\?/, '&');
            const playlist = this.items.filter(f => MEDIA_RE.test(f.name)).map(f => ({
                name: f.name,
                path: f.path,
                type: AUDIO_RE.test(f.name) ? 'audio' : 'video',
                url: this.getApiUrl(`/api/stream?path=${encodeURIComponent(f.path)}`) + q
            }));
            global.AppleMediaPlayer.play(playlist[idx], playlist);
        }
    }

    let instance = null;

    MediaTheater.init = function (config) {
        if (!instance) instance = new MediaTheater(config);
        instance.restoreFolders();
        return instance;
    };
    MediaTheater.scan = function () { if (instance) instance.scan(); };
    MediaTheater.pickFolder = function () { if (instance) instance.pickFolder(); };
    MediaTheater.addFolder = function (p) { if (instance) instance.addFolder(p); };
    MediaTheater.removeFolder = function (t) { if (instance) instance.removeFolder(t); };

    global.MediaTheaterComponent = MediaTheater;
})(typeof window !== 'undefined' ? window : this);
