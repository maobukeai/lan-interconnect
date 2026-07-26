/**
 * 局域网互联 Pro - 文件浏览器核心组件 (FileExplorer)
 * 职责：处理磁盘列表、目录遍历、面包屑、搜索过滤及文件列表渲染。
 * 遵循无全局变量污染、高扩展性设计。
 */

(function (global) {
    'use strict';

    class FileExplorer {
        constructor(config = {}) {
            this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
            this.pathElement = typeof config.pathElement === 'string' ? document.querySelector(config.pathElement) : config.pathElement;
            this.searchInput = typeof config.searchInput === 'string' ? document.querySelector(config.searchInput) : config.searchInput;
            this.uploadInput = typeof config.uploadInput === 'string' ? document.querySelector(config.uploadInput) : config.uploadInput;

            this.apiFetch = config.apiFetch || window.fetch;
            this.getPin = config.getPin || (() => localStorage.getItem('lan_disk_pin') || '');
            this.onPlayMedia = config.onPlayMedia || null;

            this.currentPath = '';
            this.isRoot = true;
            this.currentFiles = [];
            this.searchQuery = '';

            // 子模块管理对象
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
                onUploadComplete: () => {
                    if (this.uploadInput) this.uploadInput.value = '';
                    this.loadPath(this.currentPath);
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
            if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
                const baseUrl = window.currentServerUrl || 'http://localhost:3000';
                return baseUrl.replace(/\/$/, '') + endpoint;
            }
            return endpoint;
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
            const dm = 1;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
        }

        getFileIcon(name, isDir) {
            if (isDir) return '📁';
            if (/\.(mp4|mkv|webm|mov|avi)$/i.test(name)) return '🎬';
            if (/\.(jpg|png|gif|webp|svg)$/i.test(name)) return '🖼️';
            if (/\.(mp3|wav|flac|aac|m4a)$/i.test(name)) return '🎵';
            if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return '📦';
            if (/\.(txt|md|json|js|css|html|py|c|cpp|h)$/i.test(name)) return '📄';
            return '📎';
        }

        async loadDrives(pushState = true) {
            this.batchManager.clear();
            if (typeof window !== 'undefined' && window.location.protocol === 'file:' && !window.isRunning) {
                if (this.container) {
                    this.container.innerHTML = '<div style="padding:30px; text-align:center; color:var(--apple-text-muted);">请先在“控制中心”面板中启动服务</div>';
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
                const pin = this.getPin();
                const apiUrl = this.getApiUrl('/api/drives');
                const res = await fetch(apiUrl, { headers: { 'x-pin': pin } });
                if (!res.ok) throw new Error('无法获取磁盘列表');
                const drives = await res.json();

                if (drives.length === 1 && drives[0].name.includes('共享')) {
                    this.loadPath(drives[0].path, pushState);
                    return;
                }

                this.renderDrives(drives);
            } catch (err) {
                if (this.container) {
                    this.container.innerHTML = `<div style="padding:30px; text-align:center; color:var(--apple-text-muted);">请先在“控制中心”面板中启动服务</div>`;
                }
            }
        }

        renderDrives(drives) {
            if (!this.container) return;
            if (!drives || drives.length === 0) {
                this.container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--apple-text-muted);">暂无磁盘驱动器</div>';
                return;
            }

            const driveCardsHtml = drives.map(drive => {
                const safePath = drive.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const isC = drive.path.toUpperCase().includes('C:');
                const iconSvg = isC ? '💾' : (drive.name.includes('共享') ? '📁' : '💽');
                const badgeText = isC ? '主系统固态盘' : '本地逻辑存储卷';
                return `
                    <div class="apple-drive-card" data-path="${safePath}">
                        <div style="display:flex; align-items:center; gap:16px;">
                            <div class="apple-drive-icon-box">${iconSvg}</div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:700; font-size:15px; color:var(--apple-text-main); font-family:var(--apple-font);">${drive.name}</div>
                                <div style="font-size:11px; color:var(--apple-text-muted); margin-top:2px;">${badgeText} • NTFS / FAT32</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            this.container.innerHTML = `<div class="apple-drive-grid">${driveCardsHtml}</div>`;

            this.container.querySelectorAll('.apple-drive-card').forEach(card => {
                card.addEventListener('click', () => {
                    const path = card.getAttribute('data-path');
                    this.loadPath(path);
                });
            });
        }

        async loadPath(path, pushState = true) {
            try {
                this.batchManager.clear();
                const pin = this.getPin();
                const apiUrl = this.getApiUrl(`/api/files?path=${encodeURIComponent(path)}`);
                const res = await fetch(apiUrl, { headers: { 'x-pin': pin } });
                if (!res.ok) throw new Error('无法访问该路径或没有权限');
                const data = await res.json();

                this.isRoot = false;
                this.currentPath = data.currentPath;
                this.currentFiles = data.files || [];
                this.updatePathDisplay();
                this.renderFiles(this.currentFiles);

                if (pushState && typeof history !== 'undefined' && history.pushState && window.location.protocol !== 'file:') {
                    history.pushState({ type: 'dir', path: data.currentPath }, '', '#path=' + encodeURIComponent(data.currentPath));
                }
            } catch (err) {
                alert(err.message || '加载路径失败');
                this.goUp(pushState);
            }
        }

        updatePathDisplay() {
            if (!this.pathElement) return;
            if (this.isRoot || !this.currentPath || this.currentPath === '根目录') {
                this.pathElement.innerHTML = '<span class="breadcrumb-item active" style="color:white; font-weight:600;">根目录</span>';
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
                const safePath = accumPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const isLast = idx === parts.length - 1;
                if (isLast) {
                    return `<span class="breadcrumb-item active" style="color:white; font-weight:600;">${part}</span>`;
                }
                return `<span class="breadcrumb-item" data-path="${safePath}" style="color:var(--apple-system-blue); cursor:pointer; text-decoration:underline;">${part}</span> <span style="color:var(--apple-text-muted);">/</span> `;
            }).join('');

            this.pathElement.innerHTML = breadcrumbHtml;
            this.pathElement.querySelectorAll('.breadcrumb-item[data-path]').forEach(el => {
                el.addEventListener('click', () => {
                    const targetPath = el.getAttribute('data-path');
                    this.loadPath(targetPath);
                });
            });
        }

        loadBookmarks() {
            this.bookmarksManager.loadBookmarks();
        }

        addBookmark() {
            this.bookmarksManager.addBookmark(this.currentPath, this.isRoot);
        }

        removeBookmark(idx) {
            this.bookmarksManager.removeBookmark(idx);
        }

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

        renderFiles(files) {
            if (!this.container) return;

            const validFiles = (files || []).filter(f => !this.isSystemHidden(f.name));

            if (!validFiles || validFiles.length === 0) {
                this.container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--apple-text-muted);">文件夹为空</div>';
                return;
            }

            const pin = this.getPin();

            this.container.innerHTML = validFiles.map(file => {
                const safePath = file.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const safeName = file.name.replace(/'/g, "\\'");
                const isDir = file.isDirectory;
                const isChecked = this.batchManager.has(file.path);

                let actionBtns = '';
                if (isDir) {
                    actionBtns += `<button class="apple-btn apple-btn-glass btn-action-zip-folder" data-path="${safePath}" data-name="${safeName}" style="padding:3px 8px; font-size:11px;">📦 打包</button>`;
                } else {
                    if (/\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i.test(file.name)) {
                        const mediaType = /\.(mp3|wav|flac|aac|m4a)$/i.test(file.name) ? 'audio' : 'video';
                        actionBtns += `<button class="apple-btn apple-btn-primary btn-action-play" data-type="${mediaType}" data-path="${safePath}" data-name="${safeName}" style="padding:3px 8px; font-size:11px;">▶ 播放</button>`;
                    } else if (/\.(jpg|png|gif|webp|svg)$/i.test(file.name)) {
                        actionBtns += `<button class="apple-btn apple-btn-glass btn-action-play" data-type="image" data-path="${safePath}" data-name="${safeName}" style="padding:3px 8px; font-size:11px;">预览</button>`;
                    } else if (/\.(txt|md|js|json|html|css|py|c|cpp|h)$/i.test(file.name)) {
                        actionBtns += `<button class="apple-btn apple-btn-glass btn-action-play" data-type="text" data-path="${safePath}" data-name="${safeName}" style="padding:3px 8px; font-size:11px;">查看</button>`;
                    }
                    actionBtns += `<button class="apple-btn apple-btn-glass btn-action-download" data-path="${safePath}" style="padding:3px 8px; font-size:11px;">下载</button>`;
                }

                const icon = this.getFileIcon(file.name, isDir);
                const bgGlow = isDir ? 'background:rgba(255,149,0,0.12); color:var(--apple-system-orange);' : 'background:rgba(0,122,255,0.12); color:var(--apple-system-blue);';

                return `
                    <div class="apple-file-card" data-is-dir="${isDir}" data-path="${safePath}" style="background:rgba(255,255,255,0.04); border:1px solid ${isChecked ? 'var(--apple-system-blue)' : 'var(--apple-border)'}; border-radius:12px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; transition:var(--apple-transition); margin-bottom:8px; cursor:pointer;">
                        <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                            <input type="checkbox" class="apple-checkbox cb-file-select" data-path="${safePath}" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation()">
                            <div style="width:36px; height:36px; border-radius:10px; ${bgGlow} display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">${icon}</div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:600; font-size:14px; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${file.name}</div>
                                <div style="font-size:11px; color:var(--apple-text-subtle); margin-top:2px;">${isDir ? '文件夹' : this.formatBytes(file.size)}</div>
                            </div>
                        </div>
                        ${actionBtns ? `<div style="display:flex; gap:6px; flex-shrink:0;">${actionBtns}</div>` : ''}
                    </div>
                `;
            }).join('');

            this.container.querySelectorAll('.cb-file-select').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const path = cb.getAttribute('data-path');
                    if (cb.checked) {
                        this.batchManager.add(path);
                    } else {
                        this.batchManager.delete(path);
                    }
                });
            });

            this.container.querySelectorAll('.apple-file-card').forEach(card => {
                const isDir = card.getAttribute('data-is-dir') === 'true';
                const path = card.getAttribute('data-path');

                card.addEventListener('click', (e) => {
                    if (e.target.closest('.apple-btn') || e.target.closest('.apple-checkbox')) return;
                    if (isDir) {
                        this.loadPath(path);
                    } else {
                        const fileObj = (this.currentFiles || []).find(f => f.path === path);
                        const fileName = fileObj ? fileObj.name : (card.querySelector('div[style*="font-weight:600"]')?.textContent || '');
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
                });
            });

            this.container.querySelectorAll('.btn-action-zip-folder').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const path = btn.getAttribute('data-path');
                    const name = btn.getAttribute('data-name');
                    this.batchManager.downloadZip([path], name || 'folder_download');
                });
            });

            this.container.querySelectorAll('.btn-action-play').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const type = btn.getAttribute('data-type');
                    const path = btn.getAttribute('data-path');
                    const name = btn.getAttribute('data-name');
                    if (this.onPlayMedia) {
                        this.onPlayMedia(type, path, name, this.currentFiles);
                    }
                });
            });

            this.container.querySelectorAll('.btn-action-download').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const path = btn.getAttribute('data-path');
                    this.handleSingleDownload(path);
                });
            });
        }

        handleSingleDownload(path) {
            const pin = this.getPin();
            const downloadUrl = this.getApiUrl(`/api/download?path=${encodeURIComponent(path)}&pin=${encodeURIComponent(pin)}`);
            window.open(downloadUrl, '_blank');
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

    FileExplorer.init = function(containerId, pathId) {
        if (!instance) {
            instance = new FileExplorer({
                container: typeof containerId === 'string' ? '#' + containerId : containerId,
                pathElement: typeof pathId === 'string' ? '#' + pathId : pathId,
                searchInput: '#search-input',
                uploadInput: '#file-input',
                progressContainer: '#progress-container',
                progressFill: '#progress-fill',
                progressText: '#progress-text',
                onPlayMedia: (type, path, name, playlist) => {
                    if (window.MediaHubInstance && typeof window.MediaHubInstance.playMedia === 'function') {
                        window.MediaHubInstance.playMedia(type, path, name, playlist);
                        return;
                    }
                    const pin = localStorage.getItem('lan_disk_pin') || '';
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
                                url: getUrl(`/api/stream?path=${encodeURIComponent(f.path)}&pin=${pin}`)
                            }));
                        if (window.AppleMediaPlayer && typeof window.AppleMediaPlayer.play === 'function') {
                            window.AppleMediaPlayer.play({ name, path, type, url: getUrl(`/api/stream?path=${encodeURIComponent(path)}&pin=${pin}`) }, formattedPlaylist);
                        }
                    } else if (type === 'image') {
                        const imgEl = document.getElementById('image-viewer');
                        const modalEl = document.getElementById('image-modal');
                        const titleEl = document.getElementById('image-gallery-title');
                        if (titleEl) titleEl.textContent = name;
                        if (imgEl && modalEl) {
                            imgEl.src = getUrl(`/api/stream?path=${encodeURIComponent(path)}&pin=${pin}`);
                            modalEl.style.display = 'flex';
                        }
                    } else if (type === 'text') {
                        const titleEl = document.getElementById('text-title');
                        const viewerEl = document.getElementById('text-viewer');
                        const modalEl = document.getElementById('text-modal');
                        fetch(getUrl(`/api/read-text?path=${encodeURIComponent(path)}&pin=${pin}`))
                            .then(r => r.json())
                            .then(data => {
                                if (titleEl) titleEl.textContent = name;
                                if (viewerEl) viewerEl.textContent = data.content || data.error || '';
                                if (modalEl) modalEl.style.display = 'flex';
                            })
                            .catch(() => {
                                fetch(getUrl(`/api/download?path=${encodeURIComponent(path)}&pin=${pin}`))
                                    .then(r => r.text())
                                    .then(text => {
                                        if (titleEl) titleEl.textContent = name;
                                        if (viewerEl) viewerEl.textContent = text;
                                        if (modalEl) modalEl.style.display = 'flex';
                                    });
                            });
                    }
                }
            });
        }
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

    global.FileExplorerComponent = FileExplorer;

})(typeof window !== 'undefined' ? window : this);
