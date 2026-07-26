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
            if (!this.canvas) {
                console.warn('Whiteboard: Canvas 元素未找到');
                return;
            }

            this.ctx = this.canvas.getContext('2d');
            this.apiFetch = config.apiFetch || window.fetch;
            this.getPin = config.getPin || (() => localStorage.getItem('lan_disk_pin') || '');

            this.strokeColor = config.strokeColor || '#000000';
            this.lineWidth = config.lineWidth || 2;

            this.isDrawing = false;
            this.lastX = 0;
            this.lastY = 0;

            this._initCanvas();
            this._bindEvents();
        }

        _initCanvas() {
            this.resize();
        }

        resize() {
            if (!this.canvas || !this.ctx) return;
            const parent = this.canvas.parentElement;
            if (parent) {
                this.canvas.width = parent.clientWidth || 300;
            }
            this.clear();
        }

        getPos(e) {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        _bindEvents() {
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
            if (!this.ctx || !this.canvas) return;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        async saveImage() {
            if (!this.canvas) return;
            const dataUrl = this.canvas.toDataURL('image/png');
            const filename = `draw_${Date.now()}.png`;
            const pin = this.getPin();

            try {
                const res = await fetch('/api/upload/base64', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                    body: JSON.stringify({
                        image: dataUrl,
                        filename: filename,
                        path: 'C:\\'
                    })
                });

                if (!res.ok) throw new Error('服务器保存失败');
                alert('🎨 涂鸦图片已成功保存至共享目录！');
                this.clear();
            } catch (err) {
                alert('保存涂鸦失败: ' + err.message);
            }
        }
    }

    let instance = null;

    Whiteboard.init = function(canvasId) {
        if (!instance) {
            instance = new Whiteboard({
                canvas: typeof canvasId === 'string' ? '#' + canvasId : canvasId
            });
        }
        instance.resize();
    };

    Whiteboard.clear = function() { if (instance) instance.clear(); };
    Whiteboard.save = function() { if (instance) instance.saveImage(); };

    global.WhiteboardComponent = Whiteboard;

})(typeof window !== 'undefined' ? window : this);
