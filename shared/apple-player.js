/**
 * Apple Minimalist Media Player (Apple Design System)
 * 局域网互联 Pro - 苹果极简全功能媒体播放器引擎
 */

class AppleMediaPlayerEngine {
    constructor() {
        this.initialized = false;
        this.playlist = [];
        this.currentIndex = -1;
        this.currentMedia = null;
        this.isPlaying = false;
        this.loopMode = 'off'; // 'off' | 'one' | 'all' | 'shuffle'
        this.showRemainingTime = false;
        this.hideControlsTimer = null;
        this.lastTapTime = 0;
        this.audioCtx = null;
        this.audioAnalyser = null;
        this.audioSource = null;
        this.animFrameId = null;

        // 视频画面增强属性
        this.rotateAngle = 0; // 0, 90, 180, 270
        this.isFlipped = false; // 水平镜像
        this.objectFitMode = 'contain'; // 'contain' | 'cover' | 'fill'
        this.brightness = 100; // 50% - 150%
        this.contrast = 100; // 50% - 150%
        this.isPressSpeeding = false;
        this.prePressRate = 1.0;
        this.pressSpeedTimer = null;

        // DOM 节点引用
        this.dom = {};
    }

    init() {
        if (this.initialized) return;
        this.createDOMStructure();
        this.bindEvents();
        this.initialized = true;
    }

