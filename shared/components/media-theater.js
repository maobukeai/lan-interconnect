/**
 * 猫步互联 · 影音剧院组件 (MediaTheater)
 * 支持：目录层级浏览 (Folder Tree View) + 智能海报墙 (Flat Wall View) + 面包屑返回 + 懒生成缩略图 + 断点续播 + Apple 播放器无缝联动。
 * Web 端与桌面端共用。
 */

(function (global) {
    'use strict';

    const I = (name, size) => (global.Icons ? global.Icons.render(name, size) : '');
    // 统一白名单：此前本地这份正则漏掉 ts/m4v/flv/wmv/rmvb 等，
    // 这些文件能出缩略图、能流式播放，却进不了海报墙
    const MEDIA_RE = (global.MediaTypes && global.MediaTypes.MEDIA_RE) || /\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i;
    const AUDIO_RE = (global.MediaTypes && global.MediaTypes.AUDIO_RE) || /\.(mp3|wav|flac|aac|m4a)$/i;
    const escapeHtml = global.escapeHtml || (s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    // 排序模式循环顺序与按钮文案（与文件页循环排序交互一致）
    const SORT_MODES = ['default', 'name_asc', 'name_desc', 'time_desc', 'size_desc'];
    const SORT_LABELS = { default: '默认', name_asc: '名称 ↑', name_desc: '名称 ↓', time_desc: '时间 ↓', size_desc: '大小 ↓' };

    function parseMediaInfo(filename) {
        if (!filename || typeof filename !== 'string') {
            return { cleanTitle: '', resolution: '', tag: '', year: '' };
        }
        const nameWithoutExt = filename.replace(/\.[a-zA-Z0-9]{2,5}$/, '');
        
        let season = null, episode = null, tag = '';
        const seMatch = nameWithoutExt.match(/S(\d{1,2})[._\-\s]*E(\d{1,3})/i) ||
                        nameWithoutExt.match(/第\s*(\d+)\s*季.*第\s*(\d+)\s*集/i) ||
                        nameWithoutExt.match(/[\[\(\s_]EP?(\d{1,3})[\]\)\s_]/i);
        if (seMatch) {
            if (seMatch[2]) {
                season = parseInt(seMatch[1], 10);
                episode = parseInt(seMatch[2], 10);
                tag = `S${season}:E${episode}`;
            } else if (seMatch[1]) {
                episode = parseInt(seMatch[1], 10);
                tag = `EP${episode}`;
            }
        }

        let year = '';
        const yearMatch = nameWithoutExt.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) {
            year = yearMatch[1];
        }

        let resolution = '';
        if (/\b(4k|2160p|uhd)\b/i.test(nameWithoutExt)) resolution = '4K';
        else if (/\b(1080p|1080i|fhd)\b/i.test(nameWithoutExt)) resolution = '1080P';
        else if (/\b(720p|hd)\b/i.test(nameWithoutExt)) resolution = '720P';

        let cleanTitle = nameWithoutExt
            .replace(/\[[^\]]+\]/g, ' ')
            .replace(/\([^\)]+\)/g, ' ')
            .replace(/\b(19\d{2}|20\d{2})\b.*/i, '')
            .replace(/S\d{1,2}[._\-\s]*E\d{1,3}.*/i, '')
            .replace(/\b(4k|2160p|1080p|720p|bluray|bdrip|web-dl|webrip|hdrip|hdtv|x264|x265|hevc|aac|dts|remux|h264|h265)\b.*/i, '')
            .replace(/[._\-]/g, ' ')
            .trim();

        if (!cleanTitle || cleanTitle.length < 2) {
            cleanTitle = nameWithoutExt;
        }

        return { cleanTitle, resolution, tag, year, originalName: filename };
    }

    class MediaTheater {
        constructor(config = {}) {
            this.grid = typeof config.grid === 'string' ? document.querySelector(config.grid) : config.grid;
            this.folderLabel = typeof config.folderLabel === 'string' ? document.querySelector(config.folderLabel) : config.folderLabel;
            this.chipRow = typeof config.chipRow === 'string' ? document.querySelector(config.chipRow) : (document.getElementById('media-folders-chip-row') || config.chipRow);
            this.breadcrumbContainer = typeof config.breadcrumbContainer === 'string' ? document.querySelector(config.breadcrumbContainer) : (document.getElementById('media-breadcrumb-container') || config.breadcrumbContainer);
            this.getApiUrl = config.getApiUrl || ((p) => {
                if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.api) {
                    return global.LanDiskAuth.api(p);
                }
                if (typeof window !== 'undefined') {
                    const baseUrl = window.currentServerUrl || (typeof localStorage !== 'undefined' && localStorage.getItem('landisk_custom_server')) || '';
                    if (baseUrl) return baseUrl.replace(/\/$/, '') + (p.startsWith('/') ? p : '/' + p);
                }
                return p;
            });
            this.folders = [];
            this.currentPath = null;
            this.viewMode = localStorage.getItem('landisk_media_view_mode') || 'tree'; // 'tree' | 'flat' | 'history'(临时视图，不持久化)
            if (this.viewMode === 'history') this.viewMode = 'tree';
            // 排序模式：default(服务端顺序) | name_asc | name_desc | time_desc | size_desc
            this.sortMode = localStorage.getItem('landisk_media_sort') || 'default';
            this.historyEntries = []; // 播放历史（服务端派生 + 本地回退），按最后播放时间倒序
            this.currentMediaItems = []; // 当前目录或平铺下的媒体文件
            this.isScanning = false;
            this.progressMap = {};
            this._navSeq = 0; // 导航序号：防止慢响应覆盖用户最新打开的目录

            // 播放器关闭回到影音页时播放历史刚变化：历史视图整体刷新，
            // 平铺视图重渲染顶部「最近播放」横排（树形视图等下次导航时自然刷新）
            if (typeof window !== 'undefined' && !this._playerClosedBound) {
                this._playerClosedBound = true;
                window.addEventListener('landisk:player-closed', () => {
                    try {
                        if (this.viewMode === 'history') {
                            this.openHistory();
                        } else if (this.viewMode === 'flat' && this.currentMediaItems && this.currentMediaItems.length) {
                            this._fetchHistory().then(() => this._renderFlatWall());
                        }
                    } catch (e) {}
                });
            }
        }

        _authHeaders(extra) {
            return (global.LanDiskAuth && global.LanDiskAuth.authHeaders) ? global.LanDiskAuth.authHeaders(extra) : (extra || {});
        }

        _authQuery() {
            return (global.LanDiskAuth && global.LanDiskAuth.authQuery) ? global.LanDiskAuth.authQuery() : '';
        }

        // grid 内卡片统一事件委托：grid 节点不会随 innerHTML 重建而替换，
        // 委托只在首次挂一次，渲染重建不会丢绑定（逐卡 querySelectorAll 绑定在
        // 重建/主线程繁忙时会让新卡片的点击丢失）
        _bindGridActions() {
            if (!this.grid || this._gridActionsBound) return;
            this._gridActionsBound = true;
            this.grid.addEventListener('click', (e) => {
                const folderCard = e.target.closest('.media-folder-item');
                if (folderCard) {
                    if (global.LanDiskUI && global.LanDiskUI.Haptic) global.LanDiskUI.Haptic.light();
                    const fp = folderCard.getAttribute('data-folder-path');
                    if (fp) this.openPath(fp);
                    return;
                }
                // 历史/最近播放卡片：按索引从历史记录直接续播
                // （必须先于 .poster-card 判断：历史卡片同时带有 poster-card 类）
                const histCard = e.target.closest('.hist-card');
                if (histCard) {
                    if (global.LanDiskUI && global.LanDiskUI.Haptic) global.LanDiskUI.Haptic.light();
                    const idx = parseInt(histCard.getAttribute('data-hist-idx'), 10);
                    const entry = (idx >= 0 && idx < this.historyEntries.length) ? this.historyEntries[idx] : null;
                    if (entry) this.playFromEntry(entry);
                    return;
                }
                const poster = e.target.closest('.poster-card');
                if (poster) {
                    if (global.LanDiskUI && global.LanDiskUI.Haptic) global.LanDiskUI.Haptic.light();
                    this.playAt(parseInt(poster.getAttribute('data-idx'), 10));
                }
            });

            // 海报缩略图 load/error 不冒泡，只能在捕获阶段委托处理：
            // 替代逐卡内联 onload/onerror（内联 onerror 需把文件路径拼进 JS 字符串，
            // 文件名含引号时可突破属性造成属性截断/注入）
            this.grid.addEventListener('load', (e) => {
                const img = e.target;
                if (!img || !(img instanceof HTMLImageElement) || !img.classList.contains('poster-img')) return;
                img.classList.add('loaded');
                const ph = img.parentElement && img.parentElement.querySelector('[data-ph]');
                if (ph) ph.style.display = 'none';
            }, true);
            this.grid.addEventListener('error', (e) => {
                const img = e.target;
                if (!img || !(img instanceof HTMLImageElement) || !img.classList.contains('poster-img')) return;
                if (img.dataset.fb) {
                    img.style.display = 'none';
                    return;
                }
                img.dataset.fb = '1';
                const card = img.closest('.poster-card') || img.closest('[data-path]');
                const filePath = card && card.getAttribute('data-path');
                if (filePath && global.MediaTheaterComponent && global.MediaTheaterComponent.fallbackThumb) {
                    global.MediaTheaterComponent.fallbackThumb(img, filePath);
                } else {
                    img.style.display = 'none';
                }
            }, true);
        }

        // 海报墙就绪即预取第一个视频的首块：Range 用 bytes=0-（与浏览器首个媒体请求
        // 完全一致，SW 缓存 key 相同），用户点开海报时首帧直接从缓存响出；
        // 每个目录只预取一次，>1GB 不预取（无谓占用缓存）。
        // 延迟 8 秒再发：本地链路无感知；远程链路下目录列表/进度表/缩略图请求
        // 先行完成，预热不与它们抢起播带宽。连续导航会重置计时器。
        _prewarmFirstVideo() {
            if (this._prewarmTimer) clearTimeout(this._prewarmTimer);
            this._prewarmTimer = setTimeout(() => {
                this._prewarmTimer = null;
                const items = this.currentMediaItems || [];
                const firstVideo = items.find(m => m && !m.isDirectory && !m.isDir &&
                    /\.(mp4|mkv|webm|mov|avi|flv|wmv|ts|m4v|3gp|rmvb)$/i.test(m.name || ''));
                if (!firstVideo) return;
                if (firstVideo.size && firstVideo.size > 1024 * 1024 * 1024) return;
                if (this._prewarmKey === firstVideo.path) return;
                this._prewarmKey = firstVideo.path;
                try {
                    const url = this.getApiUrl(`/api/stream?path=${encodeURIComponent(firstVideo.path)}`) + this._authQuery().replace(/^\?/, '&');
                    fetch(url, { headers: { 'Range': 'bytes=0-' }, cache: 'force-cache' }).catch(() => {});
                } catch (e) {}
            }, 8000);
        }

        // 从本地存储还原已保存的多媒体目录与视图偏好，并与服务端资料库合并
        // （服务端为共享主库：换设备/重装 App/桌面端添加的目录都能看到）
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
            this._bindModeToggle();
            this.renderFolderChips();
            this._syncFoldersFromServer();
        }

        // 拉取服务端媒体库并与本地合并（取并集后回写，弱网/离线时本地缓存仍可用）
        async _syncFoldersFromServer() {
            try {
                const res = await fetch(this.getApiUrl('/api/media/dirs'), { headers: this._authHeaders() });
                if (!res.ok) return;
                const data = await res.json();
                if (!data || !Array.isArray(data.dirs)) return;
                const serverSet = new Set(data.dirs.filter(p => p && typeof p === 'string' && p.trim()));
                const merged = Array.from(new Set([...serverSet, ...this.folders]
                    .filter(p => p && typeof p === 'string' && p.trim())));
                // 服务端缺少本地条目（如手机先离线添加）时也要回写，保持双向一致
                const needsPush = merged.some(p => !serverSet.has(p));
                const needsPull = this.folders.length !== merged.length ||
                    merged.some(p => !this.folders.includes(p));
                if (needsPush || needsPull) {
                    this.folders = merged;
                    this._saveFolders(); // 本地缓存 + 回 POST 服务端
                    this.renderFolderChips();
                    if (needsPull) this.refresh();
                }
            } catch (e) {}
        }

        _saveFolders() {
            try {
                localStorage.setItem('landisk_media_folders', JSON.stringify(this.folders));
                localStorage.setItem('landisk_media_folder', this.folders[0] || '');
            } catch (e) {}
            // 同步到服务端持久化（fire-and-forget，失败不影响本地体验）
            try {
                fetch(this.getApiUrl('/api/media/dirs'), {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ dirs: this.folders })
                }).catch(() => {});
            } catch (e) {}
        }

        _bindModeToggle() {
            const toggleBox = document.getElementById('media-view-mode-toggle');
            if (toggleBox && !toggleBox._bound) {
                toggleBox._bound = true;
                const updateUI = () => {
                    toggleBox.querySelectorAll('.segmented-item').forEach(btn => {
                        const m = btn.getAttribute('data-mode');
                        btn.classList.toggle('active', m === this.viewMode);
                    });
                };
                updateUI();

                toggleBox.querySelectorAll('.segmented-item').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const nextMode = btn.getAttribute('data-mode');
                        if (nextMode !== this.viewMode) {
                            this.viewMode = nextMode;
                            // 历史是临时视图，不写入持久化偏好
                            if (nextMode !== 'history') localStorage.setItem('landisk_media_view_mode', nextMode);
                            updateUI();
                            if (global.LanDiskUI && global.LanDiskUI.Haptic) global.LanDiskUI.Haptic.light();
                            this.refresh();
                        }
                    });
                });
            }
        }

        // 渲染已添加的媒体源目录胶囊标签栏
        renderFolderChips() {
            const chipRowEl = this.chipRow || document.getElementById('media-folders-chip-row');
            if (this.folderLabel) {
                this.folderLabel.textContent = this.folders.length ? `${this.folders.length} 个媒体源` : '0 个媒体源';
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
                    <div class="media-folder-chip" title="${escapeHtml(fPath)}" data-root-idx="${idx}">
                        ${I('folder', 14)}
                        <span class="chip-name">${escapeHtml(dirName)}</span>
                        <button class="chip-remove" data-del-idx="${idx}" title="移除此目录">×</button>
                    </div>
                `;
            }).join('');

            chipRowEl.innerHTML = html;

            chipRowEl.querySelectorAll('.media-folder-chip').forEach(chip => {
                chip.addEventListener('click', (e) => {
                    if (e.target.closest('.chip-remove')) return;
                    const rIdx = parseInt(chip.getAttribute('data-root-idx'), 10);
                    if (this.folders[rIdx]) {
                        this.viewMode = 'tree';
                        const toggleBox = document.getElementById('media-view-mode-toggle');
                        if (toggleBox) {
                            toggleBox.querySelectorAll('.segmented-item').forEach(b => {
                                b.classList.toggle('active', b.getAttribute('data-mode') === 'tree');
                            });
                        }
                        this.openPath(this.folders[rIdx]);
                    }
                });
            });

            chipRowEl.querySelectorAll('.chip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const delIdx = parseInt(btn.getAttribute('data-del-idx'), 10);
                    this.removeFolder(delIdx);
                });
            });
        }

        // 追加新目录并自动保存与浏览
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
            this.openPath(cleaned);
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
                this.refresh();
            } else {
                this.currentPath = null;
                this.currentMediaItems = [];
                const bcContainer = this.breadcrumbContainer || document.getElementById('media-breadcrumb-container');
                if (bcContainer) bcContainer.style.display = 'none';
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

        // 刷新当前视图
        async refresh() {
            if (this.viewMode === 'history') {
                await this.openHistory();
                return;
            }
            if (!this.folders.length) {
                if (this.grid) {
                    this.grid.innerHTML = `
                        <div class="empty-state" style="grid-column:1/-1">
                            <span data-icon="playCircle" data-icon-size="34"></span>
                            添加电脑上的电影/音乐文件夹，手机秒变家庭影院
                        </div>
                    `;
                }
                const bcContainer = this.breadcrumbContainer || document.getElementById('media-breadcrumb-container');
                if (bcContainer) bcContainer.style.display = 'none';
                return;
            }

            if (this.viewMode === 'flat') {
                await this.scanFlat();
            } else {
                if (this.currentPath) {
                    await this.openPath(this.currentPath);
                } else {
                    await this.openRoot();
                }
            }
        }

        // 统一 scan 入口
        async scan() {
            await this.refresh();
        }

        // 获取进度映射表
        async _fetchProgress() {
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
                        this.progressMap = data.progressMap;
                    }
                }
            } catch (e) {}

            try {
                const raw = localStorage.getItem('landisk_player_history');
                if (raw) {
                    const localHistory = JSON.parse(raw);
                    for (const p in localHistory) {
                        if (!this.progressMap[p] && localHistory[p].percentage > 0) {
                            this.progressMap[p] = { percentage: localHistory[p].percentage };
                        }
                    }
                }
            } catch (e) {}
        }

        // ---------- 排序 / 最近播放 / 播放历史 ----------

        _mtime(f) {
            if (!f || !f.mtime) return 0;
            try { return new Date(f.mtime).getTime() || 0; } catch (e) { return 0; }
        }

        // 媒体文件展示排序；default 保留服务端顺序（文件夹卡片永远按服务端名称序，不参与）
        _sortMediaFiles(files) {
            if (!Array.isArray(files) || this.sortMode === 'default') return files;
            const arr = [...files];
            const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { numeric: true });
            if (this.sortMode === 'name_asc') arr.sort(byName);
            else if (this.sortMode === 'name_desc') arr.sort((a, b) => byName(b, a));
            else if (this.sortMode === 'time_desc') arr.sort((a, b) => this._mtime(b) - this._mtime(a));
            else if (this.sortMode === 'size_desc') arr.sort((a, b) => (b.size || 0) - (a.size || 0));
            return arr;
        }

        _updateSortLabel() {
            const lbl = document.getElementById('media-sort-label');
            if (lbl) lbl.textContent = SORT_LABELS[this.sortMode] || '默认';
        }

        // 排序按钮自绑定（三端共用；init 时调用，按钮为静态 HTML 必已存在）
        _bindSortButton() {
            const btn = document.getElementById('btn-media-sort');
            if (!btn || btn._mediaSortBound) return;
            btn._mediaSortBound = true;
            btn.addEventListener('click', () => this.cycleSort());
        }

        // 循环切换排序并按当前视图就地重排（树形走缓存免重新拉目录，平铺从内存重渲染）
        cycleSort() {
            const idx = SORT_MODES.indexOf(this.sortMode);
            this.sortMode = SORT_MODES[(idx + 1) % SORT_MODES.length] || 'default';
            try { localStorage.setItem('landisk_media_sort', this.sortMode); } catch (e) {}
            this._updateSortLabel();
            if (global.LanDiskUI && global.LanDiskUI.Haptic) global.LanDiskUI.Haptic.light();
            if (this.viewMode === 'flat') {
                this.currentMediaItems = this._sortMediaFiles(this.currentMediaItems);
                this._renderFlatWall();
            } else if (this.viewMode === 'history') {
                // 历史视图固定按最后观看时间倒序，排序按钮不影响
            } else if (this.currentPath && this._lastTreeFiles) {
                this._renderTreeDir();
            } else if (this.currentPath) {
                this.openPath(this.currentPath);
            } else {
                this.openRoot();
            }
            return { mode: this.sortMode, label: SORT_LABELS[this.sortMode] };
        }

        getSortInfo() {
            return { mode: this.sortMode, label: SORT_LABELS[this.sortMode] };
        }

        // 拉取播放历史：服务端派生记录优先（跨设备共享），不可达时回退本机 localStorage
        async _fetchHistory() {
            this.historyEntries = [];
            try {
                const res = await fetch(this.getApiUrl('/api/media/history') + this._authQuery(), { headers: this._authHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && Array.isArray(data.history)) this.historyEntries = data.history;
                }
            } catch (e) {}
            if (this.historyEntries.length) return;
            try {
                const raw = localStorage.getItem('landisk_player_history');
                if (!raw) return;
                const local = JSON.parse(raw) || {};
                this.historyEntries = Object.values(local)
                    .filter(r => r && r.path && (r.current > 8 || (r.percentage || 0) > 0))
                    .map(r => ({
                        path: r.path,
                        name: r.name || r.path.split(/[\\/]/).pop(),
                        time: r.current || 0,
                        duration: r.duration || 0,
                        percentage: r.percentage || 0,
                        updatedAt: r.time || 0
                    }))
                    .sort((a, b) => b.updatedAt - a.updatedAt);
            } catch (e) {}
        }

        _timeAgo(ts) {
            if (!ts) return '';
            const diff = Date.now() - ts;
            if (diff < 60 * 1000) return '刚刚';
            const m = Math.floor(diff / 60000);
            if (m < 60) return `${m} 分钟前`;
            const h = Math.floor(m / 60);
            if (h < 24) return `${h} 小时前`;
            const d = Math.floor(h / 24);
            if (d === 1) return '昨天';
            if (d < 7) return `${d} 天前`;
            const dt = new Date(ts);
            return `${dt.getMonth() + 1}月${dt.getDate()}日`;
        }

        _isFinished(h) {
            const pct = h.percentage || 0;
            return pct >= 97 || (h.duration > 0 && h.time > 0 && h.time >= h.duration - 12);
        }

        // 从历史记录直接调起播放（播放器 checkResumeHistory 会自动弹出断点续播提示）；
        // 播放列表带上其余历史条目，keepOrder 保持「最近看过的在前」的次序
        playFromEntry(entry) {
            if (!entry || !entry.path || !global.AppleMediaPlayer) return;
            const q = this._authQuery().replace(/^\?/, '&');
            const toItem = (h) => ({
                name: h.name || String(h.path).split(/[\\/]/).pop(),
                path: h.path,
                type: AUDIO_RE.test(h.name || h.path) ? 'audio' : 'video',
                url: this.getApiUrl(`/api/stream?path=${encodeURIComponent(h.path)}`) + q
            });
            const playlist = this.historyEntries.map(toItem).filter(p => p.path);
            const idx = playlist.findIndex(p => p.path === entry.path);
            global.AppleMediaPlayer.play(playlist[idx >= 0 ? idx : 0], playlist, { keepOrder: true });
        }

        // 最近播放横排（资料库顶层视图的海报墙顶部，≤12 条横滑卡片）
        _recentRowHtml() {
            const entries = (this.historyEntries || []).slice(0, 12);
            if (!entries.length) return '';
            const q = this._authQuery().replace(/^\?/, '&');
            const cards = entries.map((h, i) => {
                const isAudio = AUDIO_RE.test(h.name || h.path);
                const pct = Math.min(100, Math.max(0, h.percentage || 0));
                const finished = this._isFinished(h);
                const thumbUrl = isAudio ? '' : this.getApiUrl(`/api/thumbnail?path=${encodeURIComponent(h.path)}`) + q;
                return `
                    <div class="hist-card" data-hist-idx="${i}" data-path="${escapeHtml(h.path)}" title="${escapeHtml(h.name)}">
                        <div class="hist-thumb-box">
                            <span data-ph="1">${I(isAudio ? 'music' : 'video', 22)}</span>
                            ${thumbUrl ? `<img alt="" class="poster-img" src="${thumbUrl}" loading="lazy">` : ''}
                            ${finished ? `<span class="poster-watched-badge">已看完</span>` : (pct > 0 ? `<span class="poster-watched-badge">已看 ${pct}%</span>` : '')}
                            <span class="poster-play">${I('playCircle', 26)}</span>
                            ${pct > 0 ? `<div class="poster-progress-bar"><div class="poster-progress-fill" style="width: ${pct}%"></div></div>` : ''}
                        </div>
                        <div class="hist-name">${escapeHtml(h.name)}</div>
                        <div class="hist-sub">${escapeHtml(this._timeAgo(h.updatedAt))}</div>
                    </div>
                `;
            }).join('');
            return `
                <div class="media-section-header recent-header" style="grid-column:1/-1;">
                    ${I('history', 14)} 最近播放
                </div>
                <div class="recent-row" style="grid-column:1/-1;">${cards}</div>
            `;
        }

        // 完整播放历史视图：按最后播放时间倒序的海报墙 + 清空记录
        async openHistory() {
            const seq = ++this._navSeq;
            this.currentPath = null;
            this.currentMediaItems = [];
            if (this._prewarmTimer) clearTimeout(this._prewarmTimer);
            const bcContainer = this.breadcrumbContainer || document.getElementById('media-breadcrumb-container');
            if (bcContainer) bcContainer.style.display = 'none';
            if (this.grid) {
                this.grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${I('history', 34)}正在读取播放历史…</div>`;
            }

            await this._fetchHistory();
            if (seq !== this._navSeq) return;
            if (!this.grid) return;

            if (!this.historyEntries.length) {
                this.grid.innerHTML = `
                    <div class="empty-state" style="grid-column:1/-1">
                        ${I('history', 34)}
                        暂无播放记录<br><span style="font-size:12px; opacity:0.7">看完的视频会自动出现在这里，跨设备同步</span>
                    </div>
                `;
                return;
            }

            const q = this._authQuery().replace(/^\?/, '&');
            const cards = this.historyEntries.map((h, i) => {
                const isAudio = AUDIO_RE.test(h.name || h.path);
                const pct = Math.min(100, Math.max(0, h.percentage || 0));
                const finished = this._isFinished(h);
                const thumbUrl = isAudio ? '' : this.getApiUrl(`/api/thumbnail?path=${encodeURIComponent(h.path)}`) + q;
                return `
                    <div class="poster-card hist-card" data-hist-idx="${i}" data-path="${escapeHtml(h.path)}" title="${escapeHtml(h.name)}">
                        <span data-ph="1">${I(isAudio ? 'music' : 'video', 30)}</span>
                        ${thumbUrl ? `<img alt="" class="poster-img" src="${thumbUrl}" loading="lazy">` : ''}
                        <span class="poster-badge">${isAudio ? I('music', 11) + '音频' : I('video', 11) + '视频'}</span>
                        ${finished ? `<span class="poster-watched-badge">已看完</span>` : (pct > 0 ? `<span class="poster-watched-badge">已看 ${pct}%</span>` : '')}
                        <span class="poster-play">${I('playCircle', 34)}</span>
                        <span class="poster-name">${escapeHtml(h.name)}</span>
                        <span class="hist-time-badge">${I('clock', 10)} ${escapeHtml(this._timeAgo(h.updatedAt))}</span>
                        ${pct > 0 ? `<div class="poster-progress-bar"><div class="poster-progress-fill" style="width: ${pct}%"></div></div>` : ''}
                    </div>
                `;
            }).join('');

            this.grid.innerHTML = `
                <div class="media-section-header" style="grid-column:1/-1; display:flex; align-items:center; gap:10px;">
                    <span>${I('history', 14)} 播放历史 (${this.historyEntries.length})</span>
                    <button class="apple-btn apple-btn-glass apple-btn-sm media-history-clear" title="清空全部播放记录（同时清除断点续播进度）">清空记录</button>
                </div>
                ${cards}
            `;
            this._bindGridActions();

            const clearBtn = this.grid.querySelector('.media-history-clear');
            if (clearBtn) clearBtn.addEventListener('click', () => this._clearHistory());
        }

        async _clearHistory() {
            const ui = global.LanDiskUI;
            const doClear = async () => {
                try {
                    await fetch(this.getApiUrl('/api/media/progress'), { method: 'DELETE', headers: this._authHeaders() });
                } catch (e) {}
                try { localStorage.removeItem('landisk_player_history'); } catch (e) {}
                this.historyEntries = [];
                try { if (this.progressMap) this.progressMap = {}; } catch (e) {}
                if (ui && ui.toast) ui.toast('已清空全部播放记录', 'success');
                if (this.viewMode === 'history') this.openHistory();
            };
            if (ui && ui.openModal) {
                const modal = ui.openModal(`
                    <div class="modal-title">清空播放记录？</div>
                    <div class="modal-message" style="font-size:12.5px; color:var(--apple-text-secondary); margin-bottom:14px;">将删除全部播放历史，<b style="color:var(--apple-system-red)">同时清空所有影片的断点续播进度</b>，此操作不可恢复。</div>
                    <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:8px;">
                        <button class="apple-btn apple-btn-glass" data-act="cancel">取消</button>
                        <button class="apple-btn apple-btn-primary" data-act="ok" style="background:var(--apple-system-red);">清空</button>
                    </div>
                `, { width: 380 });
                modal.el.querySelector('[data-act="cancel"]').addEventListener('click', () => modal.close());
                modal.el.querySelector('[data-act="ok"]').addEventListener('click', () => { modal.close(); doClear(); });
            } else if (confirm('确定清空全部播放记录？\n\n注意：这也会同时清掉所有影片的断点续播进度，不可恢复。')) {
                doClear();
            }
        }

        // 移动端「历史」按钮：进入历史视图，再按一次回到之前的视图
        toggleHistoryView() {
            if (this.viewMode === 'history') {
                this.viewMode = this._prevViewMode || 'tree';
            } else {
                this._prevViewMode = this.viewMode;
                this.viewMode = 'history';
            }
            const toggleBox = document.getElementById('media-view-mode-toggle');
            if (toggleBox) {
                toggleBox.querySelectorAll('.segmented-item').forEach(b => {
                    b.classList.toggle('active', b.getAttribute('data-mode') === this.viewMode);
                });
            }
            if (global.LanDiskUI && global.LanDiskUI.Haptic) global.LanDiskUI.Haptic.light();
            this.refresh();
        }

        // 打开资料库根视图
        async openRoot() {
            this.currentPath = null;
            if (!this.folders.length) {
                this.refresh();
                return;
            }

            // 如果仅有 1 个媒体源目录，自动进入该目录结构
            if (this.folders.length === 1) {
                await this.openPath(this.folders[0]);
                return;
            }

            // 多个媒体源目录，展示各个根目录卡片
            this._renderBreadcrumbs([]);
            await Promise.all([this._fetchProgress(), this._fetchHistory()]);

            if (this.grid) {
                const recentHtml = this._recentRowHtml();
                let html = recentHtml + `
                    <div class="media-section-header" style="grid-column:1/-1;">
                        ${I('folder', 14)} 媒体源目录 (${this.folders.length})
                    </div>
                    <div class="media-folder-grid" style="grid-column:1/-1;">
                        ${this.folders.map((fPath, idx) => {
                            const normalized = fPath.replace(/\\/g, '/');
                            const parts = normalized.split('/').filter(Boolean);
                            const dirName = parts.length ? parts[parts.length - 1] : fPath;
                            return `
                                <div class="media-folder-item" data-folder-path="${escapeHtml(fPath)}" title="${escapeHtml(fPath)}">
                                    <div class="media-folder-icon-box">
                                        ${I('folder', 22)}
                                    </div>
                                    <div class="media-folder-info">
                                        <div class="media-folder-name">${escapeHtml(dirName)}</div>
                                        <div class="media-folder-sub">媒体源根目录</div>
                                    </div>
                                    <div class="media-folder-arrow">${I('chevronRight', 16)}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
                this.grid.innerHTML = html;
                this._bindGridActions();
            }
        }

        // 物理返回键逐级回退入口：返回 true 表示已在剧场视图内完成一次「上一级」，
        // 返回 false 表示已在最顶层，调用方（app.js 返回阶梯）继续往下处理
        goUp() {
            if (!this.currentPath) return false;
            const normalize = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
            const cur = normalize(this.currentPath);
            const isFolderRoot = (this.folders || []).some(f => normalize(f) === cur);
            if (isFolderRoot) {
                // 多个媒体源目录时回到目录卡片页；只有一个目录时没有更上层，交还视图级返回
                if (this.folders.length > 1) {
                    this.openRoot();
                    return true;
                }
                return false;
            }
            const parts = cur.split('/').filter(Boolean);
            if (parts.length <= 1) return false;
            parts.pop();
            this.openPath(parts.join('/'));
            return true;
        }

        // 打开指定目录层级 (Tree 视图)
        async openPath(folderPath) {
            const seq = ++this._navSeq;
            this.currentPath = folderPath;
            if (this.grid) {
                this.grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${I('playCircle', 34)}正在读取文件夹内容…</div>`;
            }

            try {
                const res = await fetch(this.getApiUrl(`/api/files?path=${encodeURIComponent(folderPath)}`), { headers: this._authHeaders() });
                if (!res.ok) throw new Error('读取目录失败');
                const data = await res.json();
                // 用户已切进别的目录：丢弃旧响应，防止覆盖新内容
                if (seq !== this._navSeq) return;
                const allFiles = data.files || [];
                // 缓存原始目录数据，排序切换时免重新拉取即可重排
                this._lastTreeFiles = allFiles;

                // 区分文件夹与媒体文件（媒体卡片按当前排序模式排列）
                const subDirs = allFiles.filter(f => f.isDirectory && !/^[.#]/.test(f.name));
                const mediaFiles = this._sortMediaFiles(allFiles.filter(f => !f.isDirectory && MEDIA_RE.test(f.name)));

                this.currentMediaItems = mediaFiles;
                this._prewarmFirstVideo();
                this._renderBreadcrumbsFromPath(folderPath);
                await this._fetchProgress();

                this._renderTreeDir(subDirs, mediaFiles);

                // 媒体源根目录层级补充「最近播放」横排（目录内容先行渲染，不阻塞）
                if (this._isFolderRoot(folderPath)) {
                    await this._fetchHistory();
                    if (seq !== this._navSeq) return;
                    const recentHtml = this._recentRowHtml();
                    if (recentHtml && this.grid) this.grid.insertAdjacentHTML('afterbegin', recentHtml);
                }

            } catch (err) {
                if (this.grid) {
                    this.grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">加载失败: ${escapeHtml(err.message)}</div>`;
                }
            }
        }

        // 当前路径是否为媒体源根目录（最近播放横排的显示时机之一）
        _isFolderRoot(p) {
            const norm = (x) => String(x || '').replace(/\\/g, '/').replace(/\/+$/, '');
            const cur = norm(p);
            return (this.folders || []).some(f => norm(f) === cur);
        }

        // 渲染树形目录：子文件夹横排卡片 + 当前目录直属媒体海报
        _renderTreeDir(subDirs, mediaFiles) {
            if (!Array.isArray(subDirs) || !Array.isArray(mediaFiles)) {
                const all = this._lastTreeFiles || [];
                subDirs = all.filter(f => f.isDirectory && !/^[.#]/.test(f.name));
                mediaFiles = this._sortMediaFiles(all.filter(f => !f.isDirectory && MEDIA_RE.test(f.name)));
                this.currentMediaItems = mediaFiles;
            }

            if (!subDirs.length && !mediaFiles.length) {
                if (this.grid) {
                    this.grid.innerHTML = `
                        <div class="empty-state" style="grid-column:1/-1">
                            <span data-icon="folder" data-icon-size="34"></span>
                            当前文件夹为空，未包含子文件夹或视频/音频文件
                        </div>
                    `;
                }
                return;
            }

            let html = '';

            // 1. 渲染子文件夹列表 (简约清爽的 Apple 横向卡片)
            if (subDirs.length > 0) {
                html += `
                    <div class="media-section-header" style="grid-column:1/-1;">
                        ${I('folder', 14)} 文件夹 (${subDirs.length})
                    </div>
                    <div class="media-folder-grid" style="grid-column:1/-1;">
                        ${subDirs.map(d => `
                            <div class="media-folder-item" data-folder-path="${escapeHtml(d.path)}" title="${escapeHtml(d.name)}">
                                <div class="media-folder-icon-box">
                                    ${I('folder', 22)}
                                </div>
                                <div class="media-folder-info">
                                    <div class="media-folder-name">${escapeHtml(d.name)}</div>
                                    <div class="media-folder-sub">文件夹</div>
                                </div>
                                <div class="media-folder-arrow">${I('chevronRight', 16)}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            // 2. 渲染当前目录直属媒体卡片 (Media Posters)
            if (mediaFiles.length > 0) {
                if (subDirs.length > 0) {
                    html += `
                        <div class="media-section-header" style="grid-column:1/-1; margin-top:10px;">
                            ${I('film', 14)} 媒体内容 (${mediaFiles.length})
                        </div>
                    `;
                }
                const q = this._authQuery().replace(/^\?/, '&');
                html += mediaFiles.map((f, i) => {
                    const isAudio = AUDIO_RE.test(f.name);
                    const prog = this.progressMap[f.path];
                    const percentage = prog ? (prog.percentage || 0) : 0;
                    const thumbUrl = this.getApiUrl(`/api/thumbnail?path=${encodeURIComponent(f.path)}`) + q;
                    const meta = parseMediaInfo(f.name);
                    const displayTitle = meta.cleanTitle || f.name;
                    const resBadge = meta.resolution && percentage <= 0 ? `<span class="poster-res-badge">${meta.resolution}</span>` : '';
                    const tagBadge = meta.tag ? `<span class="poster-tag-badge">${meta.tag}</span>` : '';
                    const yearSub = meta.year ? `<span class="poster-subinfo">${meta.year}</span>` : '';

                    return `
                        <div class="poster-card" data-idx="${i}" data-path="${escapeHtml(f.path)}" title="${escapeHtml(f.name)}">
                            <span data-ph="1">${I(isAudio ? 'music' : 'video', 30)}</span>
                            ${!isAudio ? `
                                <img alt=""
                                     class="poster-img"
                                     src="${thumbUrl}"
                                     loading="lazy">
                            ` : ''}
                            <span class="poster-badge">${isAudio ? I('music', 11) + '音频' : I('video', 11) + '视频'}</span>
                            ${resBadge}
                            ${percentage > 0 ? `<span class="poster-watched-badge">已看 ${percentage}%</span>` : ''}
                            ${tagBadge}
                            <span class="poster-play">${I('playCircle', 34)}</span>
                            <span class="poster-name">${escapeHtml(displayTitle)}</span>
                            ${yearSub}
                            ${percentage > 0 ? `
                                <div class="poster-progress-bar">
                                    <div class="poster-progress-fill" style="width: ${percentage}%"></div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('');
            }

            if (this.grid) {
                this.grid.innerHTML = html;
                this._bindGridActions();
            }
        }

        _renderBreadcrumbsFromPath(currentPath) {
            const normalizedCur = currentPath.replace(/\\/g, '/');
            const matchedRoot = this.folders.find(rf => {
                const nrf = rf.replace(/\\/g, '/');
                return normalizedCur === nrf || normalizedCur.startsWith(nrf + '/');
            });

            const crumbs = [];
            // 顶层 媒体资料库
            crumbs.push({ name: '媒体资料库', path: null, isRoot: true });

            if (matchedRoot) {
                const normalizedRoot = matchedRoot.replace(/\\/g, '/');
                const rootParts = normalizedRoot.split('/').filter(Boolean);
                const rootName = rootParts[rootParts.length - 1] || matchedRoot;

                crumbs.push({ name: rootName, path: matchedRoot });

                const rel = normalizedCur.slice(normalizedRoot.length).replace(/^\/+/, '');
                if (rel) {
                    const segments = rel.split('/').filter(Boolean);
                    let accumulated = normalizedRoot;
                    for (const seg of segments) {
                        accumulated += '/' + seg;
                        crumbs.push({ name: seg, path: accumulated });
                    }
                }
            } else {
                const parts = normalizedCur.split('/').filter(Boolean);
                let acc = '';
                for (const seg of parts) {
                    acc = acc ? (acc + '/' + seg) : seg;
                    crumbs.push({ name: seg, path: acc });
                }
            }

            this._renderBreadcrumbs(crumbs);
        }

        _renderBreadcrumbs(crumbs) {
            const bcContainer = this.breadcrumbContainer || document.getElementById('media-breadcrumb-container');
            if (!bcContainer) return;

            if (!crumbs || crumbs.length <= 1) {
                if (this.folders.length <= 1) {
                    bcContainer.style.display = 'none';
                    return;
                }
            }

            bcContainer.style.display = 'flex';
            bcContainer.className = 'media-breadcrumb-container';

            let html = '';
            // 返回上一级按钮
            if (crumbs.length > 1) {
                const parentCrumb = crumbs[crumbs.length - 2];
                html += `
                    <button class="media-back-btn" data-back-path="${escapeHtml(parentCrumb.path || '')}" title="返回上一级">
                        ${I('chevronLeft', 14)} <span>返回</span>
                    </button>
                    <div class="media-crumb-sep">|</div>
                `;
            }

            html += crumbs.map((c, idx) => {
                const isLast = idx === crumbs.length - 1;
                return `
                    <span class="media-crumb-item ${isLast ? 'active' : ''}" data-crumb-path="${escapeHtml(c.path || '')}" ${c.isRoot ? 'data-is-root="1"' : ''}>
                        ${c.isRoot ? I('film', 14) : I('folder', 13)}
                        <span>${escapeHtml(c.name)}</span>
                    </span>
                    ${!isLast ? `<span class="media-crumb-sep">›</span>` : ''}
                `;
            }).join('');

            bcContainer.innerHTML = html;

            const backBtn = bcContainer.querySelector('.media-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    if (global.LanDiskUI && global.LanDiskUI.Haptic) global.LanDiskUI.Haptic.light();
                    const p = backBtn.getAttribute('data-back-path');
                    if (p) this.openPath(p);
                    else this.openRoot();
                });
            }

            bcContainer.querySelectorAll('.media-crumb-item:not(.active)').forEach(item => {
                item.addEventListener('click', () => {
                    if (global.LanDiskUI && global.LanDiskUI.Haptic) global.LanDiskUI.Haptic.light();
                    if (item.getAttribute('data-is-root') === '1') {
                        this.openRoot();
                    } else {
                        const p = item.getAttribute('data-crumb-path');
                        if (p) this.openPath(p);
                    }
                });
            });
        }

        // 平铺聚合扫描全部媒体文件 (Flat 视图)
        async scanFlat() {
            const ui = global.LanDiskUI;
            if (!this.folders.length) return;

            if (this.isScanning) return;
            this.isScanning = true;
            const seq = ++this._navSeq;
            // 平铺是跨目录聚合视图，清掉层级路径，物理返回键在这里应回落到视图级返回
            this.currentPath = null;

            const bcContainer = this.breadcrumbContainer || document.getElementById('media-breadcrumb-container');
            if (bcContainer) bcContainer.style.display = 'none';

            if (this.grid) {
                this.grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${I('playCircle', 34)}正在扫描全部媒体文件…</div>`;
            }
            if (ui) ui.toast(`正在聚合扫描 ${this.folders.length} 个媒体目录…`, 'info');

            const found = [];
            const foundPathSet = new Set();
            const visitedDirs = new Set();

            // 4 路并发池：远程链路每个目录请求要付一个完整 RTT，
            // 串行 DFS 几十个目录动辄数秒到数十秒，并发后缩短到 1/3~1/4
            const WALK_CONCURRENCY = 4;
            const taskQueue = [];
            let running = 0;

            const enqueue = (dir, depth) => {
                if (depth > 4 || found.length >= 800 || visitedDirs.has(dir)) return;
                visitedDirs.add(dir);
                taskQueue.push([dir, depth]);
                pump();
            };

            const pump = () => {
                while (running < WALK_CONCURRENCY && taskQueue.length && found.length < 800) {
                    const [dir, depth] = taskQueue.shift();
                    running++;
                    walk(dir, depth).finally(() => {
                        running--;
                        pump();
                    });
                }
            };

            const walk = async (dir, depth) => {
                try {
                    const res = await fetch(this.getApiUrl(`/api/files?path=${encodeURIComponent(dir)}`), { headers: this._authHeaders() });
                    if (!res.ok) return;
                    const data = await res.json();
                    for (const f of (data.files || [])) {
                        if (found.length >= 800) break;
                        if (f.isDirectory) {
                            if (!/^[.#]/.test(f.name)) enqueue(f.path, depth + 1);
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
                enqueue(fld, 0);
            }

            // 等待全部目录任务排空
            await new Promise((resolve) => {
                const check = () => {
                    if (!running && !taskQueue.length) return resolve();
                    setTimeout(check, 40);
                };
                check();
            });

            // 并发完成顺序是随机的，按路径稳定排序保持"按目录分组"的展示确定性
            // （这也是默认排序模式下的展示顺序；用户切换排序后由 _sortMediaFiles 重排）
            found.sort((a, b) => String(a.path || '').localeCompare(String(b.path || ''), 'zh-CN'));

            this.currentMediaItems = this._sortMediaFiles(found);
            this._prewarmFirstVideo();
            this.isScanning = false;

            // 扫描期间用户可能已切进其他目录/视图：丢弃过期结果，不覆盖当前界面
            if (seq !== this._navSeq) return;

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
            await Promise.all([this._fetchProgress(), this._fetchHistory()]);

            this._renderFlatWall();
        }

        // 渲染平铺海报墙：顶部最近播放横排 + 全部媒体卡片（排序切换后从内存直接重渲染）
        _renderFlatWall() {
            if (!this.grid) return;
            const items = this.currentMediaItems || [];
            const recentHtml = this._recentRowHtml();
            const q = this._authQuery().replace(/^\?/, '&');

            this.grid.innerHTML = recentHtml + items.map((f, i) => {
                const isAudio = AUDIO_RE.test(f.name);
                const prog = this.progressMap[f.path];
                const percentage = prog ? (prog.percentage || 0) : 0;
                const thumbUrl = this.getApiUrl(`/api/thumbnail?path=${encodeURIComponent(f.path)}`) + q;
                const meta = parseMediaInfo(f.name);
                const displayTitle = meta.cleanTitle || f.name;
                const resBadge = meta.resolution && percentage <= 0 ? `<span class="poster-res-badge">${meta.resolution}</span>` : '';
                const tagBadge = meta.tag ? `<span class="poster-tag-badge">${meta.tag}</span>` : '';
                const yearSub = meta.year ? `<span class="poster-subinfo">${meta.year}</span>` : '';

                return `
                    <div class="poster-card" data-idx="${i}" title="${escapeHtml(f.name)}">
                        <span data-ph="1">${I(isAudio ? 'music' : 'video', 30)}</span>
                        ${!isAudio ? `
                            <img alt=""
                                 class="poster-img"
                                 src="${thumbUrl}"
                                 loading="lazy"
                                 onload="this.classList.add('loaded'); const ph = this.parentElement.querySelector('[data-ph]'); if (ph) ph.style.display='none';"
                                 onerror="this.style.display='none';">
                        ` : ''}
                        <span class="poster-badge">${isAudio ? I('music', 11) + '音频' : I('video', 11) + '视频'}</span>
                        ${resBadge}
                        ${percentage > 0 ? `<span class="poster-watched-badge">已看 ${percentage}%</span>` : ''}
                        ${tagBadge}
                        <span class="poster-play">${I('playCircle', 34)}</span>
                        <span class="poster-name">${escapeHtml(displayTitle)}</span>
                        ${yearSub}
                        ${percentage > 0 ? `
                            <div class="poster-progress-bar">
                                <div class="poster-progress-fill" style="width: ${percentage}%"></div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
            this._bindGridActions();
        }

        // 目录选择入口（支持原生桌面与 Web 模态浏览）
        async pickFolder() {
            const ui = global.LanDiskUI;

            // 1. 桌面端优先调用原生 OS 文件管理器窗口
            if (typeof window !== 'undefined' && window.api && typeof window.api.selectFolder === 'function') {
                try {
                    const chosen = await window.api.selectFolder();
                    if (chosen && typeof chosen === 'string') {
                        this.addFolder(chosen);
                        return;
                    }
                    if (chosen === null) return; // 用户在系统弹窗中主动取消了
                } catch (err) {
                    console.warn('Native selectFolder failed:', err);
                }
            } else if (global.IPC && typeof global.IPC.selectFolder === 'function') {
                try {
                    const chosen = await global.IPC.selectFolder();
                    if (chosen && typeof chosen === 'string') {
                        this.addFolder(chosen);
                        return;
                    }
                    if (chosen === null) return;
                } catch (err) {
                    console.warn('IPC selectFolder failed:', err);
                }
            }

            // 2. Web 移动端/浏览器端：交互式驱动盘符与文件夹树形选择模态窗
            if (!ui || !ui.openModal) {
                const manual = prompt('请输入要添加到媒体资料库的服务器文件夹绝对路径：');
                if (manual && manual.trim()) {
                    this.addFolder(manual.trim());
                }
                return;
            }

            const modal = ui.openModal(`
                <div class="modal-title">添加媒体目录到资料库</div>
                <div class="modal-message" data-mf="path" style="font-size:12px; color:var(--apple-text-secondary); word-break:break-all; margin-bottom:8px;">正在加载盘符…</div>
                <div class="col" data-mf="list" style="gap:5px; margin-bottom:16px; max-height:46vh; overflow-y:auto; padding:2px;"></div>
                <div class="modal-actions" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <button class="apple-btn apple-btn-glass" data-act="cancel">取消</button>
                    <div style="display:flex; gap:8px;">
                        <button class="apple-btn apple-btn-glass" data-act="manual" title="手动输入路径">手动输入</button>
                        <button class="apple-btn apple-btn-primary" data-act="pick">${I('check', 14)} 选定当前目录</button>
                    </div>
                </div>
            `, { width: 460 });

            let currentPath = '';
            const listEl = modal.el.querySelector('[data-mf="list"]');
            const pathEl = modal.el.querySelector('[data-mf="path"]');

            const renderList = async (p) => {
                listEl.innerHTML = `<div style="padding:12px; text-align:center; color:var(--apple-text-muted); font-size:12px;">加载中…</div>`;
                try {
                    if (!p) {
                        const res = await fetch(this.getApiUrl('/api/drives'), { headers: this._authHeaders() });
                        if (!res.ok) throw new Error('无法获取盘符列表');
                        const drives = await res.json();
                        pathEl.textContent = '服务器根目录（选择驱动盘符）';
                        currentPath = '';
                        listEl.innerHTML = drives.map(dr => `
                            <button class="ctx-menu-item" data-p="${escapeHtml(dr.path)}" style="width:100%; display:flex; align-items:center; gap:8px; padding:9px 12px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid var(--apple-border); color:var(--apple-text-main); font-size:13px; cursor:pointer;">
                                ${I('drive', 16)}
                                <span style="font-weight:600;">${escapeHtml(dr.name || dr.path)}</span>
                            </button>
                        `).join('');
                    } else {
                        const res = await fetch(this.getApiUrl(`/api/files?path=${encodeURIComponent(p)}`), { headers: this._authHeaders() });
                        if (!res.ok) throw new Error('无法读取目录内容');
                        const data = await res.json();
                        const items = Array.isArray(data) ? data : (data.files || []);
                        const dirs = items.filter(f => f.isDirectory || f.isDir || f.type === 'directory');
                        pathEl.textContent = p;
                        currentPath = p;

                        let html = '';
                        // 返回上一级
                        const parentPath = p.replace(/[\\/][^\\/]+[\\/]?$/, '');
                        html += `
                            <button class="ctx-menu-item" data-p="${escapeHtml(parentPath)}" style="width:100%; display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:10px; background:rgba(255,255,255,0.04); border:1px dashed var(--apple-border); color:var(--apple-text-secondary); font-size:12.5px; cursor:pointer;">
                                ${I('chevronLeft', 14)}
                                <span>.. (返回上一级)</span>
                            </button>
                        `;

                        if (dirs.length === 0) {
                            html += `<div style="padding:16px; text-align:center; color:var(--apple-text-muted); font-size:12px;">(此目录下无子文件夹，可直接点击右下角选定)</div>`;
                        } else {
                            html += dirs.map(d => `
                                <button class="ctx-menu-item" data-p="${escapeHtml(d.path)}" style="width:100%; display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid var(--apple-border); color:var(--apple-text-main); font-size:12.5px; cursor:pointer;">
                                    ${I('folder', 15)}
                                    <span style="font-weight:500;">${escapeHtml(d.name)}</span>
                                </button>
                            `).join('');
                        }
                        listEl.innerHTML = html;
                    }

                    listEl.querySelectorAll('[data-p]').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const nextPath = btn.getAttribute('data-p');
                            renderList(nextPath);
                        });
                    });
                } catch (err) {
                    listEl.innerHTML = `<div style="padding:16px; text-align:center; color:#ef4444; font-size:12.5px;">读取失败: ${escapeHtml(err.message)}</div>`;
                }
            };

            modal.el.querySelector('[data-act="cancel"]').addEventListener('click', () => modal.close());

            modal.el.querySelector('[data-act="manual"]').addEventListener('click', () => {
                modal.close();
                this._openManualPathInput(currentPath || '');
            });

            modal.el.querySelector('[data-act="pick"]').addEventListener('click', () => {
                if (!currentPath) {
                    ui.toast('请先点击进入具体磁盘或文件夹', 'info');
                    return;
                }
                modal.close();
                this.addFolder(currentPath);
            });

            renderList('');
        }

        // 手动输入媒体目录：应用内自绘输入框（替代系统原生 prompt —— 样式统一、
        // 移动端自动聚焦唤起键盘，不再出现中英文混排的系统对话框）
        _openManualPathInput(defaultValue) {
            const ui = global.LanDiskUI;
            if (!ui || !ui.openModal) {
                const manual = prompt('请输入要添加到媒体资料库的文件夹绝对路径：', defaultValue || '');
                if (manual && manual.trim()) this.addFolder(manual.trim());
                return;
            }
            const inputModal = ui.openModal(`
                <div class="modal-title">手动输入媒体目录</div>
                <div class="modal-message" style="font-size:12.5px; color:var(--apple-text-secondary); margin-bottom:10px;">输入服务器上的文件夹绝对路径，例如 D:\\Movies</div>
                <input class="apple-input" data-mf="manual-path" type="text" placeholder="D:\\Movies 或 C:\\Users\\me\\Videos" value="${escapeHtml(defaultValue || '')}"
                    style="width:100%; box-sizing:border-box; padding:11px 13px; border-radius:12px; border:1px solid var(--apple-border); background:rgba(255,255,255,0.06); color:var(--apple-text-main); font-size:14px; margin-bottom:16px; outline:none;" />
                <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="apple-btn apple-btn-glass" data-act="cancel2">取消</button>
                    <button class="apple-btn apple-btn-primary" data-act="ok">${I('check', 14)} 添加到资料库</button>
                </div>
            `, { width: 460 });

            const pathInput = inputModal.el.querySelector('[data-mf="manual-path"]');
            const submit = () => {
                const val = (pathInput.value || '').trim();
                inputModal.close();
                if (val) this.addFolder(val);
            };
            inputModal.el.querySelector('[data-act="ok"]').addEventListener('click', submit);
            inputModal.el.querySelector('[data-act="cancel2"]').addEventListener('click', () => inputModal.close());
            pathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
            setTimeout(() => { try { pathInput.focus(); } catch (e) {} }, 120);
        }

        // 客户端 Canvas 视频首帧提取兜底方案（当服务端缩略图 API 离线或不可达时自动触发）
        _extractVideoThumbnail(img, filePath) {
            try {
                if (AUDIO_RE.test(filePath)) {
                    img.style.display = 'none';
                    return;
                }
                const streamUrl = this.getApiUrl(`/api/stream?path=${encodeURIComponent(filePath)}`) + this._authQuery().replace(/^\?/, '&');
                const v = document.createElement('video');
                v.muted = true;
                v.playsInline = true;
                v.crossOrigin = 'anonymous';
                v.preload = 'metadata';
                v.src = streamUrl;

                let done = false;
                const finish = (success) => {
                    if (done) return;
                    done = true;
                    if (!success) {
                        img.style.display = 'none';
                    }
                    try { v.removeAttribute('src'); v.load(); } catch (e) {}
                };

                const timer = setTimeout(() => finish(false), 8000);

                const capture = () => {
                    try {
                        if (v.videoWidth && v.videoHeight) {
                            const c = document.createElement('canvas');
                            c.width = 320;
                            c.height = Math.round(320 * (v.videoHeight / v.videoWidth)) || 180;
                            const ctx = c.getContext('2d');
                            ctx.drawImage(v, 0, 0, c.width, c.height);
                            const dataUrl = c.toDataURL('image/jpeg', 0.8);
                            img.src = dataUrl;
                            img.style.display = '';
                            img.classList.add('loaded');
                            const ph = img.parentElement && img.parentElement.querySelector('[data-ph]');
                            if (ph) ph.style.display = 'none';
                            finish(true);
                        } else {
                            finish(false);
                        }
                    } catch (e) {
                        finish(false);
                    }
                };

                v.onloadedmetadata = () => {
                    try {
                        v.currentTime = Math.min(1.5, (v.duration || 10) * 0.1);
                    } catch (e) {
                        v.currentTime = 0.1;
                    }
                };

                v.onseeked = () => {
                    clearTimeout(timer);
                    capture();
                };

                v.onerror = () => {
                    clearTimeout(timer);
                    finish(false);
                };
            } catch (e) {
                img.style.display = 'none';
            }
        }

        _lazyThumbnails() {
            // 原生 loading="lazy" 与 onerror fallback 已接管缩略图加载
        }

        playAt(idx) {
            const item = this.currentMediaItems[idx];
            if (!item || !global.AppleMediaPlayer) return;
            const q = this._authQuery().replace(/^\?/, '&');
            const playlist = this.currentMediaItems.filter(f => MEDIA_RE.test(f.name)).map(f => ({
                name: f.name,
                path: f.path,
                type: AUDIO_RE.test(f.name) ? 'audio' : 'video',
                url: this.getApiUrl(`/api/stream?path=${encodeURIComponent(f.path)}`) + q
            }));
            const itemIndexInPlaylist = playlist.findIndex(p => p.path === item.path);
            // 非默认排序时保持用户当前看到的顺序作为连播次序
            global.AppleMediaPlayer.play(playlist[itemIndexInPlaylist >= 0 ? itemIndexInPlaylist : 0], playlist, { keepOrder: this.sortMode !== 'default' });
        }
    }

    let instance = null;

    MediaTheater.init = function (config) {
        if (!instance) instance = new MediaTheater(config);
        instance.restoreFolders();
        instance._updateSortLabel();
        instance._bindSortButton();
        return instance;
    };
    MediaTheater.scan = function () { if (instance) instance.scan(); };
    MediaTheater.refresh = function () { if (instance) instance.refresh(); };
    MediaTheater.pickFolder = function () { if (instance) instance.pickFolder(); };
    MediaTheater.addFolder = function (p) { if (instance) instance.addFolder(p); };
    MediaTheater.removeFolder = function (t) { if (instance) instance.removeFolder(t); };
    MediaTheater.openPath = function (p) { if (instance) instance.openPath(p); };
    MediaTheater.openRoot = function () { if (instance) instance.openRoot(); };
    MediaTheater.goUp = function () { return instance ? instance.goUp() : false; };
    MediaTheater.fallbackThumb = function (img, filePath) { if (instance) instance._extractVideoThumbnail(img, filePath); };
    MediaTheater.cycleSort = function () { return instance ? instance.cycleSort() : null; };
    MediaTheater.getSortInfo = function () { return instance ? instance.getSortInfo() : { mode: 'default', label: '默认' }; };
    MediaTheater.toggleHistory = function () { if (instance) instance.toggleHistoryView(); };

    global.MediaTheaterComponent = MediaTheater;
})(typeof window !== 'undefined' ? window : this);
