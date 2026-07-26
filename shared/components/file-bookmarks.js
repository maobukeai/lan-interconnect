/**
 * 局域网互联 Pro - 常用书签管理模块 (FileBookmarksManager)
 * 职责：负责常用目录书签的存储、追加、移除及界面渲染。
 */

(function (global) {
    'use strict';

    class FileBookmarksManager {
        constructor(config = {}) {
            this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
            this.onSelectPath = config.onSelectPath || null;
        }

        getDefaultBookmarks() {
            return [
                { name: '💻 根目录', path: '', system: true },
                { name: '🖥️ 桌面', path: 'C:\\Users\\20269\\Desktop', system: true },
                { name: '📁 下载', path: 'C:\\Users\\20269\\Downloads', system: true }
            ];
        }

        getBookmarks() {
            try {
                const raw = localStorage.getItem('lan_disk_bookmarks');
                if (raw) return JSON.parse(raw);
            } catch(e) {}
            return this.getDefaultBookmarks();
        }

        saveBookmarks(list) {
            try {
                localStorage.setItem('lan_disk_bookmarks', JSON.stringify(list));
            } catch(e) {}
        }

        loadBookmarks(containerEl) {
            const targetContainer = containerEl || this.container || document.querySelector('#web-bookmarks-list') || document.querySelector('#pc-bookmarks-list');
            if (!targetContainer) return;

            const list = this.getBookmarks();
            targetContainer.innerHTML = list.map((item, idx) => {
                const safePath = (item.path || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const safeName = item.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `
                    <div class="apple-btn apple-btn-glass" style="padding: 3px 10px; font-size: 11px; border-radius: 14px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" data-bm-path="${safePath}" data-bm-idx="${idx}">
                        <span>${safeName}</span>
                        ${!item.system ? `<span class="bm-remove-btn" style="color:#ff453a; font-weight:bold; font-size:10px; opacity:0.7; padding:0 2px;" data-bm-idx="${idx}" title="删除书签">✕</span>` : ''}
                    </div>
                `;
            }).join('');

            targetContainer.querySelectorAll('[data-bm-path]').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.classList.contains('bm-remove-btn')) return;
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

        addBookmark(currentPath, isRoot) {
            if (isRoot || !currentPath || currentPath === '根目录') {
                if (window.showToast) window.showToast('⭐ 根目录已在系统默认书签中');
                else alert('⭐ 根目录已在系统默认书签中');
                return;
            }

            const list = this.getBookmarks();
            if (list.some(b => b.path === currentPath)) {
                if (window.showToast) window.showToast('⭐ 该路径已在书签收藏列表中');
                else alert('⭐ 该路径已在书签收藏列表中');
                return;
            }

            const pathParts = currentPath.replace(/\\$/,'').split('\\');
            const folderName = pathParts[pathParts.length - 1] || currentPath;
            const customName = prompt(`请输入书签名称:`, `📁 ${folderName}`);
            if (customName === null) return;

            const name = customName.trim() || `📁 ${folderName}`;
            list.push({ name, path: currentPath, system: false });
            this.saveBookmarks(list);
            this.loadBookmarks();
            if (window.showToast) window.showToast(`⭐ 已添加书签: [${name}]`);
            else alert(`⭐ 已添加书签: [${name}]`);
        }

        removeBookmark(idx, containerEl) {
            const list = this.getBookmarks();
            if (idx >= 0 && idx < list.length) {
                const removed = list.splice(idx, 1);
                this.saveBookmarks(list);
                this.loadBookmarks(containerEl);
                if (window.showToast) window.showToast(`🗑️ 已删除书签: [${removed[0]?.name || ''}]`);
                else alert(`🗑️ 已删除书签: [${removed[0]?.name || ''}]`);
            }
        }
    }

    global.FileBookmarksManager = FileBookmarksManager;

})(typeof window !== 'undefined' ? window : this);
