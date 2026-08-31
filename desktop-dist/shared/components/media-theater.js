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
            this.viewMode = localStorage.getItem('landisk_media_view_mode') || 'tree'; // 'tree' | 'flat'
            this.currentMediaItems = []; // 当前目录或平铺下的媒体文件
            this.isScanning = false;
            this.progressMap = {};
            this._navSeq = 0; // 导航序号：防止慢响应覆盖用户最新打开的目录
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
                const card = img.closest('.poster-card');
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
        // 每个目录只预取一次，>1GB 不预取（无谓占用缓存）
        _prewarmFirstVideo() {
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
                            localStorage.setItem('landisk_media_view_mode', nextMode);
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
            await this._fetchProgress();

            if (this.grid) {
                let html = `
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

                // 区分文件夹与媒体文件
                const subDirs = allFiles.filter(f => f.isDirectory && !/^[.#]/.test(f.name));
                const mediaFiles = allFiles.filter(f => !f.isDirectory && MEDIA_RE.test(f.name));

                this.currentMediaItems = mediaFiles;
                this._prewarmFirstVideo();
                this._renderBreadcrumbsFromPath(folderPath);
                await this._fetchProgress();

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
                }

                if (this.grid) {
                    this.grid.innerHTML = html;
                    this._bindGridActions();
                }

            } catch (err) {
                if (this.grid) {
                    this.grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">加载失败: ${escapeHtml(err.message)}</div>`;
                }
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

            const walk = async (dir, depth) => {
                if (depth > 4 || found.length >= 800 || visitedDirs.has(dir)) return;
                visitedDirs.add(dir);
                try {
                    const res = await fetch(this.getApiUrl(`/api/files?path=${encodeURIComponent(dir)}`), { headers: this._authHeaders() });
                    if (!res.ok) return;
                    const data = await res.json();
                    for (const f of (data.files || [])) {
                        if (found.length >= 800) break;
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

            this.currentMediaItems = found;
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
            await this._fetchProgress();

            const q = this._authQuery().replace(/^\?/, '&');

            if (this.grid) {
                this.grid.innerHTML = found.map((f, i) => {
                    const isAudio = AUDIO_RE.test(f.name);
                    const prog = this.progressMap[f.path];
                    const percentage = prog ? (prog.percentage || 0) : 0;
                    const thumbUrl = this.getApiUrl(`/api/thumbnail?path=${encodeURIComponent(f.path)}`) + q;

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
                this._bindGridActions();
            }
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
            global.AppleMediaPlayer.play(playlist[itemIndexInPlaylist >= 0 ? itemIndexInPlaylist : 0], playlist);
        }
    }

    let instance = null;

    MediaTheater.init = function (config) {
        if (!instance) instance = new MediaTheater(config);
        instance.restoreFolders();
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

    global.MediaTheaterComponent = MediaTheater;
})(typeof window !== 'undefined' ? window : this);