    createDOMStructure() {
        const overlay = document.createElement('div');
        overlay.className = 'apple-player-overlay';
        overlay.id = 'apple-player-overlay';

        overlay.innerHTML = `
            <div class="apple-player-container" id="apple-player-container">
                <!-- 顶部栏 -->
                <div class="apple-player-header" id="apple-player-header">
                    <div class="apple-player-title-box">
                        <div class="apple-player-title" id="apple-media-title">媒体名称</div>
                        <div class="apple-player-subtitle" id="apple-media-subtitle">局域网流媒体</div>
                    </div>
                    <div class="apple-player-header-actions">
                        <!-- 画面与增强设置 -->
                        <div class="apple-popover-container" id="apple-video-settings-popover">
                            <button class="apple-player-btn" id="apple-btn-video-settings" title="画面比例与色彩设置">⚙️</button>
                            <div class="apple-popover-menu" style="min-width: 170px; padding: 8px;">
                                <div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:4px; font-weight:600;">画面填充模式</div>
                                <div class="apple-popover-item active" data-fit="contain">📐 原始比例</div>
                                <div class="apple-popover-item" data-fit="cover">📺 铺满裁剪</div>
                                <div class="apple-popover-item" data-fit="fill">↔️ 强制拉伸</div>
                                <div style="height:1px; background:rgba(255,255,255,0.1); margin:6px 0;"></div>
                                <div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:4px; font-weight:600;">画面控制</div>
                                <div class="apple-popover-item" id="apple-opt-rotate">🔄 旋转 90°</div>
                                <div class="apple-popover-item" id="apple-opt-flip">🪞 水平镜像</div>
                            </div>
                        </div>
                        <button class="apple-player-btn" id="apple-btn-playlist" title="播放列表">
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>
                        </button>
                        <button class="apple-player-btn" id="apple-btn-pip" title="画中画 (P)">
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                        <button class="apple-player-btn" id="apple-btn-fullscreen" title="全屏 (F)">
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                        </button>
                        <button class="apple-player-btn" id="apple-btn-close" title="关闭 (Esc)">
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>

                <!-- 视听舞台区域 -->
                <div class="apple-player-stage" id="apple-player-stage">
                    <video id="apple-media-element" crossorigin="anonymous" playsinline style="transition: transform 0.3s ease, object-fit 0.3s ease;"></video>

                    <!-- 动态提示 Toast -->
                    <div id="apple-press-speed-toast" style="position:absolute; top:80px; left:50%; transform:translateX(-50%); background:rgba(0,122,255,0.85); backdrop-filter:blur(10px); padding:6px 16px; border-radius:20px; font-size:12px; font-weight:700; color:white; display:none; align-items:center; gap:6px; box-shadow:0 4px 16px rgba(0,0,0,0.3); z-index:40;">
                        ⚡ 2.0X 极速快进中...
                    </div>
                    <div id="apple-resume-toast" style="position:absolute; bottom:80px; left:50%; transform:translateX(-50%); background:rgba(52,199,89,0.9); backdrop-filter:blur(10px); padding:6px 16px; border-radius:20px; font-size:12px; font-weight:600; color:white; display:none; align-items:center; gap:6px; box-shadow:0 4px 16px rgba(0,0,0,0.3); z-index:40;">
                        ⏱️ 已为您自动恢复至上次播放进度
                    </div>

                    <!-- 音频专属动态视图 -->
                    <div class="apple-audio-stage" id="apple-audio-stage" style="display: none;">
                        <div class="apple-audio-cover-wrapper">
                            <div class="apple-audio-vinyl" id="apple-audio-vinyl">
                                <div class="apple-audio-center-disc">🎵</div>
                            </div>
                        </div>
                        <canvas class="apple-audio-canvas" id="apple-audio-canvas"></canvas>
                    </div>

                    <!-- 中心大图标微动画 -->
                    <div class="apple-center-badge" id="apple-center-badge">▶</div>

                    <!-- 触摸双击快进快退反馈 -->
                    <div class="apple-gesture-ripple left" id="apple-ripple-left">⏮ -10s</div>
                    <div class="apple-gesture-ripple right" id="apple-ripple-right">⏭ +10s</div>
                </div>

                <!-- 底部悬浮胶囊控制面板 -->
                <div class="apple-player-controls-wrapper" id="apple-controls-wrapper">
                    <!-- 进度条 -->
                    <div class="apple-progress-container" id="apple-progress-container">
                        <div class="apple-progress-track">
                            <div class="apple-progress-buffer" id="apple-progress-buffer"></div>
                            <div class="apple-progress-fill" id="apple-progress-fill"></div>
                        </div>
                        <div class="apple-progress-thumb" id="apple-progress-thumb"></div>
                        <div class="apple-progress-tooltip" id="apple-progress-tooltip">00:00</div>
                    </div>

                    <!-- 控制胶囊条 -->
                    <div class="apple-controls-pill">
                        <!-- 左侧：播放与跳跃 -->
                        <div class="apple-controls-group">
                            <button class="apple-player-btn" id="apple-btn-prev" title="上一曲">
                                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                            </button>
                            <button class="apple-player-btn" id="apple-btn-rewind" title="后退 10 秒">
                                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8L4.066 11.2z"/></svg>
                            </button>
                            <button class="apple-player-btn apple-btn-play" id="apple-btn-play" title="播放/暂停 (Space)">
                                <svg id="apple-icon-play" width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                <svg id="apple-icon-pause" width="22" height="22" fill="currentColor" viewBox="0 0 24 24" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                            </button>
                            <button class="apple-player-btn" id="apple-btn-forward" title="快进 10 秒">
                                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.934 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zM19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z"/></svg>
                            </button>
                            <button class="apple-player-btn" id="apple-btn-next" title="下一曲">
                                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                            </button>
                            <button class="apple-player-btn" id="apple-btn-loop" title="循环模式">
                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            </button>
                        </div>

                        <!-- 中间：时间显示 -->
                        <div class="apple-time-display" id="apple-time-display">00:00 / 00:00</div>

                        <!-- 右侧：音量与倍速 -->
                        <div class="apple-controls-group">
                            <!-- 音量调节 -->
                            <div class="apple-volume-wrapper">
                                <button class="apple-player-btn" id="apple-btn-mute" title="静音 (M)">
                                    <svg id="apple-icon-vol" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                                </button>
                                <div class="apple-volume-slider-box">
                                    <input type="range" class="apple-volume-slider" id="apple-volume-slider" min="0" max="1" step="0.05" value="1">
                                </div>
                            </div>

                            <!-- 倍速菜单 -->
                            <div class="apple-popover-container" id="apple-speed-popover">
                                <button class="apple-player-btn" id="apple-btn-speed" style="width: auto; padding: 0 8px; font-size: 12px; font-weight: 600;">1.0x</button>
                                <div class="apple-popover-menu">
                                    <div class="apple-popover-item" data-speed="0.5">0.5x</div>
                                    <div class="apple-popover-item" data-speed="0.75">0.75x</div>
                                    <div class="apple-popover-item active" data-speed="1.0">1.0x 正常</div>
                                    <div class="apple-popover-item" data-speed="1.25">1.25x</div>
                                    <div class="apple-popover-item" data-speed="1.5">1.5x</div>
                                    <div class="apple-popover-item" data-speed="2.0">2.0x</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 侧边播放列表抽屉 -->
                <div class="apple-playlist-drawer" id="apple-playlist-drawer">
                    <div class="apple-playlist-header">
                        <div class="apple-playlist-title">
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>
                            播放列表 (<span id="apple-playlist-count">0</span>)
                        </div>
                        <button class="apple-player-btn" id="apple-btn-close-playlist">
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div class="apple-playlist-body" id="apple-playlist-body"></div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // 缓存 DOM 节点
        this.dom = {
            overlay: document.getElementById('apple-player-overlay'),
            container: document.getElementById('apple-player-container'),
            header: document.getElementById('apple-player-header'),
            stage: document.getElementById('apple-player-stage'),
            media: document.getElementById('apple-media-element'),
            audioStage: document.getElementById('apple-audio-stage'),
            audioVinyl: document.getElementById('apple-audio-vinyl'),
            audioCanvas: document.getElementById('apple-audio-canvas'),
            centerBadge: document.getElementById('apple-center-badge'),
            rippleLeft: document.getElementById('apple-ripple-left'),
            rippleRight: document.getElementById('apple-ripple-right'),
            controlsWrapper: document.getElementById('apple-controls-wrapper'),
            progressContainer: document.getElementById('apple-progress-container'),
            progressBuffer: document.getElementById('apple-progress-buffer'),
            progressFill: document.getElementById('apple-progress-fill'),
            progressThumb: document.getElementById('apple-progress-thumb'),
            progressTooltip: document.getElementById('apple-progress-tooltip'),
            title: document.getElementById('apple-media-title'),
            subtitle: document.getElementById('apple-media-subtitle'),
            btnPlay: document.getElementById('apple-btn-play'),
            iconPlay: document.getElementById('apple-icon-play'),
            iconPause: document.getElementById('apple-icon-pause'),
            btnPrev: document.getElementById('apple-btn-prev'),
            btnNext: document.getElementById('apple-btn-next'),
            btnRewind: document.getElementById('apple-btn-rewind'),
            btnForward: document.getElementById('apple-btn-forward'),
            btnLoop: document.getElementById('apple-btn-loop'),
            timeDisplay: document.getElementById('apple-time-display'),
            btnMute: document.getElementById('apple-btn-mute'),
            iconVol: document.getElementById('apple-icon-vol'),
            volumeSlider: document.getElementById('apple-volume-slider'),
            speedPopover: document.getElementById('apple-speed-popover'),
            btnSpeed: document.getElementById('apple-btn-speed'),
            videoSettingsPopover: document.getElementById('apple-video-settings-popover'),
            btnVideoSettings: document.getElementById('apple-btn-video-settings'),
            optRotate: document.getElementById('apple-opt-rotate'),
            optFlip: document.getElementById('apple-opt-flip'),
            pressSpeedToast: document.getElementById('apple-press-speed-toast'),
            btnPlaylist: document.getElementById('apple-btn-playlist'),
            btnClosePlaylist: document.getElementById('apple-btn-close-playlist'),
            playlistDrawer: document.getElementById('apple-playlist-drawer'),
            playlistBody: document.getElementById('apple-playlist-body'),
            playlistCount: document.getElementById('apple-playlist-count'),
            btnPip: document.getElementById('apple-btn-pip'),
            btnFullscreen: document.getElementById('apple-btn-fullscreen'),
            btnClose: document.getElementById('apple-btn-close')
        };
    }

    applyVideoTransforms() {
        const { media } = this.dom;
        if (!media) return;
        const scaleX = this.isFlipped ? -1 : 1;
        media.style.transform = `rotate(${this.rotateAngle}deg) scaleX(${scaleX})`;
        media.style.objectFit = this.objectFitMode;
    }

    savePlaybackProgress() {
        if (!this.currentMedia || !this.dom.media || !this.dom.media.duration) return;
        const currentTime = this.dom.media.currentTime;
        if (currentTime > 5 && (this.dom.media.duration - currentTime) > 10) {
            try {
                localStorage.setItem('apple_player_pos_' + this.currentMedia.path, currentTime.toString());
            } catch(e) {}
        }
    }

    checkPlaybackResume(mediaItem) {
        try {
            const saved = localStorage.getItem('apple_player_pos_' + mediaItem.path);
            if (saved) {
                const pos = parseFloat(saved);
                if (pos > 5) {
                    this.dom.media.currentTime = pos;
                    const toast = this.dom.resumeToast;
                    if (toast) {
                        toast.style.display = 'flex';
                        setTimeout(() => { toast.style.display = 'none'; }, 3000);
                    }
                }
            }
        } catch(e) {}
    }

    bindEvents() {
        const { media, btnPlay, stage, btnPrev, btnNext, btnRewind, btnForward, btnLoop, timeDisplay, btnMute, volumeSlider, btnSpeed, speedPopover, btnPlaylist, btnPip, btnFullscreen, btnClose, btnClosePlaylist, progressContainer, btnVideoSettings, videoSettingsPopover, optRotate, optFlip, pressSpeedToast } = this.dom;

        // 画面高级设置 Popover 逻辑
        if (btnVideoSettings && videoSettingsPopover) {
            btnVideoSettings.addEventListener('click', (e) => {
                e.stopPropagation();
                videoSettingsPopover.classList.toggle('open');
            });

            videoSettingsPopover.querySelectorAll('.apple-popover-item[data-fit]').forEach(item => {
                item.addEventListener('click', (e) => {
                    this.objectFitMode = e.target.getAttribute('data-fit');
                    this.applyVideoTransforms();
                    videoSettingsPopover.querySelectorAll('.apple-popover-item[data-fit]').forEach(i => i.classList.remove('active'));
                    e.target.classList.add('active');
                    videoSettingsPopover.classList.remove('open');
                });
            });

            if (optRotate) {
                optRotate.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.rotateAngle = (this.rotateAngle + 90) % 360;
                    this.applyVideoTransforms();
                    this.triggerCenterBadge(`🔄 旋转 ${this.rotateAngle}°`);
                });
            }

            if (optFlip) {
                optFlip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.isFlipped = !this.isFlipped;
                    this.applyVideoTransforms();
                    this.triggerCenterBadge(this.isFlipped ? '🪞 已镜像' : '↔️ 恢复正常');
                });
            }

            document.addEventListener('click', (e) => {
                if (!videoSettingsPopover.contains(e.target)) {
                    videoSettingsPopover.classList.remove('open');
                }
            });
        }

        // 滚轮调节音量
        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.05 : -0.05;
            media.volume = Math.max(0, Math.min(1, media.volume + delta));
            media.muted = (media.volume === 0);
            this.updateVolumeIcon();
            this.triggerCenterBadge(`🔊 ${Math.round(media.volume * 100)}%`);
        }, { passive: false });

        // 长按 2.0X 极速快进手势
        const startPressSpeed = () => {
            this.pressSpeedTimer = setTimeout(() => {
                if (!media.paused) {
                    this.isPressSpeeding = true;
                    this.prePressRate = media.playbackRate;
                    media.playbackRate = 2.0;
                    if (pressSpeedToast) pressSpeedToast.style.display = 'flex';
                }
            }, 350);
        };

        const stopPressSpeed = () => {
            clearTimeout(this.pressSpeedTimer);
            if (this.isPressSpeeding) {
                this.isPressSpeeding = false;
                media.playbackRate = this.prePressRate;
                if (pressSpeedToast) pressSpeedToast.style.display = 'none';
            }
        };

        stage.addEventListener('mousedown', (e) => {
            if (e.target.closest('.apple-player-btn') || e.target.closest('.apple-popover-container')) return;
            startPressSpeed();
        });
        stage.addEventListener('mouseup', stopPressSpeed);
        stage.addEventListener('mouseleave', stopPressSpeed);
        stage.addEventListener('touchstart', startPressSpeed, { passive: true });
        stage.addEventListener('touchend', stopPressSpeed);

        // 播放 / 暂停控制
        btnPlay.addEventListener('click', () => this.togglePlay());
        
        // 媒体自带事件监听
        media.addEventListener('play', () => this.onPlayStateChange(true));
        media.addEventListener('pause', () => this.onPlayStateChange(false));
        media.addEventListener('timeupdate', () => this.onTimeUpdate());
        media.addEventListener('progress', () => this.onBufferUpdate());
        media.addEventListener('ended', () => this.onMediaEnded());

        // 双击与点击舞台
        stage.addEventListener('click', (e) => this.handleStageClick(e));

        // 跳跃控制
        btnRewind.addEventListener('click', () => this.seekBy(-10));
        btnForward.addEventListener('click', () => this.seekBy(10));
        btnPrev.addEventListener('click', () => this.playPrev());
        btnNext.addEventListener('click', () => this.playNext());

        // 循环模式
        btnLoop.addEventListener('click', () => this.toggleLoopMode());

        // 时间格式切换
        timeDisplay.addEventListener('click', () => {
            this.showRemainingTime = !this.showRemainingTime;
            this.onTimeUpdate();
        });

        // 进度条拖拽与悬停
        let isDraggingProgress = false;
        const handleProgressSeek = (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            if (media.duration) {
                media.currentTime = pos * media.duration;
            }
        };

        progressContainer.addEventListener('mousedown', (e) => {
            isDraggingProgress = true;
            handleProgressSeek(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (isDraggingProgress) handleProgressSeek(e);
            
            // 悬停预览 Tooltip
            if (this.dom.overlay.classList.contains('active')) {
                const rect = progressContainer.getBoundingClientRect();
                if (e.clientY >= rect.top - 10 && e.clientY <= rect.bottom + 10 && e.clientX >= rect.left && e.clientX <= rect.right) {
                    const pos = (e.clientX - rect.left) / rect.width;
                    if (media.duration) {
                        this.dom.progressTooltip.textContent = this.formatTime(pos * media.duration);
                        this.dom.progressTooltip.style.left = `${pos * 100}%`;
                    }
                }
            }
        });

        document.addEventListener('mouseup', () => {
            isDraggingProgress = false;
        });

        // 音量与静音
        btnMute.addEventListener('click', () => this.toggleMute());
        volumeSlider.addEventListener('input', (e) => {
            media.volume = parseFloat(e.target.value);
            media.muted = (media.volume === 0);
            this.updateVolumeIcon();
        });

        // 倍速弹出菜单
        btnSpeed.addEventListener('click', (e) => {
            e.stopPropagation();
            speedPopover.classList.toggle('open');
        });

        speedPopover.querySelectorAll('.apple-popover-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.getAttribute('data-speed'));
                media.playbackRate = speed;
                btnSpeed.textContent = `${speed}x`;
                speedPopover.querySelectorAll('.apple-popover-item').forEach(i => i.classList.remove('active'));
                e.target.classList.add('active');
                speedPopover.classList.remove('open');
            });
        });

        document.addEventListener('click', (e) => {
            if (!speedPopover.contains(e.target)) {
                speedPopover.classList.remove('open');
            }
        });

        // 播放列表抽屉
        if (btnPlaylist && this.dom.playlistDrawer) {
            btnPlaylist.addEventListener('click', () => {
                this.dom.playlistDrawer.classList.toggle('open');
            });
        }
        if (btnClosePlaylist && this.dom.playlistDrawer) {
            btnClosePlaylist.addEventListener('click', () => {
                this.dom.playlistDrawer.classList.remove('open');
            });
        }

        // 画中画
        if (btnPip) {
            btnPip.addEventListener('click', async () => {
                try {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                    } else if (document.pictureInPictureEnabled && media.nodeName === 'VIDEO') {
                        await media.requestPictureInPicture();
                    }
                } catch (err) {}
            });
        }

        // 全屏控制
        if (btnFullscreen) {
            btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
        }

        // 关闭播放器
        if (btnClose) {
            btnClose.addEventListener('click', () => this.close());
        }

        // 自动隐藏控制栏
        const resetHideTimer = () => {
            this.showControls();
            clearTimeout(this.hideControlsTimer);
            if (this.isPlaying) {
                this.hideControlsTimer = setTimeout(() => this.hideControls(), 3000);
            }
        };

        this.dom.container.addEventListener('mousemove', resetHideTimer);
        this.dom.container.addEventListener('touchstart', resetHideTimer, { passive: true });

        // 监听原生全屏改变事件，同步UI与控制类
        const onFsChange = () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
            this.dom.overlay.classList.toggle('is-fullscreen', isFs);
            if (this.dom.btnFullscreen) {
                this.dom.btnFullscreen.classList.toggle('active', isFs);
            }
        };
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);

        // 全局键盘快捷键
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    play(mediaItem, playlist = []) {
        this.init();
        this.playlist = playlist.length > 0 ? playlist : [mediaItem];
        this.currentIndex = this.playlist.findIndex(item => item.path === mediaItem.path);
        if (this.currentIndex === -1) {
            this.playlist.unshift(mediaItem);
            this.currentIndex = 0;
        }

        this.loadMedia(this.playlist[this.currentIndex]);
        this.dom.overlay.classList.add('active');
        this.showControls();
    }

    loadMedia(mediaItem) {
        this.currentMedia = mediaItem;
        const { media, title, subtitle, audioStage } = this.dom;

        title.textContent = mediaItem.name;
        subtitle.textContent = `局域网文件 • ${mediaItem.type === 'audio' ? '音频文件' : '视频文件'}`;

        const isAudio = mediaItem.type === 'audio' || /\.(mp3|wav|flac|aac|m4a)$/i.test(mediaItem.name);

        if (isAudio) {
            audioStage.style.display = 'flex';
            this.initAudioCanvas();
        } else {
            audioStage.style.display = 'none';
        }

        let finalUrl = mediaItem.url || '';
        if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
            if (finalUrl.startsWith('/')) {
                const baseUrl = window.currentServerUrl || 'http://127.0.0.1:3000';
                finalUrl = baseUrl.replace(/\/$/, '') + finalUrl;
            }
        }

        media.src = finalUrl;
        this.applyVideoTransforms();

        media.play().then(() => {
            if (!isAudio) this.checkPlaybackResume(mediaItem);
        }).catch(e => console.warn('Autoplay prevented or unsupported source:', e.message));

        this.renderPlaylist();
    }

    togglePlay() {
        const { media } = this.dom;
        if (!media) return;
        if (media.paused) {
            media.play().catch(e => console.warn('Playback error:', e.message));
        } else {
            media.pause();
        }
    }

    onPlayStateChange(playing) {
        this.isPlaying = playing;
        const { iconPlay, iconPause, audioVinyl, centerBadge } = this.dom;
        
        if (playing) {
            iconPlay.style.display = 'none';
            iconPause.style.display = 'inline';
            audioVinyl.classList.add('playing');
            this.triggerCenterBadge('▶');
        } else {
            iconPlay.style.display = 'inline';
            iconPause.style.display = 'none';
            audioVinyl.classList.remove('playing');
            this.triggerCenterBadge('❚❚');
        }
    }

    seekBy(seconds) {
        const { media } = this.dom;
        if (!media.duration) return;
        media.currentTime = Math.max(0, Math.min(media.duration, media.currentTime + seconds));
    }

    playNext() {
        if (this.playlist.length === 0) return;
        if (this.loopMode === 'shuffle') {
            this.currentIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        }
        this.loadMedia(this.playlist[this.currentIndex]);
    }

    playPrev() {
        if (this.playlist.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        this.loadMedia(this.playlist[this.currentIndex]);
    }

    onMediaEnded() {
        if (this.loopMode === 'one') {
            this.dom.media.currentTime = 0;
            this.dom.media.play();
        } else if (this.loopMode === 'off' && this.currentIndex === this.playlist.length - 1) {
            this.onPlayStateChange(false);
        } else {
            this.playNext();
        }
    }

    toggleLoopMode() {
        const modes = ['off', 'one', 'all', 'shuffle'];
        const nextIdx = (modes.indexOf(this.loopMode) + 1) % modes.length;
        this.loopMode = modes[nextIdx];
        
        const { btnLoop } = this.dom;
        if (this.loopMode === 'off') {
            btnLoop.classList.remove('active');
            btnLoop.title = '循环模式: 关闭';
        } else {
            btnLoop.classList.add('active');
            btnLoop.title = `循环模式: ${this.loopMode === 'one' ? '单曲循环' : this.loopMode === 'all' ? '列表循环' : '随机播放'}`;
        }
    }

    toggleMute() {
        const { media } = this.dom;
        media.muted = !media.muted;
        this.updateVolumeIcon();
    }

    updateVolumeIcon() {
        const { media, volumeSlider } = this.dom;
        volumeSlider.value = media.muted ? 0 : media.volume;
    }

    onTimeUpdate() {
        const { media, progressFill, progressThumb, timeDisplay } = this.dom;
        if (!media.duration) return;

        const current = media.currentTime;
        const total = media.duration;
        const percent = (current / total) * 100;

        progressFill.style.width = `${percent}%`;
        progressThumb.style.left = `${percent}%`;

        if (this.showRemainingTime) {
            const rem = total - current;
            timeDisplay.textContent = `-${this.formatTime(rem)} / ${this.formatTime(total)}`;
        } else {
            timeDisplay.textContent = `${this.formatTime(current)} / ${this.formatTime(total)}`;
        }

        // 保存记忆断点
        this.savePlaybackProgress();
    }

    onBufferUpdate() {
        const { media, progressBuffer } = this.dom;
        if (media.buffered.length > 0 && media.duration) {
            const bufferedEnd = media.buffered.end(media.buffered.length - 1);
            const percent = (bufferedEnd / media.duration) * 100;
            progressBuffer.style.width = `${percent}%`;
        }
    }

    formatTime(sec) {
        if (isNaN(sec)) return '00:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        const hh = Math.floor(m / 60);
        const mm = m % 60;
        if (hh > 0) {
            return `${hh}:${mm < 10 ? '0' : ''}${mm}:${s < 10 ? '0' : ''}${s}`;
        }
        return `${mm < 10 ? '0' : ''}${mm}:${s < 10 ? '0' : ''}${s}`;
    }

    handleStageClick(e) {
        const now = Date.now();
        const stageWidth = this.dom.stage.clientWidth;
        const clickX = e.clientX - this.dom.stage.getBoundingClientRect().left;

        if (now - this.lastTapTime < 300) {
            // 双击手势
            if (clickX < stageWidth * 0.4) {
                this.seekBy(-10);
                this.triggerRipple('left');
            } else if (clickX > stageWidth * 0.6) {
                this.seekBy(10);
                this.triggerRipple('right');
            } else {
                this.toggleFullscreen();
            }
        } else {
            // 单击：切换播放/暂停
            this.togglePlay();
        }
        this.lastTapTime = now;
    }

    triggerCenterBadge(text) {
        const { centerBadge } = this.dom;
        centerBadge.textContent = text;
        centerBadge.classList.add('show');
        setTimeout(() => centerBadge.classList.remove('show'), 600);
    }

    triggerRipple(direction) {
        const el = direction === 'left' ? this.dom.rippleLeft : this.dom.rippleRight;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 600);
    }

    showControls() {
        this.dom.header.classList.remove('hidden');
        this.dom.controlsWrapper.classList.remove('hidden');
    }

    hideControls() {
        if (!this.isPlaying) return;
        this.dom.header.classList.add('hidden');
        this.dom.controlsWrapper.classList.add('hidden');
        this.dom.speedPopover.classList.remove('open');
    }

    toggleFullscreen() {
        const { overlay, media } = this.dom;
        if (media && media.webkitEnterFullscreen && !document.fullscreenEnabled) {
            media.webkitEnterFullscreen();
            return;
        }

        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || overlay.classList.contains('is-fullscreen'));

        if (!isFs) {
            const req = overlay.requestFullscreen || overlay.webkitRequestFullscreen || overlay.mozRequestFullScreen || overlay.msRequestFullscreen;
            if (req) {
                req.call(overlay).catch(() => {
                    overlay.classList.add('is-fullscreen');
                });
            } else {
                overlay.classList.add('is-fullscreen');
            }
        } else {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
                if (exit) exit.call(document).catch(() => {});
            }
            overlay.classList.remove('is-fullscreen');
        }
    }

    renderPlaylist() {
        const playlistBody = this.dom.playlistBody || document.getElementById('apple-playlist-body');
        const playlistCount = this.dom.playlistCount || document.getElementById('apple-playlist-count');
        if (playlistCount) {
            playlistCount.textContent = this.playlist.length;
        }

        if (playlistBody) {
            playlistBody.innerHTML = this.playlist.map((item, idx) => `
                <div class="apple-playlist-item ${idx === this.currentIndex ? 'active' : ''}" onclick="AppleMediaPlayer.playIndex(${idx})">
                    <div class="apple-playlist-item-icon">${item.type === 'audio' ? '🎵' : '🎬'}</div>
                    <div class="apple-playlist-item-info">
                        <div class="apple-playlist-item-name">${item.name}</div>
                        <div class="apple-playlist-item-meta">${item.type === 'audio' ? '音频文件' : '视频文件'}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    playIndex(index) {
        if (index >= 0 && index < this.playlist.length) {
            this.currentIndex = index;
            this.loadMedia(this.playlist[this.currentIndex]);
        }
    }

    initAudioCanvas() {
        if (this.audioCtx) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
            this.audioAnalyser = this.audioCtx.createAnalyser();
            this.audioSource = this.audioCtx.createMediaElementSource(this.dom.media);
            this.audioSource.connect(this.audioAnalyser);
            this.audioAnalyser.connect(this.audioCtx.destination);
            this.audioAnalyser.fftSize = 64;

            this.drawAudioVisualizer();
        } catch (e) {}
    }

