/**
 * 局域网互联 Pro - 媒体调度与画廊中心组件 (MediaHub)
 * 职责：处理视频/音频播放串联、全屏图片画廊（支持双指缩放与下拉关闭手势）、文本/Markdown 查看及弹窗手势交互。
 */

(function (global) {
    'use strict';

    class MediaHub {
        constructor(config = {}) {
            this.imageModal = typeof config.imageModal === 'string' ? document.querySelector(config.imageModal) : config.imageModal;
            this.imageViewer = typeof config.imageViewer === 'string' ? document.querySelector(config.imageViewer) : config.imageViewer;
            this.textModal = typeof config.textModal === 'string' ? document.querySelector(config.textModal) : config.textModal;
            this.textViewer = typeof config.textViewer === 'string' ? document.querySelector(config.textViewer) : config.textViewer;
            this.textTitle = typeof config.textTitle === 'string' ? document.querySelector(config.textTitle) : config.textTitle;

            this.apiFetch = config.apiFetch || (typeof window !== 'undefined' ? window.fetch.bind(window) : null);
            this.getPin = config.getPin || (() => typeof localStorage !== 'undefined' ? (localStorage.getItem('lan_disk_pin') || '') : '');
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

            this.currentGallery = { index: 0, items: [] };
            this.scale = 1;
            this.lastScale = 1;
            this.lastTapTime = 0;

            this._bindTouchEvents();
        }

        _bindTouchEvents() {
            const imageModal = this.imageModal || (typeof document !== 'undefined' ? document.getElementById('image-modal') : null);
            const imageViewer = this.imageViewer || (typeof document !== 'undefined' ? document.getElementById('image-viewer') : null);

            if (!imageModal) return;

            let startX = 0;
            let startY = 0;
            let initialPinchDist = 0;

            imageModal.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else if (e.touches.length === 2) {
                    // 记录双指初始距离 (Pinch-to-Zoom)
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialPinchDist = Math.sqrt(dx * dx + dy * dy);
                }
            }, { passive: true });

            imageModal.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2 && initialPinchDist > 0 && imageViewer) {
                    // 计算双指实时捏合/放缩比例
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const currentDist = Math.sqrt(dx * dx + dy * dy);
                    const factor = currentDist / initialPinchDist;
                    this.scale = Math.min(4, Math.max(0.8, this.lastScale * factor));
                    imageViewer.style.transform = `scale(${this.scale})`;
                }
            }, { passive: true });

            imageModal.addEventListener('touchend', (e) => {
                if (e.touches.length === 0) {
                    this.lastScale = this.scale;
                }

                if (!e.changedTouches || e.changedTouches.length !== 1) return;
                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;

                const diffX = endX - startX;
                const diffY = endY - startY;

                // 双击点按重置/放大
                const now = Date.now();
                if (now - this.lastTapTime < 300 && Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && imageViewer) {
                    this.scale = this.scale > 1.2 ? 1 : 2.2;
                    this.lastScale = this.scale;
                    imageViewer.style.transform = `scale(${this.scale})`;
                    this.lastTapTime = now;
                    return;
                }
                this.lastTapTime = now;

                // 若处于放大状态，优先进行拖拽微调，不动手势切页
                if (this.scale > 1.2) return;

                // 1. 水平滑动手势 (左右切图)
                if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX < 0) {
                        this.nextImage();
                    } else {
                        this.prevImage();
                    }
                }
                // 2. 下拉滑动手势 (Swipe-Down to Dismiss 关闭弹窗)
                else if (diffY > 90 && Math.abs(diffY) > Math.abs(diffX)) {
                    this.closeModals();
                }
            }, { passive: true });
        }

        resetZoom() {
            this.scale = 1;
            this.lastScale = 1;
            const imageViewer = this.imageViewer || document.getElementById('image-viewer');
            if (imageViewer) imageViewer.style.transform = 'scale(1)';
        }

        playMedia(type, path, name, currentFiles = []) {
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const authQ = () => (global.LanDiskAuth && global.LanDiskAuth.authQuery) ? global.LanDiskAuth.authQuery().replace(/^\?/, '&') : `&pin=${encodeURIComponent(typeof this.getPin === 'function' ? this.getPin() : '')}`;
            const streamUrl = getUrl(`/api/stream?path=${encodeURIComponent(path)}${authQ()}`);

            if (type === 'video' || type === 'audio') {
                const playlist = (currentFiles || [])
                    .filter(f => !f.isDirectory && /\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i.test(f.name))
                    .map(f => ({
                        name: f.name,
                        path: f.path,
                        type: /\.(mp3|wav|flac|aac|m4a)$/i.test(f.name) ? 'audio' : 'video',
                        url: getUrl(`/api/stream?path=${encodeURIComponent(f.path)}${authQ()}`)
                    }));
                const currentItem = { name, path, type, url: streamUrl };

                if (global.AppleMediaPlayer && typeof global.AppleMediaPlayer.play === 'function') {
                    global.AppleMediaPlayer.play(currentItem, playlist);
                } else if (global.LanDiskUI && global.LanDiskUI.downloadUrl) {
                    global.LanDiskUI.downloadUrl(streamUrl, name);
                } else {
                    window.open(streamUrl, '_blank');
                }
            } else if (type === 'image') {
                const imageFiles = (currentFiles || [])
                    .filter(f => !f.isDirectory && /\.(jpg|png|gif|webp|svg|bmp|ico)$/i.test(f.name))
                    .map(f => ({
                        name: f.name,
                        path: f.path,
                        url: getUrl(`/api/stream?path=${encodeURIComponent(f.path)}${authQ()}`)
                    }));
                
                let targetIdx = imageFiles.findIndex(f => f.path === path);
                if (targetIdx === -1) {
                    imageFiles.unshift({ name, path, url: streamUrl });
                    targetIdx = 0;
                }
                this.showImagePreview(targetIdx, imageFiles);
            } else if (type === 'text') {
                this.showTextPreview(name, path);
            }
        }

        showImagePreview(index, imageList = []) {
            this.resetZoom();
            this.currentGallery = { index, items: imageList };
            this.renderGalleryCurrent();
            const modal = this.imageModal || document.getElementById('image-modal');
            if (modal) modal.style.display = 'flex';
        }

        renderGalleryCurrent() {
            const { index, items } = this.currentGallery;
            if (!items || items.length === 0) return;
            const item = items[index];
            if (!item) return;

            this.resetZoom();

            const viewer = this.imageViewer || document.getElementById('image-viewer');
            if (viewer) viewer.src = item.url;
            
            const titleEl = document.getElementById('image-gallery-title');
            if (titleEl) {
                titleEl.textContent = `${item.name} (${index + 1}/${items.length})`;
            }
        }

        nextImage() {
            const { index, items } = this.currentGallery;
            if (!items || items.length <= 1) return;
            this.currentGallery.index = (index + 1) % items.length;
            this.renderGalleryCurrent();
        }

        prevImage() {
            const { index, items } = this.currentGallery;
            if (!items || items.length <= 1) return;
            this.currentGallery.index = (index - 1 + items.length) % items.length;
            this.renderGalleryCurrent();
        }

        async showTextPreview(name, path) {
            const titleEl = this.textTitle || document.getElementById('text-title');
            const viewerEl = this.textViewer || document.getElementById('text-viewer');
            const modalEl = this.textModal || document.getElementById('text-modal');

            if (titleEl) titleEl.textContent = name;
            if (viewerEl) viewerEl.textContent = '加载中...';
            if (modalEl) modalEl.style.display = 'flex';

            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const authHeaders = (global.LanDiskAuth && global.LanDiskAuth.authHeaders) ? global.LanDiskAuth.authHeaders() : {};
            const authQ = (global.LanDiskAuth && global.LanDiskAuth.authQuery) ? global.LanDiskAuth.authQuery().replace(/^\?/, '&') : '';

            try {
                const fetchFn = this.apiFetch || window.fetch.bind(window);
                // 优先走 /api/read-text：服务端有 10MB 上限与转义，比整文件下载更省流量
                const textRes = await fetchFn(getUrl(`/api/read-text?path=${encodeURIComponent(path)}${authQ}`), { headers: authHeaders });
                if (textRes.ok) {
                    const data = await textRes.json();
                    if (viewerEl) viewerEl.textContent = data.content || data.error || '';
                    return;
                }
                if (textRes.status === 400 || textRes.status === 413) {
                    const errData = await textRes.json().catch(() => ({}));
                    if (viewerEl) viewerEl.textContent = `无法预览: ${errData.error || '文件过大'}`;
                    return;
                }
                throw new Error('无法读取文件内容');
            } catch (err) {
                // 兜底：按原始文件下载后以文本展示
                try {
                    const fetchFn = this.apiFetch || window.fetch.bind(window);
                    const res = await fetchFn(getUrl(`/api/download?path=${encodeURIComponent(path)}${authQ}`), { headers: authHeaders });
                    if (!res.ok) throw new Error('无法读取文件内容');
                    const text = await res.text();
                    if (viewerEl) viewerEl.textContent = text;
                } catch (err2) {
                    if (viewerEl) viewerEl.textContent = `读取失败: ${err2.message}`;
                }
            }
        }

        closeModals() {
            this.resetZoom();
            const imgModal = this.imageModal || document.getElementById('image-modal');
            const txtModal = this.textModal || document.getElementById('text-modal');
            if (imgModal) imgModal.style.display = 'none';
            if (txtModal) txtModal.style.display = 'none';
        }
    }

    global.MediaHubComponent = MediaHub;
    // 不再自动创建全局实例：页面（如 index.html）会用带配置的构造函数创建
    // window.MediaHubInstance，脚本级自动实例会给同一弹窗挂重复手势监听器。

})(typeof window !== 'undefined' ? window : this);
