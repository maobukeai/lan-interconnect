/**
 * 局域网互联 Pro - 媒体中心组件 (MediaHub)
 * 职责：多媒体文件识别过滤、音频/视频播放器拉起 (AppleMediaPlayer)、图片/文本预览处理。
 * 遵循无全局变量污染、高扩展性设计。
 */

(function (global) {
    'use strict';

    class MediaHub {
        /**
         * 初始化媒体中心组件
         * @param {Object} config 配置选项
         * @param {HTMLElement|string} [config.imageModal] 图片预览模态框元素
         * @param {HTMLElement|string} [config.imageViewer] 图片预览 img 元素
         * @param {HTMLElement|string} [config.textModal] 文本预览模态框元素
         * @param {HTMLElement|string} [config.textViewer] 文本预        constructor(config = {}) {
            this.imageModal = typeof config.imageModal === 'string' ? document.querySelector(config.imageModal) : config.imageModal;
            this.imageViewer = typeof config.imageViewer === 'string' ? document.querySelector(config.imageViewer) : config.imageViewer;
            this.textModal = typeof config.textModal === 'string' ? document.querySelector(config.textModal) : config.textModal;
            this.textViewer = typeof config.textViewer === 'string' ? document.querySelector(config.textViewer) : config.textViewer;
            this.textTitle = typeof config.textTitle === 'string' ? document.querySelector(config.textTitle) : config.textTitle;

            this.apiFetch = config.apiFetch || (typeof window !== 'undefined' ? window.fetch.bind(window) : null);
            this.getPin = config.getPin || (() => typeof localStorage !== 'undefined' ? (localStorage.getItem('lan_disk_pin') || '') : '');
            this.getApiUrl = config.getApiUrl || ((p) => {
                if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
                    const baseUrl = window.currentServerUrl || 'http://localhost:3000';
                    return baseUrl.replace(/\/$/, '') + p;
                }
                return p;
            });

            this.currentGallery = { index: 0, items: [] };
            this._bindTouchEvents();
        }

        _bindTouchEvents() {
            const imageModal = this.imageModal || (typeof document !== 'undefined' ? document.getElementById('image-modal') : null);
            if (!imageModal) return;
            let startX = 0;
            let startY = 0;

            imageModal.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches.length === 1) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                }
            }, { passive: true });

            imageModal.addEventListener('touchend', (e) => {
                if (!e.changedTouches || e.changedTouches.length !== 1) return;
                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;

                const diffX = endX - startX;
                const diffY = endY - startY;

                if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX < 0) {
                        this.nextImage();
                    } else {
                        this.prevImage();
                    }
                }
            }, { passive: true });
        }

        /**
         * 统一播放/预览入口
         * @param {string} type 媒体类型: 'video' | 'audio' | 'image' | 'text'
         * @param {string} path 文件绝对路径
         * @param {string} name 文件名
         * @param {Array} [currentFiles] 当前目录文件列表（用于构建连播列表）
         */
        playMedia(type, path, name, currentFiles = []) {
            const pin = typeof this.getPin === 'function' ? this.getPin() : '';
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const streamUrl = getUrl(`/api/stream?path=${encodeURIComponent(path)}&pin=${encodeURIComponent(pin)}`);

            if (typeof history !== 'undefined' && history.pushState && window.location.protocol !== 'file:') {
                history.pushState({ type: 'modal' }, '', '#preview');
            }

            if (type === 'video' || type === 'audio') {
                const playlist = (currentFiles || [])
                    .filter(f => !f.isDirectory && /\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i.test(f.name))
                    .map(f => ({
                        name: f.name,
                        path: f.path,
                        type: /\.(mp3|wav|flac|aac|m4a)$/i.test(f.name) ? 'audio' : 'video',
                        url: getUrl(`/api/stream?path=${encodeURIComponent(f.path)}&pin=${encodeURIComponent(pin)}`)
                    }));
                const currentItem = { name, path, type, url: streamUrl };

                if (global.AppleMediaPlayer && typeof global.AppleMediaPlayer.play === 'function') {
                    global.AppleMediaPlayer.play(currentItem, playlist);
                } else {
                    window.open(streamUrl, '_blank');
                }
            } else if (type === 'image') {
                const imageFiles = (currentFiles || [])
                    .filter(f => !f.isDirectory && /\.(jpg|png|gif|webp|svg|bmp|ico)$/i.test(f.name))
                    .map(f => ({
                        name: f.name,
                        path: f.path,
                        url: getUrl(`/api/stream?path=${encodeURIComponent(f.path)}&pin=${encodeURIComponent(pin)}`)
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

        /**
         * 展现图片画廊弹窗
         */
        showImagePreview(index, imageList = []) {
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

        /**
         * 展现文本文件查看弹窗
         * @param {string} name 文件名
         * @param {string} path 文件路径
         */
        async showTextPreview(name, path) {
            const titleEl = this.textTitle || document.getElementById('text-title');
            const viewerEl = this.textViewer || document.getElementById('text-viewer');
            const modalEl = this.textModal || document.getElementById('text-modal');

            if (titleEl) titleEl.textContent = name;
            if (viewerEl) viewerEl.textContent = '加载中...';
            if (modalEl) modalEl.style.display = 'flex';

            const pin = typeof this.getPin === 'function' ? this.getPin() : '';
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const downloadUrl = getUrl(`/api/download?path=${encodeURIComponent(path)}&pin=${encodeURIComponent(pin)}`);

            try {
                const fetchFn = this.apiFetch || window.fetch.bind(window);
                const res = await fetchFn(downloadUrl);
                if (!res.ok) throw new Error('无法读取文件内容');
                const text = await res.text();
                if (viewerEl) viewerEl.textContent = text;
            } catch (err) {
                if (viewerEl) viewerEl.textContent = `读取失败: ${err.message}`;
            }
        }

        /**
         * 关闭所有预览模态框
         */
        closeModals() {
            const imgModal = this.imageModal || document.getElementById('image-modal');
            const txtModal = this.textModal || document.getElementById('text-modal');
            if (imgModal) imgModal.style.display = 'none';
            if (txtModal) txtModal.style.display = 'none';
        }
    }

    // 暴露全局单例 / 类
    global.MediaHubComponent = MediaHub;
    if (typeof window !== 'undefined' && !window.MediaHubInstance) {
        window.MediaHubInstance = new MediaHub();
    }

})(typeof window !== 'undefined' ? window : this);
