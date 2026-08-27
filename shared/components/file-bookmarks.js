/**
 * 猫步互联 · 常用书签管理模块 (FileBookmarksManager)
 * 负责常用目录书签的存储、追加、移除及界面渲染。
 */

(function (global) {
    'use strict';

    const I = (name, size) => (global.Icons ? global.Icons.render(name, size) : '');

    function apiBase() {
        if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
            return (window.currentServerUrl || 'http://localhost:3000').replace(/\/$/, '');
        }
        return '';
    }

    class FileBookmarksManager {
        constructor(config = {}) {
            this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
            this.onSelectPath = config.onSelectPath || null;
        }

        _toast(msg, type) {
            if (typeof global.LanDiskUI !== 'undefined' && global.LanDiskUI.toast) global.LanDiskUI.toast(msg, type);
            else if (window.showToast) window.showToast(msg);
        }

        getDefaultBookmarks() {
            const home = (this.serverHomeDir || '').replace(/\\+$/, '');
            return [
                { name: '根目录', icon: 'server', path: '', system: true },
                { name: '桌面', icon: 'monitor', path: home ? `${home}\\Desktop` : '', system: true },
                { name: '下载', icon: 'download', path: home ? `${home}\\Downloads` : '', system: true }
            ];
        }

        getBookmarks() {
            try {
                const raw = localStorage.getItem('lan_disk_bookmarks');
                if (raw) {
                    const list = JSON.parse(raw);
                    if (Array.isArray(list)) {
                        // 迁移：剔除旧机器遗留的硬编码他人用户目录书签，并剥除旧版 emoji 前缀
                        return list
                            .filter(b => !(/\\Users\\20269\\/.test(b.path || '')))
                            .map(b => ({
                                name: String(b.name || '').replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+\s*/, ''),
                                icon: b.icon || 'folder',
                                path: b.path,
                                system: !!b.system
                            }));
                    }
                }
            } catch (e) {}
            return this.getDefaultBookmarks();
        }

        // 从服务端获取当前用户主目录，用于生成桌面/下载默认书签（仅首次进入文件页时请求一次）
        fetchServerHomeDir(containerEl) {
            if (this.serverHomeDir || this._homeDirFetching) return;
            this._homeDirFetching = true;
            const authHeaders = (global.LanDiskAuth && global.LanDiskAuth.authHeaders) ? global.LanDiskAuth.authHeaders() : {};
            fetch(apiBase() + '/api/sysinfo', { headers: authHeaders })
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    this._homeDirFetching = false;
                    if (data && data.homeDir) {
                        this.serverHomeDir = data.homeDir;
                        // 用户尚未自定义过书签时，用修正后的默认书签重新渲染
                        if (!localStorage.getItem('lan_disk_bookmarks')) {
                            this.loadBookmarks(containerEl);
                        }
                    }
                })
                .catch(() => { this._homeDirFetching = false; });
        }

        saveBookmarks(list) {
            try {
                localStorage.setItem('lan_disk_bookmarks', JSON.stringify(list));
            } catch (e) {}
        }

        loadBookmarks(containerEl) {
            const targetContainer = containerEl || this.container || document.querySelector('#web-bookmarks-list') || document.querySelector('#pc-bookmarks-list');
            if (!targetContainer) return;

            const list = this.getBookmarks();
            this.fetchServerHomeDir(targetContainer);
            const escapeHtml = global.escapeHtml || (s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
            const I = (n, s) => (global.Icons ? global.Icons.render(n, s) : '');

            targetContainer.innerHTML = list.map((item, idx) => {
                const safePath = escapeHtml(item.path || '');
                const safeName = escapeHtml(item.name);
                return `
                    <div class="bookmark-pill" data-bm-path="${safePath}" data-bm-idx="${idx}">
                        ${I(item.icon || 'folder', 13)}
                        <span>${safeName}</span>
                        ${!item.system ? `<span class="bm-remove-btn bookmark-del-btn" data-bm-idx="${idx}" title="删除书签">${I('close', 8)}</span>` : ''}
                    </div>
                `;
            }).join('');

            targetContainer.querySelectorAll('[data-bm-path]').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.closest('.bm-remove-btn')) return;
                    const path = el.getAttribute('data-bm-path');
                    if (this.onSelectPath) {
                        this.onSelectPath(path);
                    }
                });
            });

            targetContainer.querySelectorAll('.bm-remove-btn').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(el.getAttribute('data-bm-idx'), 10);
                    this.removeBookmark(idx, targetContainer);
                });
            });
        }

        async addBookmark(currentPath, isRoot) {
            if (isRoot || !currentPath || currentPath === '根目录') {
                this._toast('根目录已在默认书签中', 'info');
                return;
            }

            const list = this.getBookmarks();
            if (list.some(b => b.path === currentPath)) {
                this._toast('该路径已在书签中', 'info');
                return;
            }

            const pathParts = currentPath.replace(/\\$/, '').split('\\');
            const folderName = pathParts[pathParts.length - 1] || currentPath;

            let customName = folderName;
            if (typeof global.LanDiskUI !== 'undefined' && global.LanDiskUI.promptDialog) {
                const input = await global.LanDiskUI.promptDialog({ title: '收藏此路径', message: currentPath, value: folderName, confirmText: '收藏' });
                if (input === null) return;
                customName = input.trim() || folderName;
            } else {
                const input = global.prompt('请输入书签名称:', folderName);
                if (input === null) return;
                customName = input.trim() || folderName;
            }

            list.push({ name: customName, icon: 'folder', path: currentPath, system: false });
            this.saveBookmarks(list);
            this.loadBookmarks();
            this._toast(`已收藏：${customName}`, 'success');
        }

        removeBookmark(idx, containerEl) {
            const list = this.getBookmarks();
            if (idx >= 0 && idx < list.length) {
                const removed = list.splice(idx, 1);
                this.saveBookmarks(list);
                this.loadBookmarks(containerEl);
                this._toast(`已删除书签：${removed[0] ? removed[0].name : ''}`);
            }
        }
    }

    global.FileBookmarksManager = FileBookmarksManager;

})(typeof window !== 'undefined' ? window : this);
