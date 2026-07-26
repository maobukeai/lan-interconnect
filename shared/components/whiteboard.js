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
                if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
                    const baseUrl = window.currentServerUrl || 'http://localhost:3000';
                    return baseUrl.replace(/\/$/, '') + p;
                }
                return p;
            });

            this.strokeColor = config.strokeColor || '#000000';
            this.lineWidth = config.lineWidth || 2;

            this.isDrawing = false;
            this.lastX = 0;
            this.lastY = 0;

            this._ensureCanvas();
            this._bindEvents();
        }

        _ensureCanvas() {
            if (!this.canvas) {
                this.canvas = document.querySelector('#whiteboard') || document.querySelector('#pc-whiteboard');
            }
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                this.resize();
            }
        }

        resize() {
            this._ensureCanvas();
            if (!this.canvas || !this.ctx) return;
            const parent = this.canvas.parentElement;
            if (parent) {
                this.canvas.width = parent.clientWidth || 300;
            }
            this.clear();
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

        async saveImage(customSavePath = '') {
            this._ensureCanvas();
            if (!this.canvas) {
                alert('未找到涂鸦画布');
                return;
            }
            const dataUrl = this.canvas.toDataURL('image/png');
            const filename = `draw_${Date.now()}.png`;
            const pin = this.getPin();
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const saveUrl = getUrl('/api/upload/base64');

            try {
                const res = await fetch(saveUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
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
                alert('🎨 涂鸦图片已成功保存至共享目录！');
                this.clear();
            } catch (err) {
                alert('保存涂鸦失败: ' + err.message);
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
        const inst = getOrCreateInstance(canvasId);
        inst.resize();
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
