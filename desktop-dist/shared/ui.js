/**
 * 猫步互联 · UI 工具库 (LanDiskUI)
 * toast / confirm / prompt / modal / 右键与长按菜单 / 深浅主题管理
 * 依赖：shared/icons.js（Icons.render）
 */

(function (global) {
    'use strict';

    const I = (name, size) => (global.Icons ? global.Icons.render(name, size) : '');

    /* ---------- Toast ---------- */
    function _toastStack() {
        let stack = document.querySelector('.toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }
        return stack;
    }

    function toast(message, type, duration) {
        const icons = { success: 'check', error: 'warning', info: 'info' };
        const el = document.createElement('div');
        el.className = `toast ${type || 'info'}`;
        el.innerHTML = `${I(icons[type] || 'info', 17)}<span></span>`;
        el.querySelector('span').textContent = String(message);
        _toastStack().appendChild(el);
        setTimeout(() => {
            el.classList.add('out');
            setTimeout(() => el.remove(), 260);
        }, duration || 2600);
    }

    /* ---------- 模态框 ---------- */
    function openModal(html, { width, onClose, closable = true } = {}) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        const box = document.createElement('div');
        box.className = 'modal-box';
        if (width) box.style.width = `min(92vw, ${width}px)`;
        box.innerHTML = html;
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);

        const close = (result) => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey);
            if (onClose) onClose(result);
        };
        const onKey = (e) => {
            if (e.key === 'Escape' && closable) close();
        };
        document.addEventListener('keydown', onKey);
        if (closable) {
            backdrop.addEventListener('mousedown', (e) => {
                if (e.target === backdrop) close();
            });
        }
        return { el: box, backdrop, close };
    }

    /* ---------- 确认对话框（替代原生 confirm） ---------- */
    function confirmDialog({ title, message, confirmText = '确定', cancelText = '取消', danger = false } = {}) {
        return new Promise((resolve) => {
            const modal = openModal(`
                <div class="modal-title"><span></span></div>
                <div class="modal-message"></div>
                <div class="modal-actions">
                    <button class="apple-btn apple-btn-glass" data-act="cancel"></button>
                    <button class="apple-btn ${danger ? 'apple-btn-danger' : 'apple-btn-primary'}" data-act="ok"></button>
                </div>
            `, {
                width: 340,
                onClose: () => resolve(false)
            });

            modal.el.querySelector('.modal-title span').textContent = title || '确认操作';
            modal.el.querySelector('.modal-message').textContent = message || '';
            modal.el.querySelector('[data-act="cancel"]').textContent = cancelText;
            const okBtn = modal.el.querySelector('[data-act="ok"]');
            okBtn.textContent = confirmText;

            okBtn.addEventListener('click', () => { modal.backdrop.onCloseHack = true; resolve(true); modal.close(); });
            modal.el.querySelector('[data-act="cancel"]').addEventListener('click', () => { resolve(false); modal.close(); });
        });
    }

    /* ---------- 输入对话框（替代原生 prompt） ---------- */
    function promptDialog({ title, message, placeholder = '', value = '', confirmText = '确定' } = {}) {
        return new Promise((resolve) => {
            const modal = openModal(`
                <div class="modal-title"><span></span></div>
                <div class="modal-message" style="margin-bottom:14px"></div>
                <div class="apple-input-box" style="margin-bottom:20px">
                    <input type="text" class="apple-input" style="font-size:14px">
                </div>
                <div class="modal-actions">
                    <button class="apple-btn apple-btn-glass" data-act="cancel">取消</button>
                    <button class="apple-btn apple-btn-primary" data-act="ok"></button>
                </div>
            `, {
                width: 360,
                onClose: () => resolve(null)
            });

            const input = modal.el.querySelector('input');
            modal.el.querySelector('.modal-title span').textContent = title || '请输入';
            modal.el.querySelector('.modal-message').textContent = message || '';
            input.placeholder = placeholder;
            input.value = value || '';
            modal.el.querySelector('[data-act="ok"]').textContent = confirmText;

            setTimeout(() => { input.focus(); input.select && value && input.select(); }, 60);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { resolve(input.value); modal.close(); }
            });
            modal.el.querySelector('[data-act="ok"]').addEventListener('click', () => { resolve(input.value); modal.close(); });
            modal.el.querySelector('[data-act="cancel"]').addEventListener('click', () => { resolve(null); modal.close(); });
        });
    }

    /* ---------- 上下文菜单（右键 + 触屏长按） ---------- */
    let _activeMenu = null;

    function closeContextMenu() {
        if (_activeMenu) {
            _activeMenu.remove();
            _activeMenu = null;
            document.removeEventListener('mousedown', _ctxDismiss);
            document.removeEventListener('touchstart', _ctxDismiss, { passive: true });
        }
    }

    function _ctxDismiss(e) {
        if (_activeMenu && !_activeMenu.contains(e.target)) closeContextMenu();
    }

    /**
     * showContextMenu(x, y, items)
     * items: [{icon, label, danger, onClick}] 或 'divider'
     */
    function showContextMenu(x, y, items) {
        closeContextMenu();
        const menu = document.createElement('div');
        menu.className = 'ctx-menu';
        menu.innerHTML = items.map(item => {
            if (item === 'divider') return '<div class="ctx-menu-divider"></div>';
            return `<button class="ctx-menu-item ${item.danger ? 'danger' : ''}" data-idx="${items.indexOf(item)}">
                ${I(item.icon || 'dot', 16)}<span></span>
            </button>`;
        }).join('');

        // 文本用 textContent 写入，防注入
        menu.querySelectorAll('.ctx-menu-item span').forEach((span, i) => {
            let idx = parseInt(menu.querySelectorAll('.ctx-menu-item')[i].getAttribute('data-idx'), 10);
            span.textContent = items[idx].label;
        });

        document.body.appendChild(menu);

        menu.querySelectorAll('.ctx-menu-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-idx'), 10);
                const item = items[idx];
                closeContextMenu();
                if (item && item.onClick) item.onClick();
            });
        });

        // 边界修正：防止菜单溢出屏幕
        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let px = Math.min(x, vw - rect.width - 10);
        let py = Math.min(y, vh - rect.height - 10);
        menu.style.left = Math.max(8, px) + 'px';
        menu.style.top = Math.max(8, py) + 'px';

        _activeMenu = menu;
        setTimeout(() => {
            document.addEventListener('mousedown', _ctxDismiss);
            document.addEventListener('touchstart', _ctxDismiss, { passive: true });
        }, 0);
    }

    // 为元素绑定右键 + 长按（触屏 550ms）
    function bindContextMenu(el, getItems) {
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, getItems(e));
        });
        let pressTimer = null;
        let longPressed = false;
        el.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            longPressed = false;
            pressTimer = setTimeout(() => {
                longPressed = true;
                if (navigator.vibrate) navigator.vibrate(12);
                showContextMenu(t.clientX, t.clientY, getItems(e));
            }, 550);
        }, { passive: true });
        el.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
        el.addEventListener('touchend', (e) => {
            clearTimeout(pressTimer);
            if (longPressed) { e.preventDefault(); e.stopPropagation(); }
        });
        el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /* ---------- 主题管理 ---------- */
    const Theme = {
        get() {
            const saved = localStorage.getItem('landisk_theme');
            if (saved === 'light' || saved === 'dark') return saved;
            return 'auto';
        },
        resolved() {
            const t = Theme.get();
            if (t !== 'auto') return t;
            return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        },
        apply() {
            // CSS 只认 html[data-theme]（apple-theme.css 无 prefers-color-scheme 回退），
            // auto 必须落到解析后的实际值：否则系统浅色时页面仍是深色，而图标却显示浅色，
            // 用户点切换会觉得"没反应"
            document.documentElement.setAttribute('data-theme', Theme.resolved());
        },
        set(t) {
            localStorage.setItem('landisk_theme', t);
            Theme.apply();
        },
        toggle() {
            const next = Theme.resolved() === 'dark' ? 'light' : 'dark';
            Theme.set(next);
            return next;
        },
        icon() {
            return Theme.resolved() === 'dark' ? 'moon' : 'sun';
        }
    };

    // auto 模式下跟随系统深浅切换实时更新
    try {
        const themeMedia = window.matchMedia('(prefers-color-scheme: light)');
        const onSystemThemeChange = () => { if (Theme.get() === 'auto') Theme.apply(); };
        if (themeMedia.addEventListener) themeMedia.addEventListener('change', onSystemThemeChange);
        else if (themeMedia.addListener) themeMedia.addListener(onSystemThemeChange);
    } catch (e) {}

    /* ---------- 通用下载（<a download> 点击触发） ----------
       不用 window.open：Electron 的 setWindowOpenHandler 会拦截，
       而锚点下载在浏览器与 Electron 中都会走原生下载流程。 */
    function downloadUrl(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        if (filename) a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 4000);
    }

    /* ---------- Sparkline 迷你折线图 ---------- */
    class Sparkline {
        constructor(svgEl, color, maxPoints = 40) {
            this.el = typeof svgEl === 'string' ? document.querySelector(svgEl) : svgEl;
            this.color = color;
            this.maxPoints = maxPoints;
            this.data = [];
        }
        push(value) {
            this.data.push(Number(value) || 0);
            if (this.data.length > this.maxPoints) this.data.shift();
            this.render();
        }
        render() {
            if (!this.el || this.data.length < 2) return;
            const w = this.el.clientWidth || 160;
            const h = this.el.clientHeight || 34;
            this.el.setAttribute('viewBox', `0 0 ${w} ${h}`);
            this.el.setAttribute('preserveAspectRatio', 'none');

            const max = Math.max(...this.data, 1);
            const stepX = w / (this.maxPoints - 1);
            const offsetX = w - (this.data.length - 1) * stepX;

            const pts = this.data.map((v, i) => {
                const x = offsetX + i * stepX;
                const y = h - 2 - (v / max) * (h - 5);
                return [x, y];
            });

            const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
            const area = line + ` L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;

            this.el.innerHTML =
                `<path class="area" d="${area}" fill="${this.color}"></path>` +
                `<path class="line" d="${line}" stroke="${this.color}"></path>`;
        }
    }

    /* ---------- 全场景 Apple 触感振动引擎 ---------- */
    const Haptic = {
        isEnabled() {
            try {
                return localStorage.getItem('landisk_haptic_enabled') !== 'false';
            } catch (e) {
                return true;
            }
        },
        setEnabled(val) {
            try {
                localStorage.setItem('landisk_haptic_enabled', val ? 'true' : 'false');
            } catch (e) {}
        },
        _vibrate(pattern) {
            if (!Haptic.isEnabled()) return;
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try {
                    navigator.vibrate(pattern);
                } catch (e) {}
            }
        },
        light() {
            Haptic._vibrate(10);
        },
        medium() {
            Haptic._vibrate(22);
        },
        heavy() {
            Haptic._vibrate(36);
        },
        warning() {
            Haptic._vibrate([30, 50, 30]);
        },
        selection() {
            Haptic._vibrate(8);
        }
    };

    /* ---------- iOS 弹性阻尼下拉刷新组件 ---------- */
    class PullToRefresh {
        constructor(targetEl, onRefresh) {
            this.el = typeof targetEl === 'string' ? document.querySelector(targetEl) : targetEl;
            this.onRefresh = onRefresh;
            this.startY = 0;
            this.currentY = 0;
            this.isPulling = false;
            this.isRefreshing = false;
            this.threshold = 52;
            this.maxPull = 76;
            this.indicator = null;
            this.hasHapticTriggered = false;

            if (this.el) {
                this._init();
            }
        }

        _init() {
            this.indicator = document.createElement('div');
            this.indicator.className = 'ptr-indicator';
            this.indicator.innerHTML = `
                <div class="ptr-content">
                    <svg class="ptr-spinner" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round">
                        <circle cx="12" cy="12" r="9" stroke-dasharray="42" stroke-dashoffset="14"></circle>
                    </svg>
                    <span class="ptr-label">下拉刷新</span>
                </div>
            `;
            if (this.el.parentNode) {
                this.el.parentNode.insertBefore(this.indicator, this.el);
            }

            this.el.addEventListener('touchstart', (e) => {
                if (this.isRefreshing) return;
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop || this.el.scrollTop || 0;
                if (scrollTop <= 2 && e.touches.length === 1) {
                    this.startY = e.touches[0].clientY;
                    this.isPulling = true;
                    this.hasHapticTriggered = false;
                }
            }, { passive: true });

            window.addEventListener('touchmove', (e) => {
                if (!this.isPulling || this.isRefreshing || e.touches.length !== 1) return;
                const touchY = e.touches[0].clientY;
                const dy = touchY - this.startY;

                if (dy > 0) {
                    const pullDist = Math.min(this.maxPull, dy * 0.42);
                    this.currentY = pullDist;

                    this.indicator.style.height = `${pullDist}px`;
                    this.indicator.style.opacity = `${Math.min(1, pullDist / 35)}`;
                    
                    const spinner = this.indicator.querySelector('.ptr-spinner');
                    const label = this.indicator.querySelector('.ptr-label');

                    if (pullDist >= this.threshold) {
                        if (!this.hasHapticTriggered) {
                            Haptic.light();
                            this.hasHapticTriggered = true;
                        }
                        this.indicator.classList.add('ptr-ready');
                        if (label) label.textContent = '释放立即更新';
                    } else {
                        this.indicator.classList.remove('ptr-ready');
                        if (label) label.textContent = '下拉刷新';
                    }

                    if (spinner) {
                        const deg = (pullDist / this.threshold) * 360;
                        spinner.style.transform = `rotate(${deg}deg)`;
                    }
                }
            }, { passive: true });

            window.addEventListener('touchend', async () => {
                if (!this.isPulling) return;
                this.isPulling = false;

                if (this.currentY >= this.threshold && typeof this.onRefresh === 'function') {
                    this.isRefreshing = true;
                    this.indicator.classList.add('ptr-loading');
                    this.indicator.style.height = '42px';
                    const label = this.indicator.querySelector('.ptr-label');
                    if (label) label.textContent = '正在刷新...';
                    Haptic.medium();

                    try {
                        await this.onRefresh();
                    } catch (e) {}

                    setTimeout(() => {
                        this._reset();
                    }, 400);
                } else {
                    this._reset();
                }
            });
        }

        _reset() {
            this.isRefreshing = false;
            this.currentY = 0;
            this.hasHapticTriggered = false;
            if (this.indicator) {
                this.indicator.style.transition = 'height 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease-out';
                this.indicator.style.height = '0px';
                this.indicator.style.opacity = '0';
                setTimeout(() => {
                    this.indicator.className = 'ptr-indicator';
                    this.indicator.style.transition = '';
                    const label = this.indicator.querySelector('.ptr-label');
                    if (label) label.textContent = '下拉刷新';
                }, 260);
            }
        }
    }

    global.LanDiskUI = {
        toast,
        openModal,
        confirmDialog,
        promptDialog,
        showContextMenu,
        closeContextMenu,
        bindContextMenu,
        downloadUrl,
        Theme,
        Sparkline,
        Haptic,
        PullToRefresh
    };
})(typeof window !== 'undefined' ? window : this);
