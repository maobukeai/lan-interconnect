/**
 * 猫步互联 Pro - 远程控制与屏幕实时镜像组件 (RemoteControl)
 * 包含：系统音量控制、电源管理（锁屏/睡眠/重启/关机/防误触弹窗）、低延迟屏幕镜像与触控交互映射。
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
            this.streamTimer = null;
            this.isFramePending = false;

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
            if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
                const baseUrl = window.currentServerUrl || 'http://localhost:3000';
                return baseUrl.replace(/\/$/, '') + endpoint;
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
                                    <option value="3">省电 (3 FPS)</option>
                                    <option value="10" selected>均衡 (10 FPS)</option>
                                    <option value="20">流畅 (20 FPS)</option>
                                    <option value="0">单帧快照</option>
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
                                <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:12px; color:var(--apple-text-secondary); user-select:none;">
                                    <input type="checkbox" id="remote-touch-toggle" checked style="accent-color:var(--apple-blue); width:15px; height:15px; cursor:pointer;">
                                    <span>触控点击映射</span>
                                </label>
                                <div style="display:flex; align-items:center; gap:6px;">
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
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 4. 沉浸式横屏全屏 Modal 浮层 -->
                <div id="remote-landscape-modal" style="display:none; position:fixed; inset:0; z-index:99999; background:#000; overflow:hidden; touch-action:none; user-select:none;">
                    <!-- 浮动控制胶囊 -->
                    <div id="remote-landscape-bar" style="position:absolute; top:12px; left:50%; transform:translateX(-50%); z-index:100000; background:rgba(28,28,30,0.85); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.15); border-radius:24px; padding:6px 12px; display:flex; align-items:center; gap:10px; box-shadow:0 8px 32px rgba(0,0,0,0.6); color:#fff; font-size:12px;">
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
                        this.captureFrame();
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

            let touchStartTime = 0;
            let touchStartX = 0;
            let touchStartY = 0;
            let isDragging = false;

            const handlePointerDown = (clientX, clientY) => {
                touchStartTime = Date.now();
                touchStartX = clientX;
                touchStartY = clientY;
                isDragging = false;
            };

            const handlePointerMove = (clientX, clientY) => {
                const dist = Math.hypot(clientX - touchStartX, clientY - touchStartY);
                if (dist > 8 && this.zoomLevel > 1.0) {
                    isDragging = true;
                    const rot = getRotation();
                    const rad = -rot * Math.PI / 180;
                    const dx = clientX - touchStartX;
                    const dy = clientY - touchStartY;
                    const unrotDx = dx * Math.cos(rad) - dy * Math.sin(rad);
                    const unrotDy = dx * Math.sin(rad) + dy * Math.cos(rad);

                    this.panX += unrotDx * 0.8;
                    this.panY += unrotDy * 0.8;
                    touchStartX = clientX;
                    touchStartY = clientY;

                    if (this.isLandscapeOpen) this._updateLandscapeTransform();
                    else this._updateStageTransform();
                }
            };

            const handlePointerUp = (clientX, clientY, button = 'left') => {
                const pressDuration = Date.now() - touchStartTime;
                const dist = Math.hypot(clientX - touchStartX, clientY - touchStartY);

                // 判断为点击（非长拖拽）
                if (dist < 10 && pressDuration < 500) {
                    this._executeMappedClick(clientX, clientY, viewportEl, imgEl, rippleEl, getRotation(), button);
                }
            };

            // 鼠标交互
            viewportEl.addEventListener('mousedown', (e) => {
                if (e.target.closest('#remote-landscape-bar')) return;
                handlePointerDown(e.clientX, e.clientY);
                const onMouseMove = (ev) => handlePointerMove(ev.clientX, ev.clientY);
                const onMouseUp = (ev) => {
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                    handlePointerUp(ev.clientX, ev.clientY, ev.button === 2 ? 'right' : 'left');
                };
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });

            // 触控交互
            viewportEl.addEventListener('touchstart', (e) => {
                if (e.target.closest('#remote-landscape-bar')) return;
                if (e.touches.length === 1) {
                    handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: true });

            viewportEl.addEventListener('touchmove', (e) => {
                if (e.target.closest('#remote-landscape-bar')) return;
                if (e.touches.length === 1) {
                    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: true });

            viewportEl.addEventListener('touchend', (e) => {
                if (e.target.closest('#remote-landscape-bar')) return;
                if (e.changedTouches.length > 0) {
                    handlePointerUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
                }
            }, { passive: true });
        }

        _executeMappedClick(clientX, clientY, viewportEl, imgEl, rippleEl, rotation, button) {
            const touchEnabled = this.isLandscapeOpen ? this.touchMode : (this.container.querySelector('#remote-touch-toggle')?.checked ?? true);
            if (!touchEnabled) return;
            if (!imgEl || !imgEl.src || imgEl.style.display === 'none') return;

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
                return; // 点击在黑边以外区域
            }

            // 5. 映射至物理屏幕像素
            const targetScreen = this.screens[this.selectedDisplay] || this.screens[0];
            const bounds = targetScreen ? targetScreen.bounds : { width: 1920, height: 1080, x: 0, y: 0 };
            const physX = Math.round(bounds.x + normX * bounds.width);
            const physY = Math.round(bounds.y + normY * bounds.height);

            // 6. 水波纹视觉反馈
            if (rippleEl) {
                rippleEl.style.left = `${clientX - vpRect.left}px`;
                rippleEl.style.top = `${clientY - vpRect.top}px`;
                rippleEl.style.transform = 'translate(-50%, -50%) scale(0)';
                rippleEl.style.opacity = '1';
                requestAnimationFrame(() => {
                    rippleEl.style.transform = 'translate(-50%, -50%) scale(1.6)';
                    rippleEl.style.opacity = '0';
                });
            }

            // 7. 发送点击指令与轻微触感反馈
            if (global.LanDiskUI && global.LanDiskUI.Haptic) {
                global.LanDiskUI.Haptic.medium();
            }
            this.sendMouseClick(physX, physY, button);
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

        async sendMouseClick(x, y, button = 'left') {
            try {
                await fetch(this.getApiUrl('/api/remote/mouse/click'), {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ x, y, button })
                });
            } catch (e) {}
        }

        startStream() {
            this.stopStream();
            this.isStreaming = true;

            const btnText = this.container.querySelector('#btn-stream-text');
            if (btnText) btnText.textContent = '停止镜像';

            const statusBadge = this.container.querySelector('#remote-stream-status');
            if (statusBadge) {
                statusBadge.className = 'apple-badge apple-badge-green';
                statusBadge.textContent = '传输中';
            }

            const placeholder = this.container.querySelector('#remote-screen-placeholder');
            const img = this.container.querySelector('#remote-screen-img');
            if (placeholder) placeholder.style.display = 'none';
            if (img) img.style.display = 'block';

            this.captureFrame();

            if (this.fps > 0) {
                const interval = Math.max(50, Math.round(1000 / this.fps));
                this.streamTimer = setInterval(() => {
                    if (this.isStreaming && !document.hidden && this.container.isConnected && this.container.offsetParent !== null) {
                        this.captureFrame();
                    }
                }, interval);
            }
        }

        stopStream() {
            this.isStreaming = false;
            if (this.streamTimer) {
                clearInterval(this.streamTimer);
                this.streamTimer = null;
            }

            const btnText = this.container.querySelector('#btn-stream-text');
            if (btnText) btnText.textContent = '开启镜像';

            const statusBadge = this.container.querySelector('#remote-stream-status');
            if (statusBadge) {
                statusBadge.className = 'apple-badge apple-badge-gray';
                statusBadge.textContent = '未开启';
            }
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
