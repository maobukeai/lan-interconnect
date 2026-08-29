/**
 * 猫步互联 · 文件浏览器核心组件 (FileExplorer)
 * 磁盘列表、目录遍历、搜索、右键/长按菜单、删除/重命名/新建/分享、分片上传。
 * 依赖：shared/icons.js、shared/ui.js、file-batch.js、file-uploader.js、file-bookmarks.js
 */

(function (global) {
    'use strict';

    const I = (name, size) => (global.Icons ? global.Icons.render(name, size) : '');
    const UI = () => global.LanDiskUI || null;

    class FileExplorer {
        constructor(config = {}) {
            this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
            this.pathElement = typeof config.pathElement === 'string' ? document.querySelector(config.pathElement) : config.pathElement;
            this.searchInput = typeof config.searchInput === 'string' ? document.querySelector(config.searchInput) : config.searchInput;
            this.uploadInput = typeof config.uploadInput === 'string' ? document.querySelector(config.uploadInput) : config.uploadInput;

            this.apiFetch = config.apiFetch || window.fetch;
            this.getPin = config.getPin || (() => localStorage.getItem('lan_disk_pin') || '');
            this.onPlayMedia = config.onPlayMedia || null;
            this.onFileChanged = config.onFileChanged || null; // 增删改后回调（供页面刷新历史等）

            this.currentPath = '';
            this.isRoot = true;
            this.currentFiles = [];
            this.activeCategory = 'all'; // 'all' | 'video' | 'audio' | 'image' | 'doc' | 'archive'
            this.sortBy = 'name'; // 'name' | 'size' | 'time'
            this.sortOrder = 'asc';
            this.searchQuery = '';

            this.batchManager = new global.FileBatchManager({
                getPin: this.getPin.bind(this),
                getApiUrl: this.getApiUrl.bind(this),
                onSelectionChange: () => this.renderFiles(this.currentFiles)
            });

            this.uploader = new global.FileUploader({
                progressContainer: config.progressContainer || '#progress-container',
                progressFill: config.progressFill || '#progress-fill',
                progressText: config.progressText || '#progress-text',
                getPin: this.getPin.bind(this),
                getApiUrl: this.getApiUrl.bind(this),
                onFileStatus: config.onFileStatus || ((info) => {
                    // 供桌面端悬浮传输抽屉等全局监听者消费
                    if (typeof window.onTransferStatus === 'function') window.onTransferStatus(info);
                }),
                onUploadComplete: () => {
                    if (this.uploadInput) this.uploadInput.value = '';
                    this.loadPath(this.currentPath);
                    if (this.onFileChanged) this.onFileChanged('upload');
                }
            });

            this.bookmarksManager = new global.FileBookmarksManager({
                container: config.bookmarksContainer || '#web-bookmarks-list',
                onSelectPath: (p) => {
                    if (!p) this.loadDrives();
                    else this.loadPath(p);
                }
            });

            this._bindEvents();
            this._bindDragAndDrop();
            setTimeout(() => this.loadBookmarks(), 100);
        }

        getApiUrl(endpoint) {
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.api) {
                return global.LanDiskAuth.api(endpoint);
            }
            if (typeof window !== 'undefined') {
                const baseUrl = window.currentServerUrl || (typeof localStorage !== 'undefined' && localStorage.getItem('landisk_custom_server')) || '';
                if (baseUrl) return baseUrl.replace(/\/$/, '') + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
            }
            return endpoint;
        }

        _authHeaders(extra) {
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.authHeaders) {
                return global.LanDiskAuth.authHeaders(extra);
            }
            const headers = extra ? Object.assign({}, extra) : {};
            headers['x-pin'] = this.getPin();
            return headers;
        }

        _authQuery() {
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.authQuery) {
                return global.LanDiskAuth.authQuery();
            }
            const pin = this.getPin();
            return pin ? `?pin=${encodeURIComponent(pin)}` : '';
        }

        _toast(msg, type, duration) {
            const ui = UI();
            if (ui) ui.toast(msg, type, duration);
            else console.log(msg);
        }

        _bindEvents() {
            if (this.searchInput) {
                this.searchInput.addEventListener('input', (e) => {
                    this.searchQuery = e.target.value.toLowerCase().trim();
                    this.filterFiles(this.searchQuery);
                });
            }

            if (this.uploadInput) {
                this.uploadInput.addEventListener('change', (e) => {
                    this.uploader.uploadFiles(e.target.files, this.currentPath, this.isRoot);
                });
            }
        }

        _bindDragAndDrop() {
            if (!this.container) return;
            this.container.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.container.classList.add('drag-over');
            });

            this.container.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.container.classList.remove('drag-over');
            });

            this.container.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.container.classList.remove('drag-over');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.uploader.uploadFiles(e.dataTransfer.files, this.currentPath, this.isRoot);
                }
            });
        }

        formatBytes(bytes) {
            if (!+bytes) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
        }

        getFileIcon(name, isDir) {
            if (isDir) return { icon: 'folder', cls: 'dir' };
            if (/\.(mp4|mkv|webm|mov|avi)$/i.test(name)) return { icon: 'video', cls: 'media' };
            if (/\.(mp3|wav|flac|aac|m4a)$/i.test(name)) return { icon: 'music', cls: 'media' };
            if (/\.(jpg|png|gif|webp|svg|bmp|ico)$/i.test(name)) return { icon: 'image', cls: 'image' };
            if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return { icon: 'package', cls: 'zip' };
            if (/\.(txt|md|json|js|css|html|py|c|cpp|h|log|ini|conf|yaml|yml)$/i.test(name)) return { icon: 'fileText', cls: 'text' };
            return { icon: 'fileText', cls: '' };
        }

        async loadDrives(pushState = true) {
            this.batchManager.clear();
            if (typeof window !== 'undefined' && window.location.protocol === 'file:' && !window.isRunning) {
                if (this.container) {
                    this.container.innerHTML = this._emptyState('server', '服务未启动', '回到主页点击「启动服务」后即可浏览文件');
                }
                return;
            }

            this.isRoot = true;
            this.currentPath = '根目录';
            this.updatePathDisplay();

            if (pushState && typeof history !== 'undefined' && history.pushState && window.location.protocol !== 'file:') {
                history.pushState({ type: 'root' }, '', '#root');
            }

            try {
                const apiUrl = this.getApiUrl('/api/drives');
                const res = await fetch(apiUrl, { headers: this._authHeaders() });
                if (!res.ok) throw new Error('无法获取磁盘列表');
                const drives = await res.json();

                if (drives.length === 1 && drives[0].name.includes('共享')) {
                    this.loadPath(drives[0].path, pushState);
                    return;
                }

                this.renderDrives(drives);
            } catch (err) {
                if (this.container) {
                    this.container.innerHTML = this._emptyState('server', '无法连接服务', '请确认服务已启动');
                }
            }
        }

        _emptyState(icon, title, sub) {
            return `<div class="empty-state">${I(icon || 'folder', 34)}<div style="font-weight:600; color:var(--apple-text-muted)">${title}</div>${sub ? `<div style="font-size:12px">${sub}</div>` : ''}</div>`;
        }

        renderDrives(drives) {
            if (!this.container) return;
            if (!drives || drives.length === 0) {
                this.container.innerHTML = this._emptyState('drive', '暂无磁盘驱动器');
                return;
            }

            const driveCardsHtml = drives.map(drive => {
                const safePath = (global.escapeHtml || String)(drive.path);
                const isC = drive.path.toUpperCase().includes('C:');
                const spaceInfo = (drive.free || drive.total)
                    ? `可用 ${this.formatBytes(drive.free)} / 共 ${this.formatBytes(drive.total)}`
                    : '网络 / 逻辑存储卷';
                return `
                    <div class="apple-drive-card" data-path="${safePath}">
                        <div class="row">
                            <div class="apple-drive-icon-box">${I(isC ? 'drive' : 'server', 22)}</div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:600; font-size:14.5px; color:var(--apple-text-main)">${(global.escapeHtml || String)(drive.name)}</div>
                                <div style="font-size:11.5px; color:var(--apple-text-subtle); margin-top:2px;">${spaceInfo}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            this.container.innerHTML = `<div class="apple-drive-grid">${driveCardsHtml}</div>`;

            this.container.querySelectorAll('.apple-drive-card').forEach(card => {
                card.addEventListener('click', () => {
                    this.loadPath(card.getAttribute('data-path'));
                });
            });
        }

        async loadPath(path, pushState = true) {
            try {
                this.batchManager.clear();
                const apiUrl = this.getApiUrl(`/api/files?path=${encodeURIComponent(path)}`);
                const res = await fetch(apiUrl, { headers: this._authHeaders() });
                if (!res.ok) throw new Error('无法访问该路径或没有权限');
                const data = await res.json();

                this.isRoot = false;
                this.currentPath = data.currentPath;
                this.currentFiles = data.files || [];
                this.updatePathDisplay();
                this.renderFiles(this.currentFiles);
                if (data.truncated) {
                    this._toast('目录条目过多，仅显示前 5000 项', 'info', 4000);
                }

                if (pushState && typeof history !== 'undefined' && history.pushState && window.location.protocol !== 'file:') {
                    history.pushState({ type: 'dir', path: data.currentPath }, '', '#path=' + encodeURIComponent(data.currentPath));
                }
            } catch (err) {
                this._toast(err.message || '加载路径失败', 'error');
                this.goUp(pushState);
            }
        }

        updatePathDisplay() {
            if (!this.pathElement) return;
            if (this.isRoot || !this.currentPath || this.currentPath === '根目录') {
                this.pathElement.innerHTML = '<span class="breadcrumb-item" style="font-weight:600; color:var(--apple-text-main)">根目录</span>';
                return;
            }

            const parts = this.currentPath.split(/[\\/]/).filter(p => p);
            let accumPath = '';
            const breadcrumbHtml = parts.map((part, idx) => {
                if (idx === 0 && part.endsWith(':')) {
                    accumPath = part + '\\';
                } else {
                    accumPath += (accumPath.endsWith('\\') || accumPath.endsWith('/') ? '' : '\\') + part;
                }
                const safePath = (global.escapeHtml || String)(accumPath);
                const isLast = idx === parts.length - 1;
                if (isLast) {
                    return `<span class="breadcrumb-item" style="font-weight:600; color:var(--apple-text-main)">${(global.escapeHtml || String)(part)}</span>`;
                }
                return `<span class="breadcrumb-item" data-path="${safePath}" style="color:var(--apple-system-blue); cursor:pointer">${(global.escapeHtml || String)(part)}</span><span class="subtle"> / </span>`;
            }).join('');

            this.pathElement.innerHTML = breadcrumbHtml;
            this.pathElement.querySelectorAll('.breadcrumb-item[data-path]').forEach(el => {
                el.addEventListener('click', () => {
                    this.loadPath(el.getAttribute('data-path'));
                });
            });
            setTimeout(() => {
                if (this.pathElement) this.pathElement.scrollLeft = this.pathElement.scrollWidth;
            }, 50);
        }

        loadBookmarks() { this.bookmarksManager.loadBookmarks(); }
        addBookmark() { this.bookmarksManager.addBookmark(this.currentPath, this.isRoot); }
        removeBookmark(idx) { this.bookmarksManager.removeBookmark(idx); }

        filterFiles(keyword) {
            if (!keyword) {
                this.renderFiles(this.currentFiles);
                return;
            }
            const filtered = this.currentFiles.filter(f => f.name.toLowerCase().includes(keyword));
            this.renderFiles(filtered);
        }

        isSystemHidden(name) {
            if (!name) return false;
            const systemHiddenList = [
                '$recycle.bin', 'system volume information', 'recovery',
                'config.msi', 'programdata', 'dumpstack.log.tmp',
                'pagefile.sys', 'hiberfil.sys', 'swapfile.sys'
            ];
            return systemHiddenList.includes(name.toLowerCase());
        }

        /* ---------- 文件操作：新建 / 重命名 / 删除 / 分享 ---------- */

        async newFolder() {
            if (this.isRoot || !this.currentPath) {
                this._toast('请先进入一个磁盘目录', 'info');
                return;
            }
            const ui = UI();
            const name = ui
                ? await ui.promptDialog({ title: '新建文件夹', message: '在当前目录创建：', placeholder: '文件夹名称', confirmText: '创建' })
                : global.prompt('请输入新文件夹名称:');
            if (!name || !name.trim()) return;

            try {
                const res = await fetch(this.getApiUrl('/api/mkdir'), {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ path: this.currentPath, name: name.trim() })
                });
                const data = await res.json();
                if (data.success) {
                    this._toast('文件夹已创建', 'success');
                    this.loadPath(this.currentPath, false);
                } else {
                    this._toast(data.error || '创建失败', 'error');
                }
            } catch (e) {
                this._toast('创建失败：' + e.message, 'error');
            }
        }

        async renameFile(path, currentName) {
            const ui = UI();
            const newName = ui
                ? await ui.promptDialog({ title: '重命名', value: currentName, confirmText: '重命名' })
                : global.prompt('输入新名称:', currentName);
            if (!newName || !newName.trim() || newName.trim() === currentName) return;

            try {
                const res = await fetch(this.getApiUrl('/api/rename'), {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ path, newName: newName.trim() })
                });
                const data = await res.json();
                if (data.success) {
                    this._toast('已重命名', 'success');
                    this.loadPath(this.currentPath, false);
                    if (this.onFileChanged) this.onFileChanged('rename');
                } else {
                    this._toast(data.error || '重命名失败', 'error');
                }
            } catch (e) {
                this._toast('重命名失败：' + e.message, 'error');
            }
        }

        async deleteFile(path, name) {
            const ui = UI();
            const ok = ui
                ? await ui.confirmDialog({ title: `移入回收站`, message: `「${name}」将被移入回收站，可随时恢复。`, confirmText: '删除', danger: true })
                : global.confirm(`确定删除「${name}」？(将移入回收站)`);
            if (!ok) return;

            try {
                const res = await fetch(this.getApiUrl(`/api/files?path=${encodeURIComponent(path)}`), {
                    method: 'DELETE',
                    headers: this._authHeaders()
                });
                const data = await res.json();
                if (data.success) {
                    this._toast('已移入回收站', 'success');
                    this.loadPath(this.currentPath, false);
                    if (this.onFileChanged) this.onFileChanged('delete');
                } else {
                    this._toast(data.error || '删除失败', 'error');
                }
            } catch (e) {
                this._toast('删除失败：' + e.message, 'error');
            }
        }

        async shareFile(path, name) {
            const ui = UI();
            if (!ui) return;

            const modal = ui.openModal(`
                <div class="modal-title">分享文件</div>
                <div class="modal-message ellipsis" style="max-width:100%">${(global.escapeHtml || String)(name)}</div>
                <div class="segmented" style="margin: 0 auto 18px; display:flex" id="share-hours">
                    <button class="segmented-item" data-h="1">1时</button>
                    <button class="segmented-item active" data-h="6">6时</button>
                    <button class="segmented-item" data-h="24">24时</button>
                    <button class="segmented-item" data-h="168">7天</button>
                </div>
                <div class="modal-actions">
                    <button class="apple-btn apple-btn-glass" data-act="cancel">取消</button>
                    <button class="apple-btn apple-btn-primary" data-act="create">${I('qr', 16)} 生成链接</button>
                </div>
            `, { width: 380 });

            let hours = 6;
            modal.el.querySelectorAll('#share-hours .segmented-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    modal.el.querySelectorAll('#share-hours .segmented-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    hours = parseInt(btn.getAttribute('data-h'), 10);
                });
            });
            modal.el.querySelector('[data-act="cancel"]').addEventListener('click', () => modal.close());

            modal.el.querySelector('[data-act="create"]').addEventListener('click', async () => {
                try {
                    const res = await fetch(this.getApiUrl('/api/share'), {
                        method: 'POST',
                        headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ path, expireHours: hours })
                    });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.error || '生成失败');

                    const expires = new Date(data.expiresAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    modal.el.innerHTML = `
                        <div class="modal-title">分享就绪</div>
                        <div style="display:grid; place-items:center; margin:18px 0 6px">
                            <div class="qr-box"><img src="${data.qrDataUrl}" alt="二维码"></div>
                        </div>
                        <div class="apple-input-box mono" style="margin:10px 0 4px; font-size:11.5px">
                            <span class="ellipsis" style="flex:1">${(global.escapeHtml || String)(data.shareUrl)}</span>
                        </div>
                        <div class="subtle" style="font-size:11.5px; text-align:center; margin-bottom:16px">
                            扫码或打开链接直接下载 · ${expires} 前有效
                        </div>
                        <div class="modal-actions">
                            <button class="apple-btn apple-btn-glass" data-act="close">关闭</button>
                            <button class="apple-btn apple-btn-primary" data-act="copy">${I('copy', 16)} 复制链接</button>
                        </div>
                    `;
                    modal.el.querySelector('[data-act="close"]').addEventListener('click', () => modal.close());
                    modal.el.querySelector('[data-act="copy"]').addEventListener('click', async () => {
                        try {
                            await navigator.clipboard.writeText(data.shareUrl);
                            this._toast('链接已复制', 'success');
                        } catch (e) {
                            this._toast('复制失败，请手动复制', 'error');
                        }
                    });
                } catch (e) {
                    this._toast(e.message, 'error');
                    modal.close();
                }
            });
        }

        /* ---------- 渲染 ---------- */

        
        applyFilterAndSort(files) {
            let result = (files || []).filter(f => !this.isSystemHidden(f.name));

            // 1. 分类过滤
            if (this.activeCategory !== 'all') {
                const catMap = {
                    video: /\.(mp4|mkv|webm|mov|avi|flv|wmv)$/i,
                    audio: /\.(mp3|wav|flac|aac|ogg|m4a)$/i,
                    image: /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i,
                    doc: /\.(txt|md|pdf|doc|docx|xls|xlsx|ppt|pptx|json|js|html|css|py|c|cpp|h)$/i,
                    archive: /\.(zip|rar|7z|tar|gz|bz2|iso)$/i
                };
                const reg = catMap[this.activeCategory];
                if (reg) {
                    result = result.filter(f => f.isDirectory || reg.test(f.name));
                }
            }

            // 2. 搜索关键字过滤
            if (this.currentFilterKeyword) {
                const kw = this.currentFilterKeyword.toLowerCase();
                result = result.filter(f => f.name.toLowerCase().includes(kw));
            }

            // 3. 排序 (文件夹始终排在前面)
            result.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;

                let diff = 0;
                if (this.sortBy === 'name') {
                    diff = a.name.localeCompare(b.name, 'zh-CN');
                } else if (this.sortBy === 'size') {
                    diff = (a.size || 0) - (b.size || 0);
                } else if (this.sortBy === 'time') {
                    diff = new Date(a.mtime || 0) - new Date(b.mtime || 0);
                }
                return this.sortOrder === 'asc' ? diff : -diff;
            });

            return result;
        }

        renderFiles(files) {
            if (!this.container) return;

            const validFiles = this.applyFilterAndSort(files);

            if (!validFiles || validFiles.length === 0) {
                this.container.innerHTML = this._emptyState('folder', '文件夹为空', '拖入文件即可上传到此处');
                return;
            }

            const escapeHtml = global.escapeHtml || (str => typeof str === 'string' ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : str);

            this.container.innerHTML = `<div class="apple-file-grid">` + validFiles.map(file => {
                const safePath = escapeHtml(file.path);
                const safeName = escapeHtml(file.name);
                const isDir = file.isDirectory;
                const isChecked = this.batchManager.has(file.path);
                const iconDef = this.getFileIcon(file.name, isDir);

                let actionBtns = '';
                if (isDir) {
                    actionBtns += `<button class="apple-btn apple-btn-glass apple-btn-sm btn-action-zip-folder" data-path="${safePath}" data-name="${safeName}" title="打包下载">${I('package', 14)}</button>`;
                } else {
                    if (/\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i.test(file.name)) {
                        const mediaType = /\.(mp3|wav|flac|aac|m4a)$/i.test(file.name) ? 'audio' : 'video';
                        actionBtns += `<button class="apple-btn apple-btn-glass apple-btn-sm btn-action-play" data-type="${mediaType}" data-path="${safePath}" data-name="${safeName}" title="播放">${I('play', 14)}</button>`;
                    } else if (/\.(jpg|png|gif|webp|svg)$/i.test(file.name)) {
                        actionBtns += `<button class="apple-btn apple-btn-glass apple-btn-sm btn-action-play" data-type="image" data-path="${safePath}" data-name="${safeName}" title="预览">${I('eye', 14)}</button>`;
                    } else if (/\.(txt|md|js|json|html|css|py|c|cpp|h)$/i.test(file.name)) {
                        actionBtns += `<button class="apple-btn apple-btn-glass apple-btn-sm btn-action-play" data-type="text" data-path="${safePath}" data-name="${safeName}" title="查看">${I('fileText', 14)}</button>`;
                    }
                    actionBtns += `<button class="apple-btn apple-btn-glass apple-btn-sm btn-action-download" data-path="${safePath}" title="下载">${I('download', 14)}</button>`;
                }

                return `
                    <div class="apple-file-card ${isChecked ? 'selected' : ''}" data-is-dir="${isDir}" data-path="${safePath}" data-idx="${validFiles.indexOf(file)}">
                        <div class="file-card-main">
                            <input type="checkbox" class="apple-checkbox cb-file-select" data-path="${safePath}" ${isChecked ? 'checked' : ''}>
                            <div class="file-icon ${iconDef.cls}">${I(iconDef.icon, 19)}</div>
                            <div style="flex:1; min-width:0;">
                                <div class="file-name">${safeName}</div>
                                <div class="file-meta">${isDir ? '文件夹' : this.formatBytes(file.size)} · ${new Date(file.mtime).toLocaleDateString('zh-CN')}</div>
                            </div>
                        </div>
                        ${actionBtns ? `<div class="file-actions">${actionBtns}</div>` : ''}
                    </div>
                `;
            }).join('') + `</div>`;

            this.container.querySelectorAll('.cb-file-select').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const path = cb.getAttribute('data-path');
                    if (cb.checked) this.batchManager.add(path);
                    else this.batchManager.delete(path);
                });
                cb.addEventListener('click', (e) => e.stopPropagation());
            });

            this.container.querySelectorAll('.apple-file-card').forEach(card => {
                const isDir = card.getAttribute('data-is-dir') === 'true';
                const path = card.getAttribute('data-path'); // 浏览器已解码实体，得到原始路径
                const idx = parseInt(card.getAttribute('data-idx'), 10);
                const fileObj = validFiles[idx];
                const rawName = fileObj ? fileObj.name : path;

                card.addEventListener('click', (e) => {
                    if (e.target.closest('.apple-btn') || e.target.closest('.apple-checkbox')) return;
                    if (isDir) {
                        this.loadPath(path);
                    } else {
                        this.openFile(path, rawName);
                    }
                });

                // 右键 / 长按菜单
                if (global.LanDiskUI && global.LanDiskUI.bindContextMenu) {
                    global.LanDiskUI.bindContextMenu(card, () => this._fileMenuItems(card, isDir, path, rawName));
                }
            });

            this.container.querySelectorAll('.btn-action-zip-folder').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.batchManager.downloadZip([btn.getAttribute('data-path')], btn.getAttribute('data-name') || 'folder_download');
                });
            });

            this.container.querySelectorAll('.btn-action-play').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.onPlayMedia) {
                        this.onPlayMedia(btn.getAttribute('data-type'), btn.getAttribute('data-path'), btn.getAttribute('data-name'), this.currentFiles);
                    }
                });
            });

            this.container.querySelectorAll('.btn-action-download').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleSingleDownload(btn.getAttribute('data-path'));
                });
            });
        }

        _fileMenuItems(card, isDir, path, name) {
            const items = [];
            if (isDir) {
                items.push({ icon: 'chevronRight', label: '打开', onClick: () => this.loadPath(path) });
                items.push({ icon: 'package', label: '打包下载', onClick: () => this.batchManager.downloadZip([path], name || 'folder_download') });
            } else {
                if (/\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i.test(name)) {
                    items.push({ icon: 'play', label: '播放', onClick: () => this.openFile(path, name) });
                } else if (/\.(jpg|png|gif|webp|svg)$/i.test(name)) {
                    items.push({ icon: 'eye', label: '预览', onClick: () => this.openFile(path, name) });
                } else if (/\.(txt|md|js|json|html|css|py|c|cpp|h)$/i.test(name)) {
                    items.push({ icon: 'fileText', label: '查看', onClick: () => this.openFile(path, name) });
                }
                items.push({ icon: 'download', label: '下载', onClick: () => this.handleSingleDownload(path) });
            }
            items.push({ icon: 'qr', label: '分享…', onClick: () => this.shareFile(path, name) });
            items.push({ icon: 'pencil', label: '重命名', onClick: () => this.renameFile(path, name) });
            items.push({
                icon: 'copy', label: '复制路径', onClick: async () => {
                    try { await navigator.clipboard.writeText(path); this._toast('路径已复制', 'success'); }
                    catch (e) { this._toast('复制失败', 'error'); }
                }
            });
            items.push('divider');
            items.push({ icon: 'trash', label: '删除（移入回收站）', danger: true, onClick: () => this.deleteFile(path, name) });
            return items;
        }

        openFile(path, fileName) {
            if (/\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i.test(fileName)) {
                const mediaType = /\.(mp3|wav|flac|aac|m4a)$/i.test(fileName) ? 'audio' : 'video';
                if (this.onPlayMedia) this.onPlayMedia(mediaType, path, fileName, this.currentFiles);
            } else if (/\.(jpg|png|gif|webp|svg|bmp|ico)$/i.test(fileName)) {
                if (this.onPlayMedia) this.onPlayMedia('image', path, fileName, this.currentFiles);
            } else if (/\.(txt|md|js|json|html|css|py|c|cpp|h|log|ini|conf|yaml|yml)$/i.test(fileName)) {
                if (this.onPlayMedia) this.onPlayMedia('text', path, fileName, this.currentFiles);
            } else {
                this.handleSingleDownload(path);
            }
        }

        handleSingleDownload(path) {
            const downloadUrl = this.getApiUrl(`/api/download?path=${encodeURIComponent(path)}${this._authQuery().replace(/^\?/, '&')}`);
            if (global.LanDiskUI && global.LanDiskUI.downloadUrl) {
                global.LanDiskUI.downloadUrl(downloadUrl, path.split(/[\\/]/).pop());
            } else {
                window.open(downloadUrl, '_blank');
            }
        }

        goUp(pushState = true) {
            if (this.isRoot) return;
            const parts = this.currentPath.split(/[\\/]/).filter(p => p);
            if (parts.length <= 1) {
                this.loadDrives(pushState);
            } else {
                parts.pop();
                const parentPath = parts.join('\\') + '\\';
                this.loadPath(parentPath, pushState);
            }
        }

        refresh() {
            if (this.isRoot) {
                this.loadDrives(false);
            } else {
                this.loadPath(this.currentPath, false);
            }
        }
    }

    let instance = null;

    FileExplorer.init = function (containerId, pathId) {
        if (instance) {
            instance.refresh();
            return instance;
        }
        instance = new FileExplorer({
                container: typeof containerId === 'string' ? '#' + containerId : containerId,
                pathElement: typeof pathId === 'string' ? '#' + pathId : pathId,
                searchInput: '#search-input',
                uploadInput: '#file-input',
                progressContainer: '#progress-container',
                progressFill: '#progress-fill',
                progressText: '#progress-text',
                onFileChanged: (kind) => {
                    if (typeof window.onFileActivity === 'function') window.onFileActivity(kind);
                },
                onPlayMedia: (type, path, name, playlist) => {
                    if (window.MediaHubInstance && typeof window.MediaHubInstance.playMedia === 'function') {
                        window.MediaHubInstance.playMedia(type, path, name, playlist);
                        return;
                    }
                    const authQ = () => (window.LanDiskAuth && LanDiskAuth.authQuery()) ? LanDiskAuth.authQuery().replace(/^\?/, '&') : `&pin=${encodeURIComponent(localStorage.getItem('lan_disk_pin') || '')}`;
                    const getUrl = (p) => {
                        if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
                            const baseUrl = window.currentServerUrl || 'http://localhost:3000';
                            return baseUrl.replace(/\/$/, '') + p;
                        }
                        return p;
                    };
                    if (type === 'audio' || type === 'video') {
                        const formattedPlaylist = (playlist || [])
                            .filter(f => !f.isDirectory && /\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i.test(f.name))
                            .map(f => ({
                                name: f.name,
                                path: f.path,
                                type: /\.(mp3|wav|flac|aac|m4a)$/i.test(f.name) ? 'audio' : 'video',
                                url: getUrl(`/api/stream?path=${encodeURIComponent(f.path)}${authQ()}`)
                            }));
                        if (window.AppleMediaPlayer && typeof window.AppleMediaPlayer.play === 'function') {
                            window.AppleMediaPlayer.play({ name, path, type, url: getUrl(`/api/stream?path=${encodeURIComponent(path)}${authQ()}`) }, formattedPlaylist);
                        }
                    } else if (type === 'image') {
                        const imgEl = document.getElementById('image-viewer');
                        const modalEl = document.getElementById('image-modal');
                        const titleEl = document.getElementById('image-gallery-title');
                        if (titleEl) titleEl.textContent = name;
                        if (imgEl && modalEl) {
                            imgEl.src = getUrl(`/api/stream?path=${encodeURIComponent(path)}${authQ()}`);
                            modalEl.style.display = 'flex';
                        }
                    } else if (type === 'text') {
                        const titleEl = document.getElementById('text-title');
                        const viewerEl = document.getElementById('text-viewer');
                        const modalEl = document.getElementById('text-modal');
                        fetch(getUrl(`/api/read-text?path=${encodeURIComponent(path)}${authQ()}`), { headers: (window.LanDiskAuth ? LanDiskAuth.authHeaders() : {}) })
                            .then(r => r.json())
                            .then(data => {
                                if (titleEl) titleEl.textContent = name;
                                if (viewerEl) viewerEl.textContent = data.content || data.error || '';
                                if (modalEl) modalEl.style.display = 'flex';
                            })
                            .catch(() => {});
                    }
                }
            });
        instance.loadDrives(false);
    };
    FileExplorer.loadDrives = function(pushState) { if (instance) instance.loadDrives(pushState); };
    FileExplorer.loadPath = function(p, pushState) { if (instance) instance.loadPath(p, pushState); };
    FileExplorer.goUp = function(pushState) { if (instance) instance.goUp(pushState); };
    FileExplorer.refresh = function() { if (instance) instance.refresh(); };
    FileExplorer.filterFiles = function(kw) { if (instance) instance.filterFiles(kw); };
    FileExplorer.uploadFiles = function(files) { if (instance) instance.uploader.uploadFiles(files, instance.currentPath, instance.isRoot); };
    FileExplorer.addBookmark = function() { if (instance) instance.addBookmark(); };
    FileExplorer.removeBookmark = function(idx) { if (instance) instance.removeBookmark(idx); };
    FileExplorer.loadBookmarks = function() { if (instance) instance.loadBookmarks(); };
    FileExplorer.newFolder = function() { if (instance) return instance.newFolder(); };
    FileExplorer.shareFile = function(path, name) { if (instance) return instance.shareFile(path, name); };
    FileExplorer.getInstance = function() { return instance; };

    
    FileExplorer.setCategory = function(cat) {
        if (instance) {
            instance.activeCategory = cat;
            instance.renderFiles(instance.currentFiles);
        }
    };
    FileExplorer.setSort = function(by) {
        if (instance) {
            if (instance.sortBy === by) {
                instance.sortOrder = instance.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                instance.sortBy = by;
                instance.sortOrder = 'asc';
            }
            instance.renderFiles(instance.currentFiles);
            return { sortBy: instance.sortBy, sortOrder: instance.sortOrder };
        }
        return { sortBy: by, sortOrder: 'asc' };
    };

    global.FileExplorerComponent = FileExplorer;

})(typeof window !== 'undefined' ? window : this);
