/**
 * 局域网互联 Pro - Apple Notes 随手涂鸦板组件 (Whiteboard)
 * 职责：处理 Canvas 画布绘图、触摸与鼠标事件响应、清空画布以及将 Base64 PNG 图像保存上传至服务端共享目录。
 * 遵循无全局变量污染、高扩展性设计。
 */

(function (global) {
    'use strict';

    class Whiteboard {
        constructor(config = {}) {
            this.canvas = typeof config.canvas === 'string' ? document.querySelector(config.canvas) : config.canvas;
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

            this.strokeColor = config.strokeColor || '#000000';
            this.lineWidth = config.lineWidth || 2;

            this.isDrawing = false;
            this.lastX = 0;
            this.lastY = 0;
            this._sized = false;

            this._ensureCanvas();
            this.resize();
            this._bindEvents();

            // 窗口缩放时保持画布尺寸同步（去抖，保留笔迹）
            if (typeof window !== 'undefined' && !Whiteboard._resizeHooked) {
                Whiteboard._resizeHooked = true;
                let timer = null;
                window.addEventListener('resize', () => {
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        if (instance) instance.resize();
                    }, 300);
                });
            }
        }

        _ensureCanvas() {
            if (!this.canvas) {
                this.canvas = document.querySelector('#whiteboard') || document.querySelector('#pc-whiteboard');
            }
            if (this.canvas && !this.ctx) {
                this.ctx = this.canvas.getContext('2d');
            }
        }

        // 调整画布尺寸并保留已有笔迹（窗口缩放时不丢内容）
        resize() {
            this._ensureCanvas();
            if (!this.canvas || !this.ctx) return;
            const parent = this.canvas.parentElement;
            const newWidth = parent ? (parent.clientWidth || 300) : (this.canvas.width || 300);
            if (newWidth === this.canvas.width && this._sized) return;
            this._sized = true;

            // 先留档当前画面
            let snapshot = null;
            try {
                snapshot = document.createElement('canvas');
                snapshot.width = this.canvas.width;
                snapshot.height = this.canvas.height;
                snapshot.getContext('2d').drawImage(this.canvas, 0, 0);
            } catch (e) { snapshot = null; }

            this.canvas.width = newWidth;
            this.canvas.height = Math.round(newWidth * 0.62);
            this.clear();
            if (snapshot) {
                this.ctx.drawImage(snapshot, 0, 0, this.canvas.width, this.canvas.height);
            }
        }

        getPos(e) {
            this._ensureCanvas();
            if (!this.canvas) return { x: 0, y: 0 };
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        _bindEvents() {
            this._ensureCanvas();
            if (!this.canvas) return;

            this.canvas.addEventListener('mousedown', (e) => this._startDrawing(e));
            this.canvas.addEventListener('mousemove', (e) => this._draw(e));
            this.canvas.addEventListener('mouseup', () => this._stopDrawing());
            this.canvas.addEventListener('mouseleave', () => this._stopDrawing());

            this.canvas.addEventListener('touchstart', (e) => {
                this._startDrawing(e);
            }, { passive: true });

            this.canvas.addEventListener('touchmove', (e) => {
                if (!this.isDrawing) return;
                e.preventDefault();
                this._draw(e);
            }, { passive: false });

            this.canvas.addEventListener('touchend', () => this._stopDrawing());
            this.canvas.addEventListener('touchcancel', () => this._stopDrawing());
        }

        _startDrawing(e) {
            this.isDrawing = true;
            const pos = this.getPos(e);
            this.lastX = pos.x;
            this.lastY = pos.y;
        }

        _draw(e) {
            if (!this.isDrawing || !this.ctx) return;
            const pos = this.getPos(e);

            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.strokeStyle = this.strokeColor;
            this.ctx.lineWidth = this.lineWidth;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.stroke();

            this.lastX = pos.x;
            this.lastY = pos.y;
        }

        _stopDrawing() {
            this.isDrawing = false;
        }

        clear() {
            this._ensureCanvas();
            if (!this.ctx || !this.canvas) return;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        _authHeaders(extra) {
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.authHeaders) {
                return global.LanDiskAuth.authHeaders(extra);
            }
            const headers = extra ? Object.assign({}, extra) : {};
            headers['x-pin'] = this.getPin();
            return headers;
        }

        async saveImage(customSavePath = '') {
            this._ensureCanvas();
            if (!this.canvas) {
                alert('未找到涂鸦画布');
                return;
            }
            const dataUrl = this.canvas.toDataURL('image/png');
            const filename = `draw_${Date.now()}.png`;
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const saveUrl = getUrl('/api/upload/base64');

            try {
                const res = await fetch(saveUrl, {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        image: dataUrl,
                        filename: filename,
                        path: customSavePath || ''
                    })
                });

                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.success) {
                    throw new Error(data.error || '服务器保存失败');
                }
                if (typeof global.LanDiskUI !== 'undefined' && global.LanDiskUI.toast) global.LanDiskUI.toast('涂鸦已保存到共享目录', 'success');
                else alert('涂鸦图片已成功保存至共享目录！');
                this.clear();
            } catch (err) {
                if (typeof global.LanDiskUI !== 'undefined' && global.LanDiskUI.toast) global.LanDiskUI.toast('保存涂鸦失败: ' + err.message, 'error');
                else alert('保存涂鸦失败: ' + err.message);
            }
        }
    }

    let instance = null;

    function getOrCreateInstance(canvasId) {
        if (!instance) {
            instance = new Whiteboard({
                canvas: typeof canvasId === 'string' ? '#' + canvasId : (canvasId || '#whiteboard')
            });
        }
        return instance;
    }

    Whiteboard.init = function(canvasId) {
        const isNew = !instance;
        const inst = getOrCreateInstance(canvasId);
        // 只在首次创建实例时调整尺寸：resize 会清空画布，重复调用会吞掉用户已画内容
        if (isNew) inst.resize();
        return inst;
    };

    Whiteboard.clear = function() {
        const inst = getOrCreateInstance();
        inst.clear();
    };

    Whiteboard.save = function(customPath) {
        const inst = getOrCreateInstance();
        inst.saveImage(customPath);
    };

    global.WhiteboardComponent = Whiteboard;

})(typeof window !== 'undefined' ? window : this);