    drawAudioVisualizer() {
        const canvas = this.dom.audioCanvas;
        const ctx = canvas.getContext('2d');
        const bufferLength = this.audioAnalyser ? this.audioAnalyser.frequencyBinCount : 0;
        const dataArray = new Uint8Array(bufferLength);

        const render = () => {
            this.animFrameId = requestAnimationFrame(render);
            if (!this.audioAnalyser) return;

            this.audioAnalyser.getByteFrequencyData(dataArray);

            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                
                const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, 'rgba(0, 122, 255, 0.2)');
                gradient.addColorStop(1, 'rgba(139, 92, 246, 0.8)');

                ctx.fillStyle = gradient;
                ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);

                x += barWidth;
            }
        };

        render();
    }

    handleKeyDown(e) {
        if (!this.dom.overlay.classList.contains('active')) return;

        // 如果用户正在输入框中打字，不响应全局快捷键
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        switch (e.key) {
            case ' ':
            case 'k':
            case 'K':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'ArrowLeft':
            case 'j':
            case 'J':
                e.preventDefault();
                this.seekBy(e.shiftKey ? -10 : -5);
                break;
            case 'ArrowRight':
            case 'l':
            case 'L':
                e.preventDefault();
                this.seekBy(e.shiftKey ? 10 : 5);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.dom.media.volume = Math.min(1, this.dom.media.volume + 0.1);
                this.updateVolumeIcon();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.dom.media.volume = Math.max(0, this.dom.media.volume - 0.1);
                this.updateVolumeIcon();
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'Escape':
                e.preventDefault();
                this.close();
                break;
        }
    }

    close() {
        if (!this.initialized) return;
        this.dom.media.pause();
        this.dom.media.src = '';
        this.dom.overlay.classList.remove('active');
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    }
}

// 暴露全局单例
window.AppleMediaPlayer = new AppleMediaPlayerEngine();
