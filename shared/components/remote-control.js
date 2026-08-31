/**
 * 猫步互联 Pro - 远程控制与屏幕实时镜像组件 (RemoteControl)
 * 包含：系统音量控制、电源管理（锁屏/睡眠/重启/关机/防误触弹窗）、
 * 完整远程桌面：WebSocket 实时画面流（自动回退 HTTP 轮询）、
 * 触控手势（点按=左键 / 长按=右键 / 长按拖动=拖拽 / 双指滑动=滚轮 / 双指捏合=本地缩放 / 光标模式）、
 * 远程键盘（中文文本注入 + Ctrl/Alt/Shift/Win 组合键）。
 */

(function (global) {
    'use strict';

    const I = (name, size) => (global.Icons ? global.Icons.render(name, size || 18) : '');

    class RemoteControl {
        constructor(config = {}) {
            this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
            this.getPin = config.getPin || (() => typeof localStorage !== 'undefined' ? (localStorage.getItem('lan_disk_pin') || '') : '');
            
            this.volume = 50;
            this.muted = false;
            this.isVolumeDragging = false;
            this.volumeDebounceTimer = null;

            this.screens = [];
            this.selectedDisplay = 0;
            this.isStreaming = false;
            this.fps = 10;
            this.quality = 60;
            this.scale = 0.6;
            this.touchMode = true; // 点击屏幕触发电脑鼠标点击
            this.mouseMode = false; // 光标模式：单指滑动 = 移动电脑鼠标
            this.streamTimer = null;
            this.isFramePending = false;

            // WebSocket 实时通道（画面流 + 输入事件），失败自动回退 HTTP 轮询
            this.ws = null;
            this.wsPolling = false;
            this.wsReconnectDelay = 1000;
            this.wsReconnectTimer = null;
            this._moveHttpAt = 0;

            // 键盘面板修饰键状态（ctrl/alt/shift/win）
            this.kbMods = {};

            // 放大与横屏控制
            this.zoomLevel = 1.0;
            this.panX = 0;
            this.panY = 0;
            this.isLandscapeOpen = false;
            this.landscapeRotation = 90; // 默认横屏旋转 90 度（适应手机竖握）

            this.autoSyncTimer = null;

            if (this.container) {
                this.render();
                this.init();
            }
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

        render() {
            if (!this.container) return;

            this.container.innerHTML = `
                <div class="remote-control-module" style="display:flex; flex-direction:column; gap:16px;">
                                        <!-- 1. 系统音量卡片 -->
                    <div class="glass-card remote-volume-card">
                        <div class="apple-card-title">
                            <span class="apple-card-title-text" style="display:flex; align-items:center; gap:8px;">
                                <span id="remote-vol-icon">${I('volumeHigh', 18)}</span>
                                <span>系统音量</span>
                                <span id="remote-vol-badge" class="apple-badge apple-badge-blue" style="margin-left:4px; font-size:12px; font-weight:600;">50%</span>
                            </span>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-remote-mute" title="静音切换">
                                    <span id="btn-remote-mute-text">静音</span>
                                </button>
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-remote-vol-refresh" title="同步音量">
                                    ${I('refresh', 14)}
                                </button>
                            </div>
                        </div>
                        
                        <div style="display:flex; align-items:center; gap:12px; margin: 14px 0 12px; width:100%;">
                            <span style="color:var(--apple-text-tertiary); display:flex; align-items:center; flex-shrink:0;">${I('volumeLow', 16)}</span>
                            <input type="range" id="remote-vol-slider" min="0" max="100" value="50" class="apple-range" style="flex:1; width:100%; cursor:pointer;">
                            <span style="color:var(--apple-text-tertiary); display:flex; align-items:center; flex-shrink:0;">${I('volumeHigh', 16)}</span>
                        </div>

                        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-top:8px;">
                            <button class="apple-btn apple-btn-glass apple-btn-sm" data-vol-preset="0" style="padding:6px 2px; font-size:11.5px;">0% 静音</button>
                            <button class="apple-btn apple-btn-glass apple-btn-sm" data-vol-preset="30" style="padding:6px 2px; font-size:11.5px;">30% 适中</button>
                            <button class="apple-btn apple-btn-glass apple-btn-sm" data-vol-preset="70" style="padding:6px 2px; font-size:11.5px;">70% 饱满</button>
                            <button class="apple-btn apple-btn-glass apple-btn-sm" data-vol-preset="100" style="padding:6px 2px; font-size:11.5px;">100% 满格</button>
                        </div>
                    </div>

                    <!-- 2. 电源与系统控制卡片 -->
                    <div class="glass-card remote-power-card">
                        <div class="apple-card-title">
                            <span class="apple-card-title-text" style="display:flex; align-items:center; gap:8px;">
                                ${I('zap', 18)}
                                <span>电源总控</span>
                            </span>
                            <span style="font-size:12px; color:var(--apple-text-tertiary);">防误触保护已就绪</span>
                        </div>

                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-top:12px;">
                            <button class="apple-btn apple-btn-glass" id="btn-power-lock" style="display:flex; align-items:center; justify-content:center; gap:6px; padding:10px 8px;">
                                ${I('lock', 16)}
                                <span>锁定屏幕</span>
                            </button>
                            <button class="apple-btn apple-btn-glass" id="btn-power-sleep" style="display:flex; align-items:center; justify-content:center; gap:6px; padding:10px 8px;">
                                ${I('sleep', 16)}
                                <span>系统休眠</span>
                            </button>
                            <button class="apple-btn apple-btn-glass" id="btn-power-restart" style="display:flex; align-items:center; justify-content:center; gap:6px; padding:10px 8px; color:var(--apple-orange, #ff9500);">
                                ${I('restart', 16)}
                                <span>重启电脑</span>
                            </button>
                            <button class="apple-btn apple-btn-glass" id="btn-power-shutdown" style="display:flex; align-items:center; justify-content:center; gap:6px; padding:10px 8px; color:var(--apple-red, #ff3b30);">
                                ${I('power', 16)}
                                <span>关闭电脑</span>
                            </button>
                        </div>

                        <div style="display:flex; align-items:center; gap:8px; margin-top:12px; padding-top:12px; border-top:1px solid var(--hairline);">
                            <span style="font-size:12.5px; color:var(--apple-text-secondary); white-space:nowrap; display:flex; align-items:center; gap:4px;">
                                ${I('clock', 14)} 定时关机:
                            </span>
                            <select id="remote-schedule-select" class="apple-select" style="flex:1; height:32px; font-size:12.5px;">
                                <option value="1800">30 分钟后关机</option>
                                <option value="3600" selected>1 小时后关机</option>
                                <option value="7200">2 小时后关机</option>
                                <option value="14400">4 小时后关机</option>
                            </select>
                            <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-power-schedule">执行</button>
                            <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-power-abort" title="取消所有已安排的定时关机">取消计划</button>
                        </div>
                    </div>

                                        <!-- 3. 低延迟屏幕实时镜像与交互卡片 -->
                    <div class="glass-card remote-screen-card">
                        <div class="apple-card-title" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                            <span class="apple-card-title-text" style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                ${I('screenMirror', 18)}
                                <span style="white-space:nowrap;">屏幕实时镜像</span>
                                <span id="remote-stream-status" class="apple-badge apple-badge-gray" style="font-size:11px; margin-left:2px;">未开启</span>
                            </span>
                            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                                <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-toggle-stream" style="display:flex; align-items:center; gap:4px; height:30px; padding:0 12px;">
                                    <span id="btn-stream-text">开启镜像</span>
                                </button>
                            </div>
                        </div>

                        <!-- 控制工具栏 -->
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:10px;">
                            <!-- 行 1：显示器选择与模式/缩放 -->
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <select id="remote-display-select" class="apple-select" style="flex:1; min-width:130px; height:28px; font-size:12px; padding:0 8px;">
                                    <option value="0">主显示器</option>
                                </select>
                                <select id="remote-fps-select" class="apple-select" style="height:28px; font-size:11.5px; padding:0 6px;">
                                    <option value="5">省电 (5 FPS)</option>
                                    <option value="10" selected>均衡 (10 FPS)</option>
                                    <option value="15">流畅 (15 FPS)</option>
                                    <option value="20">顺滑 (20 FPS)</option>
                                    <option value="30">极速 (30 FPS)</option>
                                    <option value="0">单帧快照</option>
                                </select>
                            </div>
                            <!-- 行 1b：画质与清晰度 -->
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <select id="remote-quality-select" class="apple-select" style="height:28px; font-size:11.5px; padding:0 6px;">
                                    <option value="40">低画质 (省流量)</option>
                                    <option value="60" selected>中画质 (均衡)</option>
                                    <option value="80">高画质 (清晰)</option>
                                </select>
                                <select id="remote-scale-select" class="apple-select" style="height:28px; font-size:11.5px; padding:0 6px;">
                                    <option value="0.4">0.4x 极速</option>
                                    <option value="0.6" selected>0.6x 均衡</option>
                                    <option value="0.8">0.8x 高清</option>
                                    <option value="1.0">1.0x 原画</option>
                                </select>
                                <select id="remote-zoom-select" class="apple-select" style="height:28px; font-size:11.5px; padding:0 6px;">
                                    <option value="1.0" selected>100% 适应</option>
                                    <option value="1.25">125%</option>
                                    <option value="1.5">150% 放大</option>
                                    <option value="2.0">200% 精细</option>
                                </select>
                            </div>
                            <!-- 行 2：触控开关与快捷动作按键 -->
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
                                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:12px; color:var(--apple-text-secondary); user-select:none;">
                                        <input type="checkbox" id="remote-touch-toggle" checked style="accent-color:var(--apple-blue); width:15px; height:15px; cursor:pointer;">
                                        <span>触控点击映射</span>
                                    </label>
                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:12px; color:var(--apple-text-secondary); user-select:none;" title="开启后：单指滑动直接移动电脑鼠标光标">
                                        <input type="checkbox" id="remote-mouse-toggle" style="accent-color:var(--apple-blue); width:15px; height:15px; cursor:pointer;">
                                        <span>🖱️ 光标模式</span>
                                    </label>
                                </div>
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-card-kb" style="height:28px; font-size:11.5px; padding:0 8px;" title="远程键盘：打字与快捷键">
                                        ⌨️ 键盘
                                    </button>
                                    <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-screen-landscape" style="height:28px; font-size:11.5px; padding:0 10px; background:linear-gradient(135deg, #007aff, #5856d6);" title="放大横屏沉浸显示">
                                        ${I('rotateCw', 13)} 放大横屏
                                    </button>
                                    <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-screen-snap" style="height:28px; font-size:11.5px; padding:0 8px;">
                                        ${I('camera', 13)} 截帧
                                    </button>
                                    <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-screen-fullscreen" style="height:28px; font-size:11.5px; padding:0 8px;" title="全屏视口">
                                        ${I('maximize', 13)} 全屏
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- 屏幕视口区域 -->
                        <div id="remote-screen-viewport" style="position:relative; width:100%; border-radius:12px; overflow:hidden; background:#07090e; display:flex; align-items:center; justify-content:center; min-height:220px; border:1px solid var(--apple-border); touch-action:none; cursor:crosshair;">
                            <div id="remote-screen-stage" style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; transition:transform 0.15s ease-out; transform-origin:center center;">
                                <img id="remote-screen-img" alt="电脑桌面画面" style="max-width:100%; max-height:75vh; object-fit:contain; display:none; pointer-events:none; user-select:none; -webkit-user-drag:none;">
                                <div id="remote-click-ripple" style="position:absolute; width:28px; height:28px; border-radius:50%; border:2.5px solid var(--apple-blue); pointer-events:none; transform:translate(-50%, -50%) scale(0); opacity:0; transition:transform 0.35s cubic-bezier(0.1, 0.9, 0.2, 1), opacity 0.35s ease-out; box-shadow:0 0 10px rgba(0,122,255,0.6); z-index:10;"></div>
                            </div>
                            <div id="remote-screen-placeholder" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--apple-text-tertiary); padding:36px 16px;">
                                <div style="width:48px; height:48px; border-radius:50%; background:var(--mat-regular); display:flex; align-items:center; justify-content:center;">
                                    ${I('monitor', 24)}
                                </div>
                                <span style="font-size:13px;">点击右上角「开启镜像」或「放大横屏」实时查看与触控电脑</span>
                                <span style="font-size:11px; color:var(--apple-text-tertiary); opacity:0.8;">点按=左键 · 长按=右键 · 长按拖动=拖拽 · 双指滑动=滚轮</span>
                            </div>
                        </div>

                        <!-- 远程键盘面板（卡片内） -->
                        <div id="remote-kb-panel" style="display:none; margin-top:10px;">
                            ${this._renderKeyboardHTML('card')}
                        </div>
                    </div>
                </div>

                <!-- 4. 沉浸式横屏全屏 Modal 浮层 -->
                <div id="remote-landscape-modal" style="display:none; position:fixed; inset:0; z-index:99999; background:#000; overflow:hidden; touch-action:none; user-select:none;">
                    <!-- 浮动控制胶囊 -->
                    <div id="remote-landscape-bar" style="position:absolute; top:12px; left:50%; transform:translateX(-50%); z-index:100000; background:rgba(28,28,30,0.85); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.15); border-radius:24px; padding:6px 12px; display:flex; align-items:center; gap:10px; box-shadow:0 8px 32px rgba(0,0,0,0.6); color:#fff; font-size:12px; max-width:96vw; flex-wrap:wrap; justify-content:center;">
                        <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-ls-rotate" style="height:26px; padding:0 8px; font-size:11.5px; border-radius:14px;">
                            ${I('rotateCw', 13)} 旋转 <span id="lbl-ls-rotation">90°</span>
                        </button>
                        <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-ls-zoom" style="height:26px; padding:0 8px; font-size:11.5px; border-radius:14px;">
                            ${I('zoomIn', 13)} <span id="lbl-ls-zoom">100%</span>
                        </button>
                        <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-ls-reset" style="height:26px; padding:0 8px; font-size:11.5px; border-radius:14px;" title="重置画面居中">
                            ⟲ 居中
                        </button>
                        <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-ls-touch" style="height:26px; padding:0 8px; font-size:11.5px; border-radius:14px;">
                            <span id="lbl-ls-touch">👆 触控:开</span>
                        </button>
                        <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-ls-mouse" style="height:26px; padding:0 8px; font-size:11.5px; border-radius:14px;" title="开启后单指滑动移动电脑鼠标">
                            <span id="lbl-ls-mouse">🖱️ 光标:关</span>
                        </button>
                        <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-ls-keyboard" style="height:26px; padding:0 8px; font-size:11.5px; border-radius:14px;" title="远程键盘">
                            ⌨️ 键盘
                        </button>
                        <button class="apple-btn apple-btn-danger apple-btn-sm" id="btn-ls-close" style="height:26px; padding:0 10px; font-size:11.5px; border-radius:14px;">
                            ✕ 退出横屏
                        </button>
                    </div>

                    <!-- 横屏视口 -->
                    <div id="remote-ls-container" style="width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative;">
                        <div id="remote-ls-stage" style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; transition:transform 0.15s ease-out; transform-origin:center center;">
                            <img id="remote-ls-img" alt="电脑桌面横屏画面" style="max-width:100%; max-height:100%; object-fit:contain; pointer-events:none; user-select:none; -webkit-user-drag:none;">
                            <div id="remote-ls-ripple" style="position:absolute; width:32px; height:32px; border-radius:50%; border:2.5px solid var(--apple-blue); pointer-events:none; transform:translate(-50%, -50%) scale(0); opacity:0; transition:transform 0.35s cubic-bezier(0.1, 0.9, 0.2, 1), opacity 0.35s ease-out; box-shadow:0 0 12px rgba(0,122,255,0.7); z-index:100;"></div>
                        </div>
                    </div>

                    <!-- 横屏键盘面板 -->
                    <div id="remote-ls-kb-panel" style="display:none; position:absolute; left:0; right:0; bottom:0; z-index:100001; background:rgba(20,20,22,0.94); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); border-top:1px solid rgba(255,255,255,0.12); padding:10px 12px calc(10px + env(safe-area-inset-bottom, 0px)); max-height:52vh; overflow-y:auto;">
                        ${this._renderKeyboardHTML('ls')}
                    </div>
                </div>
            `;
        }

        _renderKeyboardHTML(prefix) {
            const keys = [
                ['esc', 'Esc'], ['tab', 'Tab'], ['enter', 'Enter'], ['backspace', '⌫ 退格'],
                ['delete', 'Del'], ['space', 'Space'], ['home', 'Home'], ['end', 'End'],
                ['pageup', 'PgUp'], ['pagedown', 'PgDn'], ['up', '↑'], ['down', '↓'],
                ['left', '←'], ['right', '→']
            ];
            const fkeys = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'];
            const mods = [
                ['ctrl', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift'], ['win', 'Win']
            ];
            const keyBtn = (k, label, extra = '') =>
                `<button class="apple-btn apple-btn-glass apple-btn-sm" data-kb-key="${k}" style="height:30px; font-size:11px; padding:0; ${extra}">${label}</button>`;
            return `
                <div class="remote-kb" data-kb-panel="${prefix}" style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="text" data-kb-input placeholder="输入要发送到电脑的文字，支持中文…" style="flex:1; min-width:0; height:36px; border-radius:10px; border:1px solid var(--apple-border); background:var(--mat-regular, rgba(120,120,128,0.12)); color:var(--apple-text-primary, #fff); padding:0 10px; font-size:13px; outline:none;">
                        <button class="apple-btn apple-btn-primary apple-btn-sm" data-kb-send style="height:36px; padding:0 14px;">发送</button>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                        <span style="font-size:11px; color:var(--apple-text-tertiary);">组合键:</span>
                        ${mods.map(([m, label]) => `<button class="apple-btn apple-btn-glass apple-btn-sm" data-kb-mod="${m}" style="height:24px; padding:0 10px; font-size:11px; border-radius:12px;">${label}</button>`).join('')}
                        <span style="font-size:10.5px; color:var(--apple-text-tertiary);">先点亮修饰键，再按目标键（如 Ctrl → C）</span>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap:5px;">
                        ${keys.map(([k, label]) => keyBtn(k, label)).join('')}
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(12, 1fr); gap:4px;">
                        ${fkeys.map(k => keyBtn(k, k.toUpperCase(), 'font-size:9.5px;')).join('')}
                    </div>
                </div>
            `;
        }

        init() {
            this._bindEvents();
            this.fetchScreens();
            this.fetchVolume();
            this.startAutoSync();
        }

        _bindEvents() {
            if (!this.container) return;

            // 音量滑动调节
            const volSlider = this.container.querySelector('#remote-vol-slider');
            if (volSlider) {
                volSlider.addEventListener('input', (e) => {
                    this.isVolumeDragging = true;
                    const val = parseInt(e.target.value, 10);
                    this._updateVolumeUI(val, this.muted);
                    
                    clearTimeout(this.volumeDebounceTimer);
                    this.volumeDebounceTimer = setTimeout(() => {
                        this.setVolume(val);
                    }, 120);
                });

                volSlider.addEventListener('change', () => {
                    this.isVolumeDragging = false;
                });
            }

            // 静音按钮
            const muteBtn = this.container.querySelector('#btn-remote-mute');
            if (muteBtn) {
                muteBtn.addEventListener('click', () => {
                    this.toggleMute();
                });
            }

            // 音量刷新按钮
            const volRefreshBtn = this.container.querySelector('#btn-remote-vol-refresh');
            if (volRefreshBtn) {
                volRefreshBtn.addEventListener('click', () => {
                    this.fetchVolume(true);
                });
            }

            // 快捷音量预设按钮
            this.container.querySelectorAll('[data-vol-preset]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetVol = parseInt(btn.getAttribute('data-vol-preset'), 10);
                    if (targetVol === 0) {
                        this.setVolume(0, true);
                    } else {
                        this.setVolume(targetVol, false);
                    }
                });
            });

            // 电源控制按钮绑定
            const lockBtn = this.container.querySelector('#btn-power-lock');
            if (lockBtn) {
                lockBtn.addEventListener('click', async () => {
                    const ok = await this._confirmAction('锁定屏幕', '确定要立即锁定电脑屏幕吗？');
                    if (ok) this.sendPowerAction('lock');
                });
            }

            const sleepBtn = this.container.querySelector('#btn-power-sleep');
            if (sleepBtn) {
                sleepBtn.addEventListener('click', async () => {
                    const ok = await this._confirmAction('系统休眠', '确定要让电脑进入睡眠休眠状态吗？休眠后局域网连接可能会断开。');
                    if (ok) this.sendPowerAction('sleep');
                });
            }

            const restartBtn = this.container.querySelector('#btn-power-restart');
            if (restartBtn) {
                restartBtn.addEventListener('click', async () => {
                    const ok = await this._confirmAction('重启电脑', '确定要立即重启电脑吗？未保存的工作可能会丢失！', true);
                    if (ok) this.sendPowerAction('restart');
                });
            }

            const shutdownBtn = this.container.querySelector('#btn-power-shutdown');
            if (shutdownBtn) {
                shutdownBtn.addEventListener('click', async () => {
                    const ok = await this._confirmAction('关闭电脑', '确定要立即关闭电脑吗？未保存的工作可能会丢失！', true);
                    if (ok) this.sendPowerAction('shutdown');
                });
            }

            const scheduleBtn = this.container.querySelector('#btn-power-schedule');
            if (scheduleBtn) {
                scheduleBtn.addEventListener('click', async () => {
                    const sel = this.container.querySelector('#remote-schedule-select');
                    const sec = parseInt(sel.value, 10) || 3600;
                    const mins = Math.round(sec / 60);
                    const ok = await this._confirmAction('定时关机', `确定要设置电脑在 ${mins} 分钟后自动关机吗？`);
                    if (ok) this.sendPowerAction('schedule', sec);
                });
            }

            const abortBtn = this.container.querySelector('#btn-power-abort');
            if (abortBtn) {
                abortBtn.addEventListener('click', () => {
                    this.sendPowerAction('abort');
                });
            }

            // 屏幕镜像控制
            const toggleStreamBtn = this.container.querySelector('#btn-toggle-stream');
            if (toggleStreamBtn) {
                toggleStreamBtn.addEventListener('click', () => {
                    if (this.isStreaming) {
                        this.stopStream();
                    } else {
                        this.startStream();
                    }
                });
            }

            const displaySel = this.container.querySelector('#remote-display-select');
            if (displaySel) {
                displaySel.addEventListener('change', (e) => {
                    this.selectedDisplay = parseInt(e.target.value, 10) || 0;
                    if (this.isStreaming) {
                        if (this.ws && this.ws.readyState === 1 && this.fps > 0) {
                            this._wsStartStream();
                        } else {
                            this.captureFrame();
                        }
                    }
                });
            }

            const fpsSel = this.container.querySelector('#remote-fps-select');
            if (fpsSel) {
                fpsSel.addEventListener('change', (e) => {
                    this.fps = parseInt(e.target.value, 10);
                    if (this.isStreaming) {
                        this.startStream(); // 重新调整定时器
                    }
                });
            }

            const snapBtn = this.container.querySelector('#btn-screen-snap');
            if (snapBtn) {
                snapBtn.addEventListener('click', () => {
                    this.captureFrame(true);
                });
            }

            const fullscreenBtn = this.container.querySelector('#btn-screen-fullscreen');
            if (fullscreenBtn) {
                fullscreenBtn.addEventListener('click', () => {
                    const viewport = this.container.querySelector('#remote-screen-viewport');
                    if (!document.fullscreenElement) {
                        if (viewport.requestFullscreen) viewport.requestFullscreen();
                        else if (viewport.webkitRequestFullscreen) viewport.webkitRequestFullscreen();
                    } else {
                        if (document.exitFullscreen) document.exitFullscreen();
                    }
                });
            }

            // 放大横屏按钮
            const landscapeBtn = this.container.querySelector('#btn-screen-landscape');
            if (landscapeBtn) {
                landscapeBtn.addEventListener('click', () => {
                    this.enterLandscapeMode();
                });
            }

            const zoomSel = this.container.querySelector('#remote-zoom-select');
            if (zoomSel) {
                zoomSel.addEventListener('change', (e) => {
                    this.zoomLevel = parseFloat(e.target.value) || 1.0;
                    this.panX = 0;
                    this.panY = 0;
                    this._updateStageTransform();
                });
            }

            // 画质/清晰度变化：流式中即时重启画面流（WS 通道直接重发 start）
            const restartIfStreaming = () => {
                if (!this.isStreaming) return;
                if (this.ws && this.ws.readyState === 1) {
                    this._wsStartStream();
                } else if (this.fps > 0) {
                    this.captureFrame();
                }
            };
            const qualitySel = this.container.querySelector('#remote-quality-select');
            if (qualitySel) {
                qualitySel.addEventListener('change', (e) => {
                    this.quality = parseInt(e.target.value, 10) || 60;
                    restartIfStreaming();
                });
            }
            const scaleSel = this.container.querySelector('#remote-scale-select');
            if (scaleSel) {
                scaleSel.addEventListener('change', (e) => {
                    this.scale = parseFloat(e.target.value) || 0.6;
                    restartIfStreaming();
                });
            }

            // 光标模式开关（单指滑动移动电脑鼠标）
            const mouseToggle = this.container.querySelector('#remote-mouse-toggle');
            if (mouseToggle) {
                mouseToggle.addEventListener('change', (e) => {
                    this.mouseMode = !!e.target.checked;
                });
            }

            // 键盘面板开合（卡片内 / 横屏内）
            const cardKbBtn = this.container.querySelector('#btn-card-kb');
            if (cardKbBtn) {
                cardKbBtn.addEventListener('click', () => {
                    const panel = this.container.querySelector('#remote-kb-panel');
                    if (panel) {
                        const show = panel.style.display === 'none';
                        panel.style.display = show ? 'block' : 'none';
                        cardKbBtn.classList.toggle('apple-btn-primary', show);
                        if (show) {
                            const inp = panel.querySelector('[data-kb-input]');
                            if (inp) setTimeout(() => inp.focus(), 60);
                        }
                    }
                });
            }

            // 键盘面板事件委托（修饰键 / 按键 / 发送，两个面板共用）
            this.container.addEventListener('click', (e) => {
                const modChip = e.target.closest('[data-kb-mod]');
                if (modChip) {
                    const m = modChip.getAttribute('data-kb-mod');
                    this.kbMods[m] = !this.kbMods[m];
                    this._updateKbChips();
                    return;
                }
                const keyBtn = e.target.closest('[data-kb-key]');
                if (keyBtn) {
                    this._sendKey(keyBtn.getAttribute('data-kb-key'));
                    return;
                }
                const sendBtn = e.target.closest('[data-kb-send]');
                if (sendBtn) {
                    const panel = sendBtn.closest('.remote-kb');
                    const inp = panel ? panel.querySelector('[data-kb-input]') : null;
                    if (inp && inp.value) {
                        this._sendText(inp.value);
                        inp.value = '';
                        inp.blur();
                    }
                    return;
                }
            });

            // 键盘面板输入框：回车直接发送
            this.container.querySelectorAll('.remote-kb [data-kb-input]').forEach(inp => {
                inp.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        if (inp.value) {
                            this._sendText(inp.value);
                            inp.value = '';
                            inp.blur();
                        }
                    }
                    ev.stopPropagation();
                });
            });

            // 普通视口交互
            this._setupViewportInteraction(
                this.container.querySelector('#remote-screen-viewport'),
                this.container.querySelector('#remote-screen-stage'),
                this.container.querySelector('#remote-screen-img'),
                this.container.querySelector('#remote-click-ripple'),
                () => 0
            );

            // 横屏 Modal 浮层配置
            this._setupLandscapeModal();
        }

        _setupLandscapeModal() {
            const modal = document.querySelector('#remote-landscape-modal');
            if (!modal) return;

            const closeBtn = modal.querySelector('#btn-ls-close');
            if (closeBtn) closeBtn.addEventListener('click', () => this.exitLandscapeMode());

            const rotateBtn = modal.querySelector('#btn-ls-rotate');
            if (rotateBtn) {
                rotateBtn.addEventListener('click', () => {
                    const angles = [0, 90, 180, 270];
                    const nextIdx = (angles.indexOf(this.landscapeRotation) + 1) % angles.length;
                    this.landscapeRotation = angles[nextIdx];
                    modal.querySelector('#lbl-ls-rotation').textContent = `${this.landscapeRotation}°`;
                    this.panX = 0;
                    this.panY = 0;
                    this._updateLandscapeTransform();
                });
            }

            const zoomBtn = modal.querySelector('#btn-ls-zoom');
            if (zoomBtn) {
                zoomBtn.addEventListener('click', () => {
                    const levels = [1.0, 1.25, 1.5, 2.0];
                    const nextIdx = (levels.indexOf(this.zoomLevel) + 1) % levels.length;
                    this.zoomLevel = levels[nextIdx];
                    modal.querySelector('#lbl-ls-zoom').textContent = `${Math.round(this.zoomLevel * 100)}%`;
                    this._updateLandscapeTransform();
                });
            }

            const resetBtn = modal.querySelector('#btn-ls-reset');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    this.zoomLevel = 1.0;
                    this.panX = 0;
                    this.panY = 0;
                    modal.querySelector('#lbl-ls-zoom').textContent = '100%';
                    this._updateLandscapeTransform();
                });
            }

            const touchBtn = modal.querySelector('#btn-ls-touch');
            if (touchBtn) {
                touchBtn.addEventListener('click', () => {
                    this.touchMode = !this.touchMode;
                    modal.querySelector('#lbl-ls-touch').textContent = this.touchMode ? '👆 触控:开' : '👆 触控:关';
                    const mainToggle = this.container.querySelector('#remote-touch-toggle');
                    if (mainToggle) mainToggle.checked = this.touchMode;
                });
            }

            // 横屏光标模式开关（与卡片开关联动）
            const lsMouseBtn = modal.querySelector('#btn-ls-mouse');
            if (lsMouseBtn) {
                lsMouseBtn.addEventListener('click', () => {
                    this.mouseMode = !this.mouseMode;
                    modal.querySelector('#lbl-ls-mouse').textContent = this.mouseMode ? '🖱️ 光标:开' : '🖱️ 光标:关';
                    const mainToggle = this.container.querySelector('#remote-mouse-toggle');
                    if (mainToggle) mainToggle.checked = this.mouseMode;
                });
            }

            // 横屏键盘面板开合
            const lsKbBtn = modal.querySelector('#btn-ls-keyboard');
            if (lsKbBtn) {
                lsKbBtn.addEventListener('click', () => {
                    const panel = modal.querySelector('#remote-ls-kb-panel');
                    if (panel) {
                        const show = panel.style.display === 'none';
                        panel.style.display = show ? 'block' : 'none';
                        lsKbBtn.classList.toggle('apple-btn-primary', show);
                        if (show) {
                            const inp = panel.querySelector('[data-kb-input]');
                            if (inp) setTimeout(() => inp.focus(), 60);
                        }
                    }
                });
            }

            // 监听键盘 ESC 退出横屏
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isLandscapeOpen) {
                    this.exitLandscapeMode();
                }
            });

            // 横屏视口交互
            this._setupViewportInteraction(
                modal.querySelector('#remote-ls-container'),
                modal.querySelector('#remote-ls-stage'),
                modal.querySelector('#remote-ls-img'),
                modal.querySelector('#remote-ls-ripple'),
                () => this.landscapeRotation
            );
        }

        enterLandscapeMode() {
            this.isLandscapeOpen = true;
            const modal = document.querySelector('#remote-landscape-modal');
            if (!modal) return;

            if (global.LanDiskUI && global.LanDiskUI.Haptic) {
                global.LanDiskUI.Haptic.heavy();
            }

            // 自动检测屏幕方向：坚握手机（高 > 宽）默认旋转 90 度填充
            const isPortrait = window.innerHeight > window.innerWidth;
            this.landscapeRotation = isPortrait ? 90 : 0;
            this.zoomLevel = 1.0;
            this.panX = 0;
            this.panY = 0;

            const rotLbl = modal.querySelector('#lbl-ls-rotation');
            if (rotLbl) rotLbl.textContent = `${this.landscapeRotation}°`;
            const zoomLbl = modal.querySelector('#lbl-ls-zoom');
            if (zoomLbl) zoomLbl.textContent = '100%';

            modal.style.display = 'block';

            if (screen && screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            }

            if (!this.isStreaming) {
                this.startStream();
            } else {
                this._syncLandscapeFrame();
            }

            this._updateLandscapeTransform();
            this._toast('已进入全屏横屏模式，可自由缩放与触控', 'info');
        }

        exitLandscapeMode() {
            this.isLandscapeOpen = false;
            const modal = document.querySelector('#remote-landscape-modal');
            if (modal) modal.style.display = 'none';

            if (screen && screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock().catch(() => {});
            }
        }

        _updateStageTransform() {
            const stage = this.container.querySelector('#remote-screen-stage');
            if (stage) {
                stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
            }
        }

        _updateLandscapeTransform() {
            const stage = document.querySelector('#remote-ls-stage');
            const container = document.querySelector('#remote-ls-container');
            if (!stage || !container) return;

            const isRotated = (this.landscapeRotation === 90 || this.landscapeRotation === 270);
            if (isRotated) {
                stage.style.width = '100vh';
                stage.style.height = '100vw';
            } else {
                stage.style.width = '100vw';
                stage.style.height = '100vh';
            }

            stage.style.transform = `rotate(${this.landscapeRotation}deg) translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
        }

        _syncLandscapeFrame() {
            const normalImg = this.container.querySelector('#remote-screen-img');
            const lsImg = document.querySelector('#remote-ls-img');
            if (normalImg && lsImg && normalImg.src) {
                lsImg.src = normalImg.src;
                lsImg.style.display = 'block';
            }
        }

        _setupViewportInteraction(viewportEl, stageEl, imgEl, rippleEl, getRotation) {
            if (!viewportEl || !imgEl) return;

            // ---- 单指状态 ----
            let pressTime = 0;
            let startX = 0, startY = 0;
            let prevX = 0, prevY = 0;
            let moved = false;             // 位移超过阈值
            let longPressFired = false;    // 长按已触发
            let dragActive = false;        // 电脑左键按住拖拽中
            let lastDragPoint = null;
            let longPressTimer = null;
            let lastMoveSent = 0;

            // ---- 双指状态 ----
            let twoFinger = null;          // {mode:'detect'|'scroll'|'pinch', pinch0, zoom0, midX, midY, accDy, lastSend}

            const touchEnabled = () => this.isLandscapeOpen
                ? this.touchMode
                : (this.container.querySelector('#remote-touch-toggle')?.checked ?? true);

            const clearLongPress = () => {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            };

            const beginLongPress = (clientX, clientY) => {
                clearLongPress();
                longPressTimer = setTimeout(() => {
                    longPressFired = true;
                    if (global.LanDiskUI && global.LanDiskUI.Haptic) global.LanDiskUI.Haptic.heavy();
                    this._showRippleAt(rippleEl, viewportEl, clientX, clientY);
                }, 450);
            };

            const cancelSinglePointer = () => {
                clearLongPress();
                if (dragActive) {
                    dragActive = false;
                    if (lastDragPoint) this._sendInput({ type: 'up', x: lastDragPoint.x, y: lastDragPoint.y, button: 'left' });
                    lastDragPoint = null;
                }
                moved = false;
                longPressFired = false;
            };

            // 单指按下
            const pointerDown = (clientX, clientY) => {
                pressTime = Date.now();
                startX = prevX = clientX;
                startY = prevY = clientY;
                moved = false;
                longPressFired = false;
                dragActive = false;
                beginLongPress(clientX, clientY);
            };

            // 单指移动
            const pointerMove = (clientX, clientY) => {
                if (twoFinger) return;
                const dist = Math.hypot(clientX - startX, clientY - startY);
                if (dist > 10 && !moved) {
                    moved = true;
                    clearLongPress();
                    // 长按后移动 = 电脑左键按住拖拽
                    if (longPressFired && touchEnabled()) {
                        dragActive = true;
                        const p = this._mapClientToPhysical(startX, startY, viewportEl, imgEl, getRotation());
                        if (p) {
                            lastDragPoint = p;
                            this._sendInput({ type: 'down', x: p.x, y: p.y, button: 'left' });
                        }
                    }
                }
                if (dragActive) {
                    const now = Date.now();
                    if (now - lastMoveSent > 40) {
                        lastMoveSent = now;
                        const p = this._mapClientToPhysical(clientX, clientY, viewportEl, imgEl, getRotation());
                        if (p) {
                            lastDragPoint = p;
                            this._sendInput({ type: 'move', x: p.x, y: p.y });
                        }
                    }
                    prevX = clientX; prevY = clientY;
                    return;
                }
                if (moved && !longPressFired) {
                    if (this.mouseMode && touchEnabled()) {
                        // 光标模式：单指滑动 = 移动电脑鼠标光标
                        const now = Date.now();
                        if (now - lastMoveSent > 50) {
                            lastMoveSent = now;
                            const p = this._mapClientToPhysical(clientX, clientY, viewportEl, imgEl, getRotation());
                            if (p) this._sendInput({ type: 'move', x: p.x, y: p.y });
                        }
                    } else if (this.zoomLevel > 1.0) {
                        // 放大后：单指平移画布（原有行为）
                        const rot = getRotation();
                        const rad = -rot * Math.PI / 180;
                        const dx = clientX - prevX;
                        const dy = clientY - prevY;
                        const unrotDx = dx * Math.cos(rad) - dy * Math.sin(rad);
                        const unrotDy = dx * Math.sin(rad) + dy * Math.cos(rad);
                        this.panX += unrotDx * 0.8;
                        this.panY += unrotDy * 0.8;
                        if (this.isLandscapeOpen) this._updateLandscapeTransform();
                        else this._updateStageTransform();
                    }
                }
                prevX = clientX; prevY = clientY;
            };

            // 单指抬起
            const pointerUp = (clientX, clientY, button = 'left') => {
                clearLongPress();
                if (dragActive) {
                    dragActive = false;
                    const p = this._mapClientToPhysical(clientX, clientY, viewportEl, imgEl, getRotation()) || lastDragPoint;
                    if (p) this._sendInput({ type: 'up', x: p.x, y: p.y, button: 'left' });
                    lastDragPoint = null;
                    return;
                }
                const pressDuration = Date.now() - pressTime;
                const dist = Math.hypot(clientX - startX, clientY - startY);
                if (longPressFired && dist < 14) {
                    // 长按未移动 = 右键
                    this._executeMappedClick(clientX, clientY, viewportEl, imgEl, rippleEl, getRotation(), 'right');
                } else if (dist < 10 && pressDuration < 450) {
                    this._executeMappedClick(clientX, clientY, viewportEl, imgEl, rippleEl, getRotation(), button);
                }
                longPressFired = false;
            };

            // ---- 双指：滚轮 + 捏合缩放 ----
            const twoFingerStart = (touches) => {
                cancelSinglePointer();
                const dx = touches[1].clientX - touches[0].clientX;
                const dy = touches[1].clientY - touches[0].clientY;
                twoFinger = {
                    mode: 'detect',
                    pinch0: Math.hypot(dx, dy) || 1,
                    zoom0: this.zoomLevel,
                    midX: (touches[0].clientX + touches[1].clientX) / 2,
                    midY: (touches[0].clientY + touches[1].clientY) / 2,
                    accDy: 0,
                    lastSend: 0
                };
            };

            const twoFingerMove = (touches) => {
                if (!twoFinger) return;
                const dx = touches[1].clientX - touches[0].clientX;
                const dy = touches[1].clientY - touches[0].clientY;
                const pinch = Math.hypot(dx, dy) || 1;
                const midX = (touches[0].clientX + touches[1].clientX) / 2;
                const midY = (touches[0].clientY + touches[1].clientY) / 2;
                const ratio = pinch / twoFinger.pinch0;

                if (twoFinger.mode === 'detect') {
                    if (Math.abs(ratio - 1) > 0.12) twoFinger.mode = 'pinch';
                    else if (Math.abs(midY - twoFinger.midY) > 8) twoFinger.mode = 'scroll';
                }

                if (twoFinger.mode === 'pinch') {
                    this.zoomLevel = Math.max(0.5, Math.min(4, Math.round(twoFinger.zoom0 * ratio * 20) / 20));
                    this.panX = 0;
                    this.panY = 0;
                    if (this.isLandscapeOpen) {
                        const zl = document.querySelector('#lbl-ls-zoom');
                        if (zl) zl.textContent = `${Math.round(this.zoomLevel * 100)}%`;
                        this._updateLandscapeTransform();
                    } else {
                        const zs = this.container.querySelector('#remote-zoom-select');
                        if (zs) {
                            const opt = Array.from(zs.options).find(o => parseFloat(o.value) === this.zoomLevel);
                            zs.value = opt ? opt.value : '1.0';
                        }
                        this._updateStageTransform();
                    }
                } else if (twoFinger.mode === 'scroll' && touchEnabled()) {
                    twoFinger.accDy += midY - twoFinger.midY;
                    const now = Date.now();
                    if (Math.abs(twoFinger.accDy) >= 36 && now - twoFinger.lastSend > 60) {
                        const steps = Math.round(twoFinger.accDy / 36);
                        twoFinger.accDy -= steps * 36;
                        twoFinger.lastSend = now;
                        const p = this._mapClientToPhysical(midX, midY, viewportEl, imgEl, getRotation());
                        // 手指上滑（dy<0）= 滚轮向下（delta 负）→ 页面内容向上，符合手机直觉
                        this._sendInput({ type: 'scroll', delta: -steps, x: p ? p.x : undefined, y: p ? p.y : undefined });
                    }
                }
                twoFinger.midX = midX;
                twoFinger.midY = midY;
            };

            const twoFingerEnd = () => { twoFinger = null; };

            // ---- PC 鼠标：按下即 down，移动为拖拽，抬起为 up（真实鼠标语义）----
            let mouseDownActive = false;
            viewportEl.addEventListener('mousedown', (e) => {
                if (e.target.closest('#remote-landscape-bar') || e.target.closest('.remote-kb')) return;
                if (!touchEnabled()) return;
                e.preventDefault();
                mouseDownActive = true;
                const btn = e.button === 2 ? 'right' : 'left';
                const p = this._mapClientToPhysical(e.clientX, e.clientY, viewportEl, imgEl, getRotation());
                if (p) this._sendInput({ type: 'down', x: p.x, y: p.y, button: btn });
                const onMove = (ev) => {
                    if (!mouseDownActive) return;
                    const now = Date.now();
                    if (now - lastMoveSent < 30) return;
                    lastMoveSent = now;
                    const q = this._mapClientToPhysical(ev.clientX, ev.clientY, viewportEl, imgEl, getRotation());
                    if (q) this._sendInput({ type: 'move', x: q.x, y: q.y });
                };
                const onUp = (ev) => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    if (!mouseDownActive) return;
                    mouseDownActive = false;
                    const q = this._mapClientToPhysical(ev.clientX, ev.clientY, viewportEl, imgEl, getRotation());
                    if (q) this._sendInput({ type: 'up', x: q.x, y: q.y, button: btn });
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            viewportEl.addEventListener('contextmenu', (e) => e.preventDefault());

            // PC 滚轮直接映射
            viewportEl.addEventListener('wheel', (e) => {
                if (!touchEnabled()) return;
                e.preventDefault();
                const steps = Math.max(-3, Math.min(3, Math.round(-e.deltaY / 100)));
                if (!steps) return;
                const p = this._mapClientToPhysical(e.clientX, e.clientY, viewportEl, imgEl, getRotation());
                this._sendInput({ type: 'scroll', delta: steps, x: p ? p.x : undefined, y: p ? p.y : undefined });
            }, { passive: false });

            // ---- 触控事件绑定 ----
            const inGuard = (e) => e.target.closest('#remote-landscape-bar') || e.target.closest('.remote-kb');

            viewportEl.addEventListener('touchstart', (e) => {
                if (inGuard(e)) return;
                if (e.touches.length === 2) {
                    twoFingerStart(e.touches);
                } else if (e.touches.length === 1) {
                    pointerDown(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: true });

            viewportEl.addEventListener('touchmove', (e) => {
                if (inGuard(e)) return;
                if (e.touches.length === 2) {
                    twoFingerMove(e.touches);
                } else if (e.touches.length === 1 && !twoFinger) {
                    pointerMove(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: true });

            const onTouchEnd = (e) => {
                if (inGuard(e)) return;
                if (e.touches.length === 0) {
                    if (twoFinger) { twoFingerEnd(); return; }
                    if (e.changedTouches.length > 0) {
                        pointerUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
                    }
                } else if (e.touches.length === 1 && twoFinger) {
                    twoFingerEnd();
                    // 剩余一指重新作为单指起点，避免误触发点击
                    pressTime = Date.now();
                    startX = prevX = e.touches[0].clientX;
                    startY = prevY = e.touches[0].clientY;
                    moved = true; // 剩余一指只做平移/光标，不再触发点击
                    longPressFired = false;
                }
            };
            viewportEl.addEventListener('touchend', onTouchEnd, { passive: true });
            viewportEl.addEventListener('touchcancel', (e) => {
                if (twoFinger) twoFingerEnd();
                cancelSinglePointer();
            }, { passive: true });
        }

        // 将视口内客户坐标（含旋转/缩放/平移逆变换）映射为电脑物理屏幕像素；黑边外返回 null
        _mapClientToPhysical(clientX, clientY, viewportEl, imgEl, rotation) {
            if (!imgEl || !imgEl.src || imgEl.style.display === 'none') return null;
            if (!viewportEl) return null;

            const vpRect = viewportEl.getBoundingClientRect();
            const centerX = vpRect.left + vpRect.width / 2;
            const centerY = vpRect.top + vpRect.height / 2;

            // 1. 向量逆旋转
            const dx = clientX - centerX;
            const dy = clientY - centerY;
            const rad = -rotation * Math.PI / 180;
            const rotX = dx * Math.cos(rad) - dy * Math.sin(rad);
            const rotY = dx * Math.sin(rad) + dy * Math.cos(rad);

            // 2. 缩放与平移逆变换
            const unzoomedX = (rotX - this.panX) / this.zoomLevel;
            const unzoomedY = (rotY - this.panY) / this.zoomLevel;

            // 3. 计算图片在未旋转视口中的渲染包围盒 (object-fit: contain)
            const isRotated = (rotation === 90 || rotation === 270);
            const boxWidth = isRotated ? vpRect.height : vpRect.width;
            const boxHeight = isRotated ? vpRect.width : vpRect.height;

            const imgNatW = imgEl.naturalWidth || 1920;
            const imgNatH = imgEl.naturalHeight || 1080;
            const imgAR = imgNatW / imgNatH;
            const boxAR = boxWidth / boxHeight;

            let renderedW, renderedH;
            if (boxAR > imgAR) {
                renderedH = boxHeight;
                renderedW = boxHeight * imgAR;
            } else {
                renderedW = boxWidth;
                renderedH = boxWidth / imgAR;
            }

            // 4. 计算归一化坐标 (0.0 ~ 1.0)
            const normX = (unzoomedX + renderedW / 2) / renderedW;
            const normY = (unzoomedY + renderedH / 2) / renderedH;

            if (normX < 0 || normX > 1 || normY < 0 || normY > 1) {
                return null; // 点击在黑边以外区域
            }

            // 5. 映射至物理屏幕像素
            const targetScreen = this.screens[this.selectedDisplay] || this.screens[0];
            const bounds = targetScreen ? targetScreen.bounds : { width: 1920, height: 1080, x: 0, y: 0 };
            return {
                x: Math.round(bounds.x + normX * bounds.width),
                y: Math.round(bounds.y + normY * bounds.height)
            };
        }

        _executeMappedClick(clientX, clientY, viewportEl, imgEl, rippleEl, rotation, button) {
            const touchEnabled = this.isLandscapeOpen ? this.touchMode : (this.container.querySelector('#remote-touch-toggle')?.checked ?? true);
            if (!touchEnabled) return;

            const p = this._mapClientToPhysical(clientX, clientY, viewportEl, imgEl, rotation);
            if (!p) return;

            // 水波纹视觉反馈
            this._showRippleAt(rippleEl, viewportEl, clientX, clientY);

            // 触感反馈
            if (global.LanDiskUI && global.LanDiskUI.Haptic) {
                global.LanDiskUI.Haptic.medium();
            }
            this._sendInput({ type: 'click', x: p.x, y: p.y, button });
        }

        _showRippleAt(rippleEl, viewportEl, clientX, clientY) {
            if (!rippleEl || !viewportEl) return;
            const vpRect = viewportEl.getBoundingClientRect();
            rippleEl.style.left = `${clientX - vpRect.left}px`;
            rippleEl.style.top = `${clientY - vpRect.top}px`;
            rippleEl.style.transform = 'translate(-50%, -50%) scale(0)';
            rippleEl.style.opacity = '1';

            requestAnimationFrame(() => {
                rippleEl.style.transform = 'translate(-50%, -50%) scale(1.6)';
                rippleEl.style.opacity = '0';
            });
        }

        // ---- 远程输入统一入口：优先走 WebSocket，断线回退 HTTP ----
        _sendInput(msg) {
            if (this.ws && this.ws.readyState === 1) {
                try {
                    this.ws.send(JSON.stringify(msg));
                    return;
                } catch (e) {}
            }
            this._sendInputHttp(msg);
        }

        _sendInputHttp(msg) {
            const routes = {
                move: ['/api/remote/mouse/move', ['x', 'y']],
                down: ['/api/remote/mouse/down', ['x', 'y', 'button']],
                up: ['/api/remote/mouse/up', ['x', 'y', 'button']],
                click: ['/api/remote/mouse/click', ['x', 'y', 'button']],
                scroll: ['/api/remote/scroll', ['x', 'y', 'delta']],
                key: ['/api/remote/key', ['key', 'modifiers']],
                text: ['/api/remote/text', ['text']]
            };
            const route = routes[msg.type];
            if (!route) return;
            const [endpoint, fields] = route;

            // HTTP 回退下 move 是高频操作（每请求一个进程），加重节流
            if (msg.type === 'move') {
                const now = Date.now();
                if (now - this._moveHttpAt < 90) return;
                this._moveHttpAt = now;
            }

            const body = {};
            fields.forEach(f => {
                if (msg[f] !== undefined) body[f] = msg[f];
            });

            fetch(this.getApiUrl(endpoint), {
                method: 'POST',
                headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(body)
            }).catch(() => {});
        }

        // ---- 键盘面板 ----
        _sendText(text) {
            if (typeof text !== 'string' || !text) return;
            this._sendInput({ type: 'text', text: text.slice(0, 2000) });
        }

        _sendKey(key) {
            if (!key) return;
            const mods = Object.keys(this.kbMods).filter(m => this.kbMods[m]);
            this._sendInput({ type: 'key', key, modifiers: mods.join(',') });
            // 组合键发送后清空修饰键（Ctrl→C 的常规习惯）
            this.kbMods = {};
            this._updateKbChips();
        }

        _updateKbChips() {
            document.querySelectorAll('.remote-kb [data-kb-mod]').forEach(chip => {
                const m = chip.getAttribute('data-kb-mod');
                const active = !!this.kbMods[m];
                chip.style.background = active ? 'var(--apple-blue, #007aff)' : '';
                chip.style.color = active ? '#fff' : '';
                chip.style.borderColor = active ? 'var(--apple-blue, #007aff)' : '';
            });
        }

        _showClickRipple(x, y) {
            const ripple = this.container.querySelector('#remote-click-ripple');
            if (!ripple) return;
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            ripple.style.transform = 'translate(-50%, -50%) scale(0)';
            ripple.style.opacity = '1';
            
            requestAnimationFrame(() => {
                ripple.style.transform = 'translate(-50%, -50%) scale(1.6)';
                ripple.style.opacity = '0';
            });
        }

        async _confirmAction(title, message, isDanger = false) {
            if (global.LanDiskUI && global.LanDiskUI.Haptic) {
                if (isDanger) global.LanDiskUI.Haptic.warning();
                else global.LanDiskUI.Haptic.medium();
            }
            if (global.LanDiskUI && global.LanDiskUI.confirmDialog) {
                return await global.LanDiskUI.confirmDialog({
                    title: title || '操作确认',
                    message: message || '确定要执行此操作吗？',
                    confirmText: '确认执行',
                    cancelText: '取消',
                    danger: isDanger
                });
            }
            return window.confirm(message || '确定要执行此操作吗？');
        }

        _toast(msg, type = 'info') {
            if (global.LanDiskUI && global.LanDiskUI.toast) {
                global.LanDiskUI.toast(msg, type);
            }
        }

        _updateVolumeUI(vol, muted) {
            this.volume = vol;
            this.muted = muted;

            if (this.isVolumeDragging && global.LanDiskUI && global.LanDiskUI.Haptic) {
                global.LanDiskUI.Haptic.selection();
            }

            const badge = this.container.querySelector('#remote-vol-badge');
            if (badge) badge.textContent = muted ? '静音' : `${vol}%`;

            const slider = this.container.querySelector('#remote-vol-slider');
            if (slider && !this.isVolumeDragging) slider.value = vol;

            const iconEl = this.container.querySelector('#remote-vol-icon');
            if (iconEl) {
                if (muted || vol === 0) iconEl.innerHTML = I('volumeMute', 18);
                else if (vol < 50) iconEl.innerHTML = I('volumeLow', 18);
                else iconEl.innerHTML = I('volumeHigh', 18);
            }

            const muteText = this.container.querySelector('#btn-remote-mute-text');
            if (muteText) muteText.textContent = muted ? '取消静音' : '静音';
        }

        async fetchVolume(showToast = false) {
            try {
                const res = await fetch(this.getApiUrl('/api/remote/volume'), {
                    headers: this._authHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    this._updateVolumeUI(data.volume, data.muted);
                    if (showToast) this._toast(`音量已同步: ${data.muted ? '已静音' : data.volume + '%'}`, 'success');
                }
            } catch (e) {}
        }

        async setVolume(vol, isMute = null) {
            try {
                const body = { volume: vol };
                if (isMute !== null) body.mute = isMute;
                
                const res = await fetch(this.getApiUrl('/api/remote/volume'), {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(body)
                });
                if (res.ok) {
                    const data = await res.json();
                    this._updateVolumeUI(data.volume, data.muted);
                }
            } catch (e) {
                this._toast('音量调节失败: ' + e.message, 'error');
            }
        }

        async toggleMute() {
            try {
                const res = await fetch(this.getApiUrl('/api/remote/volume'), {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ mute: 'toggle' })
                });
                if (res.ok) {
                    const data = await res.json();
                    this._updateVolumeUI(data.volume, data.muted);
                    this._toast(data.muted ? '已静音' : `已解除静音 (${data.volume}%)`, 'info');
                }
            } catch (e) {
                this._toast('切换静音失败: ' + e.message, 'error');
            }
        }

        async fetchScreens() {
            try {
                const res = await fetch(this.getApiUrl('/api/remote/screen/info'), {
                    headers: this._authHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    this.screens = data.screens || [];
                    const sel = this.container.querySelector('#remote-display-select');
                    if (sel && this.screens.length > 0) {
                        sel.innerHTML = this.screens.map((s, idx) => `
                            <option value="${idx}">
                                ${s.primary ? '★ ' : ''}显示器 ${idx + 1} (${s.bounds.width}×${s.bounds.height})
                            </option>
                        `).join('');
                    }
                }
            } catch (e) {}
        }

        async sendPowerAction(action, seconds = 0) {
            try {
                const res = await fetch(this.getApiUrl('/api/remote/power'), {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ action, seconds })
                });
                const data = await res.json();
                if (res.ok) {
                    this._toast(data.message || '指令已成功下发', 'success');
                } else {
                    this._toast(data.error || '执行失败', 'error');
                }
            } catch (e) {
                this._toast('电源指令发送失败: ' + e.message, 'error');
            }
        }

        // ---- WebSocket 实时通道 ----
        _wsUrl() {
            let base = '';
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.getServerUrl) {
                base = global.LanDiskAuth.getServerUrl();
            }
            if (!base && typeof window !== 'undefined') {
                base = window.currentServerUrl || (typeof localStorage !== 'undefined' && localStorage.getItem('landisk_custom_server')) || window.location.origin;
            }
            let url = (base || '').replace(/\/$/, '').replace(/^http/i, 'ws') + '/api/remote/ws';
            // 凭据放 query（WS 无法带自定义 header）
            const pin = this.getPin ? this.getPin() : '';
            let token = '';
            try { token = localStorage.getItem('lan_disk_qr_token') || ''; } catch (e) {}
            const parts = [];
            if (pin) parts.push('pin=' + encodeURIComponent(pin));
            if (token) parts.push('token=' + encodeURIComponent(token));
            if (parts.length) url += '?' + parts.join('&');
            return url;
        }

        _wsConnect() {
            if (this.ws || typeof WebSocket === 'undefined') return;
            try {
                this.ws = new WebSocket(this._wsUrl());
            } catch (e) {
                this.ws = null;
                return;
            }
            this.ws.binaryType = 'blob';

            this.ws.onopen = () => {
                this.wsReconnectDelay = 1000;
                this.wsPolling = false;
                // 连接建立后若处于流式状态，立即切换到 WS 画面流
                if (this.isStreaming && this.fps > 0) {
                    this._wsStartStream();
                }
            };

            this.ws.onmessage = (ev) => {
                if (ev.data instanceof Blob) {
                    this._applyFrameBlob(ev.data);
                    return;
                }
                let msg;
                try { msg = JSON.parse(ev.data); } catch (e) { return; }
                if (msg.type === 'status') {
                    if (msg.streaming === true) {
                        this.wsPolling = false;
                        this._updateStreamBadge();
                    } else if (msg.streaming === false) {
                        // 服务端截屏进程退出等原因：先回退 HTTP 轮询，稍后自动重试
                        this.wsPolling = true;
                        this._updateStreamBadge();
                        if (this.isStreaming && this.fps > 0) {
                            setTimeout(() => {
                                if (this.isStreaming && this.ws && this.ws.readyState === 1) this._wsStartStream();
                            }, 2000);
                        }
                    }
                }
            };

            this.ws.onclose = () => {
                this.ws = null;
                this.wsPolling = true;
                this._updateStreamBadge();
                // 若仍在流式状态，立即回退 HTTP 轮询并安排重连
                if (this.isStreaming && this.fps > 0) {
                    this._startHttpPolling();
                    this._scheduleWsReconnect();
                }
            };

            this.ws.onerror = () => {};
        }

        _scheduleWsReconnect() {
            if (this.wsReconnectTimer) return;
            this.wsReconnectTimer = setTimeout(() => {
                this.wsReconnectTimer = null;
                if (this.isStreaming) this._wsConnect();
            }, this.wsReconnectDelay);
            this.wsReconnectDelay = Math.min(15000, this.wsReconnectDelay * 2);
        }

        _wsStartStream() {
            if (!this.ws || this.ws.readyState !== 1) return;
            try {
                this.ws.send(JSON.stringify({
                    type: 'start',
                    display: this.selectedDisplay,
                    fps: this.fps,
                    scale: this.scale,
                    quality: this.quality
                }));
            } catch (e) {}
        }

        _wsStopStream() {
            if (this.ws && this.ws.readyState === 1) {
                try { this.ws.send(JSON.stringify({ type: 'stop' })); } catch (e) {}
            }
        }

        _applyFrameBlob(blob) {
            const img = this.container.querySelector('#remote-screen-img');
            const placeholder = this.container.querySelector('#remote-screen-placeholder');
            const lsImg = document.querySelector('#remote-ls-img');
            if (!img) return;

            const objectUrl = URL.createObjectURL(blob);
            const oldUrl = img.dataset.objUrl;
            img.src = objectUrl;
            img.dataset.objUrl = objectUrl;
            if (lsImg) lsImg.src = objectUrl;
            if (oldUrl) URL.revokeObjectURL(oldUrl);

            if (placeholder) placeholder.style.display = 'none';
            if (img) img.style.display = 'block';
            this.isFramePending = false;
        }

        _updateStreamBadge() {
            const statusBadge = this.container.querySelector('#remote-stream-status');
            if (!statusBadge) return;
            if (this.isStreaming) {
                statusBadge.className = 'apple-badge apple-badge-green';
                statusBadge.textContent = this.ws && this.ws.readyState === 1 && !this.wsPolling ? '实时流' : '轮询中';
            } else {
                statusBadge.className = 'apple-badge apple-badge-gray';
                statusBadge.textContent = '未开启';
            }
        }

        startStream() {
            this.stopStream();
            this.isStreaming = true;

            const btnText = this.container.querySelector('#btn-stream-text');
            if (btnText) btnText.textContent = '停止镜像';

            this._updateStreamBadge();

            const placeholder = this.container.querySelector('#remote-screen-placeholder');
            const img = this.container.querySelector('#remote-screen-img');
            if (placeholder) placeholder.style.display = 'none';
            if (img) img.style.display = 'block';

            // 单帧快照模式：直接抓一帧
            if (this.fps <= 0) {
                this.captureFrame(true);
                return;
            }

            if (this.ws && this.ws.readyState === 1) {
                // WS 已就绪：直接走实时流
                this._wsStartStream();
            } else {
                // 先启动 HTTP 轮询兜底，WS 就绪后自动切换
                this._startHttpPolling();
                this._wsConnect();
            }
        }

        _startHttpPolling() {
            if (this.streamTimer) clearInterval(this.streamTimer);
            this.captureFrame();
            const interval = Math.max(50, Math.round(1000 / Math.min(this.fps, 20)));
            this.streamTimer = setInterval(() => {
                if (this.isStreaming && !document.hidden && this.container.isConnected && this.container.offsetParent !== null) {
                    // WS 已接管画面时不再 HTTP 轮询
                    if (this.ws && this.ws.readyState === 1 && !this.wsPolling) return;
                    this.captureFrame();
                }
            }, interval);
        }

        stopStream() {
            this.isStreaming = false;
            if (this.streamTimer) {
                clearInterval(this.streamTimer);
                this.streamTimer = null;
            }
            this._wsStopStream();

            if (this.wsReconnectTimer) {
                clearTimeout(this.wsReconnectTimer);
                this.wsReconnectTimer = null;
            }

            const btnText = this.container.querySelector('#btn-stream-text');
            if (btnText) btnText.textContent = '开启镜像';

            this._updateStreamBadge();
        }

        async captureFrame(isSingleSnap = false) {
            if (this.isFramePending && !isSingleSnap) return;
            this.isFramePending = true;

            const img = this.container.querySelector('#remote-screen-img');
            const placeholder = this.container.querySelector('#remote-screen-placeholder');
            const lsImg = document.querySelector('#remote-ls-img');

            try {
                const query = `display=${this.selectedDisplay}&scale=${this.scale}&quality=${this.quality}&_t=${Date.now()}`;
                const apiUrl = this.getApiUrl(`/api/remote/screen/capture?${query}`);

                const res = await fetch(apiUrl, {
                    headers: this._authHeaders()
                });

                if (res.ok) {
                    const blob = await res.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    
                    const oldUrl = img.dataset.objUrl;
                    img.src = objectUrl;
                    img.dataset.objUrl = objectUrl;
                    if (lsImg) lsImg.src = objectUrl;
                    if (oldUrl) URL.revokeObjectURL(oldUrl);

                    if (placeholder) placeholder.style.display = 'none';
                    if (img) img.style.display = 'block';
                    if (isSingleSnap) this._toast('已捕获最新屏幕画面', 'success');
                }
            } catch (e) {
            } finally {
                this.isFramePending = false;
            }
        }

        startAutoSync() {
            if (this.autoSyncTimer) return;
            this.autoSyncTimer = setInterval(() => {
                if (document.hidden || !this.container || !this.container.isConnected) return;
                if (this.container.offsetParent === null) return;
                if (!this.isVolumeDragging) {
                    this.fetchVolume();
                }
            }, 4000);
        }
    }

    global.RemoteControl = RemoteControl;
})(typeof window !== 'undefined' ? window : this);
