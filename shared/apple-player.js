/**
 * Apple Cinema & Vision Pro Media Player Engine (影院级苹果全屏播放引擎)
 * 猫步互联 Pro · 极简通透水晶质感 · 全套全屏控制 · 4K截帧 · 半透抽屉 · 手势HUD
 */

class AppleCinemaPlayerEngine {
    constructor() {
        this.initialized = false;
        this.playlist = [];
        this.currentIndex = -1;
        this.currentMedia = null;
        this.isPlaying = false;
        this.loopMode = 'all';
        this.isLocked = false;
        this.previousView = 'files';

        // 画面与滤镜
        this.rotateAngle = 0;
        this.objectFitMode = 'contain';
        this.currentFilter = 'none';
        this.brightness = 100;
        this.historyStorageKey = 'landisk_player_history';
        this._lastHistorySave = 0;
        this._controlsTimer = null;
        this._resumeToastTimer = null;

        // 外挂字幕状态
        this.subtitlesEnabled = true;
        this.subtitles = [];
        this.currentSubtitleTrack = null;
        this.subtitleCues = [];
        this.subtitleOffset = 0;
        this.subtitleSize = 'md';

        // 手势状态
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isSwiping = false;
        this.swipeDirection = null;
        this.startVolume = 1;
        this.startBrightness = 100;
        this.startSeekTime = 0;
        this.touchTargetSeek = null;
        this.pressSpeedTimer = null;
        this.isPressSpeeding = false;
        this.prePressRate = 1.0;
        this.lastTapTime = 0;
        this.controlsVisible = true;
        this.isProgressDragging = false;
        this.activePopoverBtn = null;

        // 音频可视化
        this.audioCtx = null;
        this.audioAnalyser = null;
        this.audioSource = null;
        this.animFrameId = null;

        this.dom = {};
    }

    init() {
        if (this.initialized) return;

        this.dom = {
            view: document.getElementById('view-player'),
            btnBack: document.getElementById('btn-player-back'),
            btnTopBack: document.getElementById('ap-btn-top-back'),
            btnExternalApp: document.getElementById('ap-btn-external-app'),
            btnSnapshot: document.getElementById('ap-btn-snapshot'),
            btnPip: document.getElementById('ap-btn-pip'),
            btnTopEpisodes: document.getElementById('ap-btn-top-episodes'),
            btnTopSettings: document.getElementById('ap-btn-top-settings'),
            navTitle: document.getElementById('player-nav-title'),
            stageBox: document.getElementById('player-stage-box'),
            media: document.getElementById('apple-media-element'),
            subtitleLayer: document.getElementById('ap-subtitle-layer'),
            subtitleText: document.getElementById('ap-subtitle-text'),
            audioLayer: document.getElementById('ap-audio-layer'),
            audioVinyl: document.getElementById('ap-audio-vinyl'),
            audioCanvas: document.getElementById('ap-audio-canvas'),
            controlsOverlay: document.getElementById('player-controls-overlay'),
            videoTitle: document.getElementById('ap-video-title'),
            videoBadge: document.getElementById('ap-video-badge'),
            loadingSpinner: document.getElementById('ap-loading-spinner'),
            centerBadge: document.getElementById('ap-center-badge'),
            lockBtn: document.getElementById('ap-lock-btn'),
            iconUnlock: document.getElementById('ap-icon-unlock'),
            iconLock: document.getElementById('ap-icon-lock'),
            speedBadge: document.getElementById('ap-speed-badge'),
            gestureToast: document.getElementById('ap-gesture-toast'),
            resumeToast: document.getElementById('ap-resume-toast'),
            resumeText: document.getElementById('ap-resume-text'),
            btnResumeAction: document.getElementById('ap-btn-resume-action'),
            btnResumeDismiss: document.getElementById('ap-btn-resume-dismiss'),
            hudBrightness: document.getElementById('ap-hud-brightness'),
            hudBrightnessFill: document.getElementById('ap-hud-brightness-fill'),
            hudBrightnessVal: document.getElementById('ap-hud-brightness-val'),
            hudVolume: document.getElementById('ap-hud-volume'),
            hudVolumeFill: document.getElementById('ap-hud-volume-fill'),
            hudVolumeVal: document.getElementById('ap-hud-volume-val'),
            progressWrap: document.getElementById('ap-progress-wrap'),
            progressTooltip: document.getElementById('ap-progress-tooltip'),
            progressBuffer: document.getElementById('ap-progress-buffer'),
            progressFill: document.getElementById('ap-progress-fill'),
            progressThumb: document.getElementById('ap-progress-thumb'),
            btnPrev: document.getElementById('ap-btn-prev'),
            btnPlay: document.getElementById('ap-btn-play'),
            iconPlay: document.getElementById('ap-icon-play'),
            iconPause: document.getElementById('ap-icon-pause'),
            btnNext: document.getElementById('ap-btn-next'),
            timeText: document.getElementById('ap-time-text'),
            btnSpeed: document.getElementById('ap-btn-speed'),
            btnFitToggle: document.getElementById('ap-btn-fit-toggle'),
            btnFilterToggle: document.getElementById('ap-btn-filter-toggle'),
            btnFullscreen: document.getElementById('ap-btn-fullscreen'),
            fsBtnLabel: document.getElementById('ap-fs-btn-label'),
            // 悬浮弹窗选项菜单
            menuPopover: document.getElementById('ap-menu-popover'),
            popoverTitle: document.getElementById('ap-popover-title'),
            popoverList: document.getElementById('ap-popover-list'),
            // 全屏半透抽屉
            drawerEpisodes: document.getElementById('ap-fs-drawer-episodes'),
            drawerEpisodesRanges: document.getElementById('ap-fs-ep-ranges'),
            drawerEpisodesList: document.getElementById('ap-fs-drawer-episodes-list'),
            drawerEpisodesCount: document.getElementById('ap-fs-episodes-count'),
            drawerEpisodesClose: document.getElementById('ap-fs-drawer-episodes-close'),
            drawerSettings: document.getElementById('ap-fs-drawer-settings'),
            drawerSettingsClose: document.getElementById('ap-fs-drawer-settings-close'),
            fsSpeedGrid: document.getElementById('ap-fs-speed-grid'),
            fsFilterGrid: document.getElementById('ap-fs-filter-grid'),
            fsFitGrid: document.getElementById('ap-fs-fit-grid'),
            fsLoopGrid: document.getElementById('ap-fs-loop-grid'),
            fsBtnRotate: document.getElementById('ap-fs-btn-rotate'),
            fsSubStatus: document.getElementById('ap-fs-sub-status'),
            fsSubTracksGrid: document.getElementById('ap-fs-sub-tracks-grid'),
            fsSubSizeGrid: document.getElementById('ap-fs-sub-size-grid'),
            fsSubDelayGrid: document.getElementById('ap-fs-sub-delay-grid'),
            fsInputCustomSub: document.getElementById('ap-fs-input-custom-sub'),
            fsBtnOpenIntent: document.getElementById('ap-fs-btn-open-intent'),
            fsBtnOpenVlc: document.getElementById('ap-fs-btn-open-vlc'),
            fsBtnCopyStream: document.getElementById('ap-fs-btn-copy-stream'),
            // 下部大面板
            cardTitle: document.getElementById('player-card-title'),
            cardSub: document.getElementById('player-card-sub'),
            episodesRanges: document.getElementById('player-ep-ranges-container'),
            episodesScroll: document.getElementById('player-episodes-scroll'),
            episodesCount: document.getElementById('player-episodes-count'),
            speedGrid: document.getElementById('player-speed-grid'),
            filterGrid: document.getElementById('player-filter-grid'),
            fitGrid: document.getElementById('player-fit-grid'),
            btnRotate: document.getElementById('btn-player-rotate'),
            subStatus: document.getElementById('player-sub-status'),
            subTracksGrid: document.getElementById('player-sub-tracks-grid'),
            subSizeGrid: document.getElementById('player-sub-size-grid'),
            subDelayGrid: document.getElementById('player-sub-delay-grid'),
            inputCustomSub: document.getElementById('player-input-custom-sub')
        };

        this.bindEvents();
        this.initialized = true;
    }

    bindEvents() {
        const { media, stageBox, btnBack, btnTopBack, btnSnapshot, btnPip, btnTopEpisodes, btnTopSettings, btnPrev, btnPlay, btnNext, btnSpeed, btnFitToggle, btnFilterToggle, btnFullscreen, lockBtn, btnResumeAction, btnResumeDismiss, drawerEpisodesClose, drawerSettingsClose, fsSpeedGrid, fsFilterGrid, fsFitGrid, fsLoopGrid, fsBtnRotate, speedGrid, filterGrid, fitGrid, btnRotate } = this.dom;

        media.addEventListener('timeupdate', () => this.onTimeUpdate());
        media.addEventListener('progress', () => this.onProgress());
        media.addEventListener('loadstart', () => this.setLoading(true));
        media.addEventListener('waiting', () => this.setLoading(true));
        media.addEventListener('seeking', () => this.setLoading(true));
        media.addEventListener('seeked', () => this.setLoading(false));
        media.addEventListener('canplay', () => this.setLoading(false));
        media.addEventListener('playing', () => { this.setLoading(false); this.onPlayStateChange(true); });
        media.addEventListener('play', () => this.onPlayStateChange(true));
        media.addEventListener('pause', () => this.onPlayStateChange(false));
        media.addEventListener('ended', () => this.onEnded());
        media.addEventListener('loadedmetadata', () => { this.setLoading(false); this.onLoadedMetadata(); });

        btnPlay?.addEventListener('click', (e) => { e.stopPropagation(); this.togglePlay(); });
        btnPrev?.addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });
        btnNext?.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });
        
        const handleBack = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.close();
        };

        btnBack?.addEventListener('click', handleBack);
        btnBack?.addEventListener('touchend', handleBack);
        btnTopBack?.addEventListener('click', handleBack);
        btnTopBack?.addEventListener('touchend', handleBack);

        btnSnapshot?.addEventListener('click', (e) => { e.stopPropagation(); this.takeSnapshot(); });
        btnPip?.addEventListener('click', (e) => { e.stopPropagation(); this.togglePiP(); });
        btnFullscreen?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleFullscreen(); });
        lockBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleLock(); });

        // 抽屉触发
        btnTopEpisodes?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleDrawer('episodes'); });
        btnTopSettings?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleDrawer('settings'); });
        drawerEpisodesClose?.addEventListener('click', (e) => { e.stopPropagation(); this.closeDrawers(); });
        drawerSettingsClose?.addEventListener('click', (e) => { e.stopPropagation(); this.closeDrawers(); });

        // 外部专业播放器 App 联动
        this.dom.btnExternalApp?.addEventListener('click', (e) => {
            e.stopPropagation();
            const options = [
                { label: '🌟 唤起手机/系统播放器 (MX Player / 系统相册)', value: 'intent' },
                { label: '🎬 在 VLC 播放器中打开', value: 'vlc' },
                { label: '📱 在 nPlayer 播放器中打开', value: 'nplayer' },
                { label: '📋 复制局域网直连播放地址 (可粘贴至 Infuse/PotPlayer)', value: 'copy' }
            ];
            this.openMenuPopover(this.dom.btnExternalApp, '🚀 调用外部专业播放器 App', options, null, (val) => {
                this.openInExternalApp(val);
            });
        });

        this.dom.fsBtnOpenIntent?.addEventListener('click', (e) => { e.stopPropagation(); this.openInExternalApp('intent'); });
        this.dom.fsBtnOpenVlc?.addEventListener('click', (e) => { e.stopPropagation(); this.openInExternalApp('vlc'); });
        this.dom.fsBtnCopyStream?.addEventListener('click', (e) => { e.stopPropagation(); this.openInExternalApp('copy'); });

        // 快捷倍速选择菜单 (Apple Popover Menu)
        btnSpeed?.addEventListener('click', (e) => {
            e.stopPropagation();
            const current = this.dom.media ? (this.dom.media.playbackRate || 1.0) : 1.0;
            const options = [
                { label: '0.5x 慢速', value: '0.5' },
                { label: '0.75x 慢速', value: '0.75' },
                { label: '1.0x 标准 (推荐)', value: '1' },
                { label: '1.25x 轻快', value: '1.25' },
                { label: '1.5x 快速', value: '1.5' },
                { label: '2.0x 极速', value: '2' },
                { label: '3.0x 超快', value: '3' }
            ];
            const curValStr = current % 1 === 0 ? String(Math.round(current)) : String(current);
            this.toggleMenuPopover(btnSpeed, '选择播放倍速', options, curValStr, (val) => {
                this.setPlaybackRate(parseFloat(val));
            });
        });

        // 快捷画面比例选择菜单 (Apple Popover Menu)
        btnFitToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            const options = [
                { label: '自适应 (原片比例)', value: 'contain' },
                { label: '铺满全屏 (裁剪黑边)', value: 'cover' },
                { label: '拉伸全屏 (填充视口)', value: 'fill' }
            ];
            this.toggleMenuPopover(btnFitToggle, '选择画面比例', options, this.objectFitMode, (val) => {
                this.setObjectFit(val);
            });
        });

        // 快捷色彩风格选择菜单 (Apple Popover Menu)
        btnFilterToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            const options = [
                { label: '原画 (默认真实色彩)', value: 'none' },
                { label: '夜间暖光 (温和护眼)', value: 'warm' },
                { label: '影院高对比 (电影质感)', value: 'cinema' },
                { label: '鲜艳生动 (饱和通透)', value: 'vivid' }
            ];
            this.toggleMenuPopover(btnFilterToggle, '选择色彩风格', options, this.currentFilter, (val) => {
                this.setVideoFilter(val);
            });
        });

        // 断点续播
        btnResumeDismiss?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideResumeToast();
        });

        // 抽屉内倍速点击
        const bindGridEvents = (grid, setter, attr) => {
            grid?.querySelectorAll('.player-opt-pill').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const val = btn.getAttribute(attr);
                    setter(attr === 'data-speed' ? parseFloat(val) : val);
                });
            });
        };

        bindGridEvents(fsSpeedGrid, (v) => this.setPlaybackRate(v), 'data-speed');
        bindGridEvents(speedGrid, (v) => this.setPlaybackRate(v), 'data-speed');
        bindGridEvents(fsFilterGrid, (v) => this.setVideoFilter(v), 'data-filter');
        bindGridEvents(filterGrid, (v) => this.setVideoFilter(v), 'data-filter');
        bindGridEvents(fsFitGrid, (v) => this.setObjectFit(v), 'data-fit');
        bindGridEvents(fitGrid, (v) => this.setObjectFit(v), 'data-fit');
        bindGridEvents(fsLoopGrid, (v) => this.setLoopMode(v), 'data-loop');

        // 字幕字号、延迟与轨道切换绑定
        const bindSubGrid = (grid, setter, attr) => {
            grid?.querySelectorAll('.player-opt-pill').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const val = btn.getAttribute(attr);
                    setter(val);
                });
            });
        };

        bindSubGrid(this.dom.fsSubSizeGrid, (v) => this.setSubtitleSize(v), 'data-subsize');
        bindSubGrid(this.dom.subSizeGrid, (v) => this.setSubtitleSize(v), 'data-subsize');
        bindSubGrid(this.dom.fsSubDelayGrid, (v) => this.setSubtitleDelay(v), 'data-subdelay');
        bindSubGrid(this.dom.subDelayGrid, (v) => this.setSubtitleDelay(v), 'data-subdelay');

        const bindSubTrackClick = (grid) => {
            grid?.addEventListener('click', (e) => {
                const btn = e.target.closest('.player-opt-pill');
                if (!btn) return;
                e.stopPropagation();
                const subType = btn.getAttribute('data-sub');
                if (subType === 'off') {
                    this.toggleSubtitle(false);
                    grid.querySelectorAll('.player-opt-pill').forEach(b => b.classList.toggle('active', b === btn));
                } else if (subType === 'auto') {
                    this.toggleSubtitle(true);
                    if (this.subtitles.length > 0) {
                        this.loadSubtitleTrack(this.subtitles[0]);
                    }
                    grid.querySelectorAll('.player-opt-pill').forEach(b => b.classList.toggle('active', b === btn));
                } else {
                    const idx = parseInt(btn.getAttribute('data-sub-idx'), 10);
                    if (!isNaN(idx) && this.subtitles[idx]) {
                        this.toggleSubtitle(true);
                        this.loadSubtitleTrack(this.subtitles[idx]);
                        grid.querySelectorAll('.player-opt-pill').forEach(b => b.classList.toggle('active', b === btn));
                    }
                }
            });
        };
        bindSubTrackClick(this.dom.fsSubTracksGrid);
        bindSubTrackClick(this.dom.subTracksGrid);

        // 本地字幕文件导入监听
        const handleCustomSubFile = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const content = evt.target.result;
                const ext = file.name.split('.').pop().toLowerCase();
                this.loadSubtitleText(content, file.name, ext);
            };
            reader.readAsText(file);
            e.target.value = '';
        };

        this.dom.fsInputCustomSub?.addEventListener('change', handleCustomSubFile);
        this.dom.inputCustomSub?.addEventListener('change', handleCustomSubFile);

        if (fsBtnRotate) fsBtnRotate.addEventListener('click', (e) => { e.stopPropagation(); this.rotateVideo(); });
        if (btnRotate) btnRotate.addEventListener('click', (e) => { e.stopPropagation(); this.rotateVideo(); });

        this.bindProgressEvents(this.dom.progressWrap);
        this.bindStageGestures(stageBox);

        // 点击页面任意外部区域（非抽屉内部）自动收起抽屉
        document.addEventListener('click', (e) => {
            const anyDrawerOpen = (this.dom.drawerEpisodes && this.dom.drawerEpisodes.classList.contains('open')) ||
                                  (this.dom.drawerSettings && this.dom.drawerSettings.classList.contains('open'));
            if (!anyDrawerOpen) return;

            const inEpisodes = this.dom.drawerEpisodes && this.dom.drawerEpisodes.contains(e.target);
            const inSettings = this.dom.drawerSettings && this.dom.drawerSettings.contains(e.target);
            const isEpisodesBtn = this.dom.btnTopEpisodes && this.dom.btnTopEpisodes.contains(e.target);
            const isSettingsBtn = this.dom.btnTopSettings && this.dom.btnTopSettings.contains(e.target);

            if (!inEpisodes && !inSettings && !isEpisodesBtn && !isSettingsBtn) {
                this.closeDrawers();
            }
        });

        // 监听标准全屏改变
        document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    play(mediaItem, playlist = []) {
        this.init();
        this.closeDrawers();
        if (playlist && playlist.length > 0) {
            // 复制并做自然数字排序（Natural Numeric Sort，完美解决 1, 10, 100 乱序问题）
            const sortedList = [...playlist].sort((a, b) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
            });
            this.playlist = sortedList;
            this.currentIndex = this.playlist.findIndex(item => item.path === mediaItem.path);
            if (this.currentIndex === -1) {
                this.playlist.unshift(mediaItem);
                this.currentIndex = 0;
            }
        } else {
            this.playlist = [mediaItem];
            this.currentIndex = 0;
        }

        this.showPlayerView();
        this.loadCurrentMedia();
    }

    showPlayerView() {
        this.closeDrawers();
        if (this.dom.stageBox) {
            this.dom.stageBox.scrollLeft = 0;
            this.dom.stageBox.scrollTop = 0;
        }
        const currentActive = document.querySelector('.view-section.active');
        if (currentActive && currentActive.id !== 'view-player') {
            this.previousView = currentActive.id.replace('view-', '');
        }

        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        if (this.dom.view) this.dom.view.classList.add('active');

        window.scrollTo(0, 0);
    }

    close() {
        if (this.dom.media) {
            this.dom.media.pause();
        }
        this.closeDrawers();
        this.closeMenuPopover();
        if (this.dom.stageBox) {
            this.dom.stageBox.scrollLeft = 0;
            this.dom.stageBox.scrollTop = 0;
            this.dom.stageBox.classList.remove('is-fullscreen');
        }
        document.body.classList.remove('ap-fullscreen-active');
        if (this.dom.fsBtnLabel) this.dom.fsBtnLabel.textContent = '全屏';
        this._lockLandscape(false);
        this._restoreStageParent();

        if (document.fullscreenElement || document.webkitFullscreenElement) {
            try {
                if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            } catch (e) {}
        }

        const targetView = this.previousView || 'files';
        const dockBtn = document.querySelector(`.dock-item[data-view="${targetView}"]`);
        if (dockBtn) {
            dockBtn.click();
        } else {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            const fallback = document.getElementById('view-' + targetView) || document.getElementById('view-files');
            if (fallback) fallback.classList.add('active');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    getStreamUrl(item) {
        if (!item) return '';
        if (item.url) return item.url;
        let authQ = '';
        if (window.LanDiskAuth && typeof window.LanDiskAuth.authQuery === 'function') {
            const q = window.LanDiskAuth.authQuery();
            if (q) authQ = q.replace(/^\?/, '&');
        } else {
            const pin = localStorage.getItem('lan_disk_pin') || localStorage.getItem('landisk_pin') || '';
            const token = localStorage.getItem('lan_disk_qr_token') || '';
            if (pin) authQ += '&pin=' + encodeURIComponent(pin);
            if (token) authQ += '&token=' + encodeURIComponent(token);
        }
        let baseUrl = '/api/stream';
        if (window.LanDiskAuth && typeof window.LanDiskAuth.api === 'function') {
            baseUrl = window.LanDiskAuth.api('/api/stream');
        } else if (window.api) {
            baseUrl = window.api('/api/stream');
        }
        return baseUrl + '?path=' + encodeURIComponent(item.path) + authQ;
    }

    prefetchNextMedia() {
        if (!this.playlist || this.playlist.length <= 1) return;
        const nextIdx = this.currentIndex + 1;
        if (nextIdx < this.playlist.length) {
            const nextItem = this.playlist[nextIdx];
            const nextUrl = this.getStreamUrl(nextItem);
            if (nextUrl) {
                try {
                    fetch(nextUrl, {
                        headers: { 'Range': 'bytes=0-524287' },
                        cache: 'force-cache'
                    }).catch(() => {});
                } catch (e) {}
            }
        }
    }

    loadCurrentMedia() {
        if (this.dom.stageBox) {
            this.dom.stageBox.scrollLeft = 0;
            this.dom.stageBox.scrollTop = 0;
        }
        if (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) return;
        const item = this.playlist[this.currentIndex];
        this.currentMedia = item;

        const isAudio = item.type === 'audio' || /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(item.name);
        const streamUrl = this.getStreamUrl(item);

        if (this.dom.videoTitle) this.dom.videoTitle.textContent = item.name;
        if (this.dom.navTitle) this.dom.navTitle.textContent = item.name;
        if (this.dom.cardTitle) this.dom.cardTitle.textContent = item.name;
        if (this.dom.cardSub) this.dom.cardSub.textContent = isAudio ? 'Apple Music 高保真无损音频 · 局域网直连' : '读取视频信息… · 局域网直连';
        this._pendingVideoMetaText = !isAudio;
        if (this.dom.videoBadge) this.dom.videoBadge.innerHTML = `<span class="ap-status-dot"></span>${isAudio ? '无损音频' : '视频'}`;

        if (isAudio) {
            this.dom.audioLayer.style.display = 'flex';
            this.initAudioVisualizer();
        } else {
            this.dom.audioLayer.style.display = 'none';
        }

        // 直接流式直通挂载新媒体，配合 loadingSpinner 指示，避免双重 load() 与画面撕裂
        if (this.dom.media) {
            this.setLoading(true);
            this.dom.media.playsInline = true;
            this.dom.media.preload = 'auto';
            this.dom.media.src = streamUrl;
            this.dom.media.load();
            const playPromise = this.dom.media.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((err) => {
                    // 如果移动端浏览器限制了非静音自动起播，则先静音立即起播首帧，随后平滑恢复
                    if (this.dom.media) {
                        this.dom.media.muted = true;
                        this.dom.media.play().catch(() => {});
                        setTimeout(() => {
                            if (this.dom.media) this.dom.media.muted = false;
                        }, 50);
                    }
                });
            }
        }

        this.resetTransform();
        this.showControls();

        // 将非关键 DOM 渲染与网络探测异步延迟执行，绝不阻塞主线程音视频解码管道
        const deferFn = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));
        deferFn(() => {
            this.renderEpisodes();
            this.detectSubtitles(item);
            this.checkResumeHistory(item);
            this.prefetchNextMedia();
        });
    }

    renderEpisodes() {
        const countStr = `(${this.playlist.length})`;
        if (this.dom.episodesCount) this.dom.episodesCount.textContent = countStr;
        if (this.dom.drawerEpisodesCount) this.dom.drawerEpisodesCount.textContent = countStr;

        // 1. 渲染分页区间胶囊 (Range Tabs)
        this.renderEpisodeRanges(this.dom.episodesRanges, false);
        this.renderEpisodeRanges(this.dom.drawerEpisodesRanges, true);

        // 2. 渲染下部横滑卡片
        if (this.dom.episodesScroll) {
            this.dom.episodesScroll.innerHTML = this.playlist.map((item, idx) => {
                const isActive = idx === this.currentIndex;
                const indexFormatted = String(idx + 1).padStart(2, '0');
                return `
                    <div class="player-episode-card ${isActive ? 'active' : ''}" data-idx="${idx}">
                        <div class="player-ep-idx">第 ${indexFormatted} 集</div>
                        <div class="player-ep-name" title="${item.name}">${item.name}</div>
                    </div>
                `;
            }).join('');

            this.dom.episodesScroll.querySelectorAll('.player-episode-card').forEach(card => {
                card.addEventListener('click', () => {
                    const idx = parseInt(card.getAttribute('data-idx'), 10);
                    if (idx !== this.currentIndex) {
                        this.currentIndex = idx;
                        this.loadCurrentMedia();
                        this.scrollToCurrentEpisode();
                    }
                });
            });
        }

        // 3. 渲染全屏右侧半透抽屉列表
        if (this.dom.drawerEpisodesList) {
            this.dom.drawerEpisodesList.innerHTML = this.playlist.map((item, idx) => {
                const isActive = idx === this.currentIndex;
                const indexFormatted = String(idx + 1).padStart(2, '0');
                return `
                    <div class="ap-fs-ep-item ${isActive ? 'active' : ''}" data-idx="${idx}">
                        <span class="ap-fs-ep-idx">${indexFormatted}</span>
                        <span class="ap-fs-ep-title">${item.name}</span>
                        ${isActive ? '<span style="color:#38bdf8; font-size:12px;">▶ 播放中</span>' : ''}
                    </div>
                `;
            }).join('');

            this.dom.drawerEpisodesList.querySelectorAll('.ap-fs-ep-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(item.getAttribute('data-idx'), 10);
                    if (idx !== this.currentIndex) {
                        this.currentIndex = idx;
                        this.loadCurrentMedia();
                        this.scrollToCurrentEpisode();
                    }
                    this.closeDrawers();
                });
            });
        }

        // 4. 自动滚动到当前播放集
        setTimeout(() => this.scrollToCurrentEpisode(), 60);
    }

    renderEpisodeRanges(containerEl, isDrawer = false) {
        if (!containerEl) return;
        const total = this.playlist.length;
        if (total <= 20) {
            containerEl.innerHTML = '';
            containerEl.style.display = 'none';
            return;
        }

        containerEl.style.display = 'flex';
        const groupSize = 30;
        const groupCount = Math.ceil(total / groupSize);
        let html = '';
        for (let g = 0; g < groupCount; g++) {
            const start = g * groupSize;
            const end = Math.min((g + 1) * groupSize, total);
            const padStart = String(start + 1).padStart(2, '0');
            const padEnd = String(end).padStart(2, '0');
            const isActive = this.currentIndex >= start && this.currentIndex < end;
            html += `
                <button class="player-range-pill ${isActive ? 'active' : ''}" data-start="${start}" data-end="${end}">
                    ${padStart} - ${padEnd}
                </button>
            `;
        }
        containerEl.innerHTML = html;

        containerEl.querySelectorAll('.player-range-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                containerEl.querySelectorAll('.player-range-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                const startIdx = parseInt(pill.getAttribute('data-start'), 10);
                if (isDrawer && this.dom.drawerEpisodesList) {
                    const targetEl = this.dom.drawerEpisodesList.querySelector(`.ap-fs-ep-item[data-idx="${startIdx}"]`);
                    if (targetEl) {
                        this.dom.drawerEpisodesList.scrollTo({ top: targetEl.offsetTop, behavior: 'smooth' });
                    }
                } else if (this.dom.episodesScroll) {
                    const targetCard = this.dom.episodesScroll.querySelector(`.player-episode-card[data-idx="${startIdx}"]`);
                    if (targetCard) {
                        const scrollLeft = targetCard.offsetLeft - 16;
                        this.dom.episodesScroll.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
                    }
                }
            });
        });
    }

    scrollToCurrentEpisode() {
        if (this.dom.stageBox) {
            this.dom.stageBox.scrollLeft = 0;
            this.dom.stageBox.scrollTop = 0;
        }

        if (this.dom.episodesScroll) {
            const activeCard = this.dom.episodesScroll.querySelector(`.player-episode-card[data-idx="${this.currentIndex}"]`);
            if (activeCard) {
                const scrollLeft = activeCard.offsetLeft - (this.dom.episodesScroll.clientWidth / 2) + (activeCard.clientWidth / 2);
                this.dom.episodesScroll.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
            }
        }

        // 仅在全屏抽屉打开时滚动抽屉内部，避免对未展开的抽屉调用 scrollIntoView 导致祖先视窗发生意外横向位移
        if (this.dom.drawerEpisodesList && this.dom.drawerEpisodes && this.dom.drawerEpisodes.classList.contains('open')) {
            const activeFsItem = this.dom.drawerEpisodesList.querySelector(`.ap-fs-ep-item[data-idx="${this.currentIndex}"]`);
            if (activeFsItem) {
                const scrollTop = activeFsItem.offsetTop - (this.dom.drawerEpisodesList.clientHeight / 2) + (activeFsItem.clientHeight / 2);
                this.dom.drawerEpisodesList.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
            }
        }
    }

    toggleDrawer(type) {
        const isEpisodes = type === 'episodes';
        const target = isEpisodes ? this.dom.drawerEpisodes : this.dom.drawerSettings;
        const other = isEpisodes ? this.dom.drawerSettings : this.dom.drawerEpisodes;

        if (other) other.classList.remove('open');
        if (target) {
            const isOpen = target.classList.contains('open');
            target.classList.toggle('open', !isOpen);
            if (!isOpen && isEpisodes && this.dom.drawerEpisodesList) {
                const activeFsItem = this.dom.drawerEpisodesList.querySelector(`.ap-fs-ep-item[data-idx="${this.currentIndex}"]`);
                if (activeFsItem) {
                    setTimeout(() => {
                        const scrollTop = activeFsItem.offsetTop - (this.dom.drawerEpisodesList.clientHeight / 2) + (activeFsItem.clientHeight / 2);
                        this.dom.drawerEpisodesList.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
                    }, 60);
                }
            }
        }
    }

    isDrawerOpen() {
        return !!((this.dom.drawerEpisodes && this.dom.drawerEpisodes.classList.contains('open')) ||
                  (this.dom.drawerSettings && this.dom.drawerSettings.classList.contains('open')));
    }

    isMenuOpen() {
        return !!(this.dom.menuPopover && this.dom.menuPopover.classList.contains('open'));
    }

    closeDrawers() {
        if (this.dom.drawerEpisodes) this.dom.drawerEpisodes.classList.remove('open');
        if (this.dom.drawerSettings) this.dom.drawerSettings.classList.remove('open');
        this.closeMenuPopover();
    }

    openMenuPopover(targetBtn, title, options, currentVal, onSelect) {
        if (!this.dom.menuPopover || !this.dom.popoverList) return;
        const popover = this.dom.menuPopover;
        const titleEl = this.dom.popoverTitle;
        const listEl = this.dom.popoverList;

        if (titleEl) titleEl.textContent = title;

        const checkSvg = `<svg class="ap-popover-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;

        listEl.innerHTML = options.map(opt => {
            const isActive = String(opt.value) === String(currentVal);
            return `
                <button class="ap-popover-item ${isActive ? 'active' : ''}" data-val="${opt.value}">
                    <span>${opt.label}</span>
                    ${checkSvg}
                </button>
            `;
        }).join('');

        listEl.querySelectorAll('.ap-popover-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = btn.getAttribute('data-val');
                this.closeMenuPopover();
                if (onSelect) onSelect(val);
                if (window.LanDiskUI && window.LanDiskUI.Haptic) {
                    window.LanDiskUI.Haptic.selection();
                }
            });
        });

        // 智能定位：根据 targetBtn 计算相对位置（置于按钮上方）
        if (targetBtn && this.dom.stageBox) {
            const stageRect = this.dom.stageBox.getBoundingClientRect();
            const btnRect = targetBtn.getBoundingClientRect();
            const rightOffset = stageRect.right - btnRect.right;
            popover.style.right = Math.max(12, rightOffset - 6) + 'px';
            popover.style.bottom = (stageRect.bottom - btnRect.top + 8) + 'px';
        }

        popover.classList.add('open');
        this.activePopoverBtn = targetBtn;
    }

    closeMenuPopover() {
        if (this.dom.menuPopover) {
            this.dom.menuPopover.classList.remove('open');
        }
        this.activePopoverBtn = null;
    }

    toggleMenuPopover(targetBtn, title, options, currentVal, onSelect) {
        if (this.dom.menuPopover && this.dom.menuPopover.classList.contains('open') && this.activePopoverBtn === targetBtn) {
            this.closeMenuPopover();
        } else {
            this.openMenuPopover(targetBtn, title, options, currentVal, onSelect);
        }
    }

    takeSnapshot() {
        if (!this.dom.media || !this.dom.media.videoWidth) {
            this.showGestureToast('暂无视频画面可截取');
            return;
        }
        try {
            const video = this.dom.media;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            const timeCode = this.formatTime(video.currentTime).replace(':', '_');
            link.download = `Snapshot_${this.currentMedia ? this.currentMedia.name : 'video'}_${timeCode}.png`;
            link.href = dataUrl;
            link.click();

            this.showGestureToast('画面截取成功');
            this.showCenterBadge('✓');
        } catch (e) {
            this.showGestureToast('截帧失败: ' + e.message);
        }
    }

    togglePlay() {
        if (!this.dom.media) return;
        if (this.dom.media.paused) {
            this.dom.media.play().catch(() => {});
            this.showCenterBadge('▶');
        } else {
            this.dom.media.pause();
            this.showCenterBadge('⏸');
        }
    }

    prev() {
        if (this.playlist.length <= 1) return;
        this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        this.loadCurrentMedia();
    }

    next() {
        if (this.playlist.length <= 1) return;
        this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        this.loadCurrentMedia();
    }

    seekDelta(seconds) {
        if (!this.dom.media || !this.dom.media.duration) return;
        this.dom.media.currentTime = Math.max(0, Math.min(this.dom.media.duration, this.dom.media.currentTime + seconds));
        this.showGestureToast((seconds > 0 ? '⏭ +' : '⏮ ') + seconds + 's (' + this.formatTime(this.dom.media.currentTime) + ')');
    }

    toggleFullscreen() {
        const stageBox = this.dom.stageBox;
        if (!stageBox) return;

        const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
        const isCurrentlyFull = stageBox.classList.contains('is-fullscreen') || !!(document.fullscreenElement || document.webkitFullscreenElement);

        if (!isCurrentlyFull) {
            // 摘挂到 body：视图切换动画给舞台祖先引入 transform 层叠上下文，
            // 会把 position:fixed 和 z-index 困在祖先内，导致 header/Dock 依旧盖在
            // "全屏"舞台之上 —— 移出后全屏必定铺满整个视口
            this._stageOriginalParent = stageBox.parentNode;
            this._stageOriginalNext = stageBox.nextSibling;
            try { document.body.appendChild(stageBox); } catch (e) {}

            // 进入全屏：沉浸式网页全屏 (无浏览器 Esc 黑条干扰)
            stageBox.classList.add('is-fullscreen');
            document.body.classList.add('ap-fullscreen-active');
            if (this.dom.fsBtnLabel) this.dom.fsBtnLabel.textContent = '还原';

            // 仅在桌面宽屏环境下才可选调用原生全屏
            if (!isMobile) {
                try {
                    if (stageBox.requestFullscreen) {
                        stageBox.requestFullscreen().catch(() => {});
                    } else if (stageBox.webkitRequestFullscreen) {
                        stageBox.webkitRequestFullscreen();
                    }
                } catch (e) {}
            }

            this._lockLandscape(true);
        } else {
            // 退出全屏
            stageBox.classList.remove('is-fullscreen');
            document.body.classList.remove('ap-fullscreen-active');
            if (this.dom.fsBtnLabel) this.dom.fsBtnLabel.textContent = '全屏';

            try {
                if (document.fullscreenElement || document.webkitFullscreenElement) {
                    if (document.exitFullscreen) {
                        document.exitFullscreen().catch(() => {});
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    }
                }
            } catch (e) {}

            this._lockLandscape(false);
            this._restoreStageParent();
        }
    }

    // 横屏锁定：App 内优先走 Capacitor 插件（WebView 下不依赖原生全屏态即可生效），
    // 浏览器环境回退标准 screen.orientation API
    _lockLandscape(lock) {
        try {
            const capPlugin = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenOrientation) || null;
            if (capPlugin) {
                if (lock) capPlugin.lock({ orientation: 'landscape' }).catch(() => {});
                else capPlugin.unlock().catch(() => {});
                return;
            }
            if (screen.orientation && screen.orientation.lock) {
                if (lock) screen.orientation.lock('landscape').catch(() => {});
                else if (screen.orientation.unlock) screen.orientation.unlock();
            }
        } catch (e) {}
    }

    // 退出全屏后把舞台放回文档流原位
    _restoreStageParent() {
        const stageBox = this.dom.stageBox;
        if (!stageBox || !this._stageOriginalParent) return;
        try {
            if (this._stageOriginalNext && this._stageOriginalNext.parentNode === this._stageOriginalParent) {
                this._stageOriginalParent.insertBefore(stageBox, this._stageOriginalNext);
            } else {
                this._stageOriginalParent.appendChild(stageBox);
            }
        } catch (e) {}
        this._stageOriginalParent = null;
        this._stageOriginalNext = null;
    }

    onFullscreenChange() {
        this.closeMenuPopover();
        const isNativeFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (this.dom.stageBox) {
            if (isNativeFull) {
                this.dom.stageBox.classList.add('is-fullscreen');
                document.body.classList.add('ap-fullscreen-active');
            } else if (!isNativeFull && !this.dom.stageBox.classList.contains('is-fullscreen')) {
                document.body.classList.remove('ap-fullscreen-active');
                // Esc 等途径退出原生全屏时，同样把舞台归位
                this._restoreStageParent();
            }
        }
        if (this.dom.fsBtnLabel) {
            const isAnyFull = isNativeFull || (this.dom.stageBox && this.dom.stageBox.classList.contains('is-fullscreen'));
            this.dom.fsBtnLabel.textContent = isAnyFull ? '还原' : '全屏';
        }
    }

    setPlaybackRate(rate) {
        if (!this.dom.media) return;
        this.dom.media.playbackRate = rate;
        if (this.dom.btnSpeed) this.dom.btnSpeed.textContent = rate.toFixed(1) + 'x';
        
        const updateGrid = (grid) => {
            if (grid) {
                grid.querySelectorAll('.player-opt-pill').forEach(b => {
                    b.classList.toggle('active', parseFloat(b.getAttribute('data-speed')) === rate);
                });
            }
        };
        updateGrid(this.dom.speedGrid);
        updateGrid(this.dom.fsSpeedGrid);

        this.showGestureToast('倍速: ' + rate.toFixed(1) + 'x');
    }

    setVideoFilter(preset) {
        this.currentFilter = preset;
        const filters = {
            none: '',
            warm: 'sepia(0.25) brightness(1.05)',
            cinema: 'contrast(1.22) saturate(1.15)',
            vivid: 'saturate(1.42) contrast(1.08)'
        };
        if (this.dom.media) this.dom.media.style.filter = filters[preset] || '';

        const updateGrid = (grid) => {
            if (grid) {
                grid.querySelectorAll('.player-opt-pill').forEach(b => {
                    b.classList.toggle('active', b.getAttribute('data-filter') === preset);
                });
            }
        };
        updateGrid(this.dom.filterGrid);
        updateGrid(this.dom.fsFilterGrid);

        const names = { none: '原画', warm: '夜间暖光', cinema: '影院高对比', vivid: '鲜艳生动' };
        if (this.dom.btnFilterToggle) this.dom.btnFilterToggle.innerHTML = '<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4 4 4 0 014-4c2 0 2-4 6-4 4 0 7 3 7 7a7 7 0 01-7 7H7z"/></svg><span class="ap-btn-label">' + (names[preset] || '原画') + '</span>';
        this.showGestureToast('画面色彩: ' + (names[preset] || '原画'));
    }

    setObjectFit(fit) {
        this.objectFitMode = fit;
        if (this.dom.media) this.dom.media.style.objectFit = fit;

        const updateGrid = (grid) => {
            if (grid) {
                grid.querySelectorAll('.player-opt-pill[data-fit]').forEach(b => {
                    b.classList.toggle('active', b.getAttribute('data-fit') === fit);
                });
            }
        };
        updateGrid(this.dom.fitGrid);
        updateGrid(this.dom.fsFitGrid);

        const names = { contain: '自适应', cover: '铺满全屏', fill: '拉伸全屏' };
        if (this.dom.btnFitToggle) this.dom.btnFitToggle.innerHTML = '<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg><span class="ap-btn-label">' + (names[fit] || '自适应') + '</span>';
        this.showGestureToast('画面比例: ' + (names[fit] || fit));
    }

    setLoopMode(mode) {
        this.loopMode = mode;
        const updateGrid = (grid) => {
            if (grid) {
                grid.querySelectorAll('.player-opt-pill[data-loop]').forEach(b => {
                    b.classList.toggle('active', b.getAttribute('data-loop') === mode);
                });
            }
        };
        updateGrid(this.dom.fsLoopGrid);
        const names = { all: '列表循环', one: '单曲循环', off: '顺序播放' };
        this.showGestureToast('循环模式: ' + (names[mode] || mode));
    }

    rotateVideo() {
        this.rotateAngle = (this.rotateAngle + 90) % 360;
        if (this.dom.media) this.dom.media.style.transform = `rotate(${this.rotateAngle}deg)`;
        this.showGestureToast('画面旋转 ' + this.rotateAngle + '°');
    }

    resetTransform() {
        this.rotateAngle = 0;
        if (this.dom.media) {
            this.dom.media.style.transform = '';
            this.dom.media.style.objectFit = this.objectFitMode;
            if (this.currentFilter !== 'none') {
                this.setVideoFilter(this.currentFilter);
            }
        }
    }

    toggleLock() {
        this.isLocked = !this.isLocked;
        if (this.dom.lockBtn) this.dom.lockBtn.classList.toggle('locked', this.isLocked);
        if (this.dom.iconUnlock) this.dom.iconUnlock.style.display = this.isLocked ? 'none' : 'block';
        if (this.dom.iconLock) this.dom.iconLock.style.display = this.isLocked ? 'block' : 'none';
        this.showGestureToast(this.isLocked ? '已锁定屏幕' : '已解锁屏幕');
    }

    async togglePiP() {
        if (!this.dom.media) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (this.dom.media.requestPictureInPicture) {
                await this.dom.media.requestPictureInPicture();
            }
        } catch (e) {}
    }

    onTimeUpdate() {
        const media = this.dom.media;
        if (!media || !media.duration) return;

        // 如果用户当前正在手指拖拽或按住进度条，禁止被底层播放器 timeupdate 覆盖
        if (!this.isProgressDragging) {
            const current = media.currentTime;
            const duration = media.duration;
            const percent = Math.min(100, Math.max(0, (current / duration) * 100));

            if (this.dom.progressFill) this.dom.progressFill.style.width = percent + '%';
            if (this.dom.progressThumb) this.dom.progressThumb.style.left = percent + '%';
            if (this.dom.timeText) this.dom.timeText.textContent = this.formatTime(current) + ' / ' + this.formatTime(duration);
        }

        // 实时字幕对齐与渲染
        this.renderSubtitleCue(media.currentTime);

        if (media.currentTime > 3 && media.duration > 10 && !this.isProgressDragging) {
            const now = Date.now();
            if (!this._lastHistorySave || now - this._lastHistorySave > 2500) {
                this._lastHistorySave = now;
                this.savePlayHistory(media.currentTime, media.duration);
            }
        }
    }

    onProgress() {
        const media = this.dom.media;
        if (!media || !media.duration || media.buffered.length === 0) return;
        const bufferedEnd = media.buffered.end(media.buffered.length - 1);
        const percent = (bufferedEnd / media.duration) * 100;
        if (this.dom.progressBuffer) this.dom.progressBuffer.style.width = percent + '%';
    }

    onPlayStateChange(playing) {
        this.isPlaying = playing;
        if (this.dom.iconPlay) this.dom.iconPlay.style.display = playing ? 'none' : 'block';
        if (this.dom.iconPause) this.dom.iconPause.style.display = playing ? 'block' : 'none';
        if (this.dom.audioVinyl) this.dom.audioVinyl.classList.toggle('playing', playing);
    }

    onEnded() {
        if (this.loopMode === 'one') {
            this.dom.media.currentTime = 0;
            this.dom.media.play();
        } else if (this.loopMode === 'off' && this.currentIndex === this.playlist.length - 1) {
            this.showGestureToast('播放列表已结束');
        } else {
            this.next();
        }
    }

    onLoadedMetadata() {
        this.onTimeUpdate();
        this.onProgress();
        this.renderRealVideoMeta();
    }

    // 用真实探测到的分辨率替换占位文案（videoWidth/videoHeight 来自解码元数据）
    renderRealVideoMeta() {
        if (!this._pendingVideoMetaText || !this.dom.media) return;
        const w = this.dom.media.videoWidth;
        const h = this.dom.media.videoHeight;
        if (!w || !h) return;
        this._pendingVideoMetaText = false;
        const tier = h >= 2160 ? '4K' : (h >= 1080 ? '1080P' : (h >= 720 ? '720P' : h + 'P'));
        if (this.dom.cardSub) this.dom.cardSub.textContent = `${w}×${h} (${tier}) · 局域网直连流式播放`;
        if (this.dom.videoBadge) this.dom.videoBadge.innerHTML = `<span class="ap-status-dot"></span>${tier}`;
    }

    formatTime(sec) {
        if (!sec || isNaN(sec)) return '00:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    bindProgressEvents(wrap) {
        if (!wrap) return;
        const fill = this.dom.progressFill;
        const thumb = this.dom.progressThumb;
        const tooltip = this.dom.progressTooltip;
        let isDragging = false;
        let lastHapticBucket = -1;

        const getPosFromEvent = (e) => {
            const rect = wrap.getBoundingClientRect();
            let clientX = 0;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
            } else {
                clientX = e.clientX;
            }
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        };

        const updateVisuals = (pos) => {
            const percent = pos * 100;
            if (fill) fill.style.width = percent + '%';
            if (thumb) thumb.style.left = percent + '%';

            if (this.dom.media && this.dom.media.duration) {
                const targetSec = pos * this.dom.media.duration;
                const formattedCur = this.formatTime(targetSec);
                const formattedDur = this.formatTime(this.dom.media.duration);

                if (this.dom.timeText) {
                    this.dom.timeText.textContent = `${formattedCur} / ${formattedDur}`;
                }
                if (tooltip) {
                    tooltip.textContent = `${formattedCur} / ${formattedDur}`;
                    tooltip.style.left = Math.max(8, Math.min(92, percent)) + '%';
                }

                // 拖拽跨越 30 秒区间时提供轻触感反馈
                const curBucket = Math.floor(targetSec / 30);
                if (lastHapticBucket !== curBucket) {
                    lastHapticBucket = curBucket;
                    if (window.LanDiskUI && window.LanDiskUI.Haptic) {
                        window.LanDiskUI.Haptic.selection();
                    }
                }
            }
        };

        let rafSeekId = null;
        let pendingSeekSec = null;

        const executeFastSeek = (sec) => {
            if (!this.dom.media || isNaN(sec)) return;
            try {
                if (typeof this.dom.media.fastSeek === 'function') {
                    this.dom.media.fastSeek(sec);
                } else {
                    this.dom.media.currentTime = sec;
                }
            } catch (e) {}
        };

        const startDrag = (e) => {
            if (!this.dom.media || !this.dom.media.duration) return;
            isDragging = true;
            this.isProgressDragging = true;
            wrap.classList.add('is-dragging');
            if (e.stopPropagation) e.stopPropagation();

            const pos = getPosFromEvent(e);
            updateVisuals(pos);
            const targetSec = pos * this.dom.media.duration;
            executeFastSeek(targetSec);

            if (window.LanDiskUI && window.LanDiskUI.Haptic) {
                window.LanDiskUI.Haptic.selection();
            }
        };

        const moveDrag = (e) => {
            if (!isDragging) return;
            if (e.cancelable && e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();

            const pos = getPosFromEvent(e);
            updateVisuals(pos);

            // 拖拽移动时使用 requestAnimationFrame + fastSeek 实时平滑刷新关键帧画面
            if (this.dom.media && this.dom.media.duration) {
                pendingSeekSec = pos * this.dom.media.duration;
                if (!rafSeekId) {
                    rafSeekId = requestAnimationFrame(() => {
                        rafSeekId = null;
                        if (pendingSeekSec !== null) {
                            executeFastSeek(pendingSeekSec);
                        }
                    });
                }
            }
        };

        const endDrag = (e) => {
            if (!isDragging) return;
            isDragging = false;
            wrap.classList.remove('is-dragging');
            if (e.stopPropagation) e.stopPropagation();

            if (rafSeekId) {
                cancelAnimationFrame(rafSeekId);
                rafSeekId = null;
            }

            const pos = getPosFromEvent(e);
            if (this.dom.media && this.dom.media.duration) {
                const targetSec = pos * this.dom.media.duration;
                try {
                    this.dom.media.currentTime = targetSec;
                } catch (e) {}
                if (window.LanDiskUI && window.LanDiskUI.Haptic) {
                    window.LanDiskUI.Haptic.light();
                }
            }

            // 延迟 120ms 退出拖拽状态，恢复 timeupdate 自动同步
            setTimeout(() => {
                this.isProgressDragging = false;
            }, 120);
        };

        // 鼠标事件
        wrap.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', moveDrag);
        window.addEventListener('mouseup', endDrag);

        // 触摸事件 (采用 non-passive 以精准阻止外层手势与页面滚动冲突)
        wrap.addEventListener('touchstart', startDrag, { passive: false });
        window.addEventListener('touchmove', moveDrag, { passive: false });
        window.addEventListener('touchend', endDrag);
        window.addEventListener('touchcancel', endDrag);
    }

    bindStageGestures(box) {
        if (!box) return;

        box.addEventListener('click', (e) => {
            if (e.target.closest('.player-ctrl-bottom') || e.target.closest('.player-ctrl-top') || e.target.closest('.ap-fs-drawer') || e.target.closest('.ap-resume-toast') || e.target.closest('.ap-lock-btn') || e.target.closest('.ap-menu-popover')) {
                return;
            }

            // 若有选项弹窗菜单或抽屉打开，点击任意区域关闭
            if (this.dom.menuPopover && this.dom.menuPopover.classList.contains('open')) {
                this.closeMenuPopover();
                return;
            }

            if (this.isLocked) {
                this.showGestureToast('已锁定屏幕，轻触解锁');
                return;
            }

            // 若有抽屉处于展开状态，点击视窗任意区域立即收起抽屉
            const anyDrawerOpen = (this.dom.drawerEpisodes && this.dom.drawerEpisodes.classList.contains('open')) ||
                                  (this.dom.drawerSettings && this.dom.drawerSettings.classList.contains('open'));
            if (anyDrawerOpen) {
                this.closeDrawers();
                return;
            }

            const now = Date.now();
            if (now - this.lastTapTime < 280) {
                // 双击：撤销未执行的单击动作（避免控制条先闪一下再隐藏）
                clearTimeout(this._singleTapTimer);
                this._singleTapTimer = null;
                this.lastTapTime = 0;
                const rect = box.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (clickX < rect.width * 0.35) {
                    this.seekDelta(-10);
                } else if (clickX > rect.width * 0.65) {
                    this.seekDelta(10);
                } else {
                    this.togglePlay();
                }
            } else {
                // 单击延迟到双击窗口过后再执行
                this.lastTapTime = now;
                clearTimeout(this._singleTapTimer);
                this._singleTapTimer = setTimeout(() => {
                    this._singleTapTimer = null;
                    this.toggleControls();
                }, 270);
            }
        });

        box.addEventListener('touchstart', (e) => {
            if (e.target.closest('.player-ctrl-bottom') || e.target.closest('.player-ctrl-top') || e.target.closest('.ap-fs-drawer') || e.target.closest('.ap-resume-toast') || e.target.closest('.ap-lock-btn') || e.target.closest('.ap-menu-popover')) {
                return;
            }
            if (e.touches.length !== 1 || this.isLocked) return;
            const touch = e.touches[0];
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.isSwiping = false;
            this.swipeDirection = null;
            this.startVolume = this.dom.media ? this.dom.media.volume : 1;
            this.startBrightness = this.brightness;
            this.startSeekTime = this.dom.media ? this.dom.media.currentTime : 0;

            this.pressSpeedTimer = setTimeout(() => {
                if (!this.isSwiping && this.isPlaying) {
                    this.isPressSpeeding = true;
                    this.prePressRate = this.dom.media.playbackRate;
                    this.dom.media.playbackRate = 2.0;
                    if (this.dom.speedBadge) this.dom.speedBadge.style.display = 'block';
                }
            }, 380);
        }, { passive: true });

        box.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 1 || this.isLocked) return;
            const touch = e.touches[0];
            const dx = touch.clientX - this.touchStartX;
            const dy = touch.clientY - this.touchStartY;

            if (!this.isSwiping && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
                clearTimeout(this.pressSpeedTimer);
                this.isSwiping = true;
                this.swipeDirection = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
            }

            if (this.isSwiping) {
                if (this.swipeDirection === 'vertical') {
                    const rect = box.getBoundingClientRect();
                    const deltaPercent = (-dy / rect.height) * 100;
                    if (this.touchStartX < rect.width * 0.5) {
                        // 亮度即 CSS 滤镜，只对画面生效：限制在 20%-100%，
                        // 超过 100% 会过曝且 HUD 会让人误以为在调系统亮度
                        const newBrightness = Math.max(20, Math.min(100, this.startBrightness + deltaPercent * 1.2));
                        this.brightness = newBrightness;
                        if (this.dom.media) this.dom.media.style.filter = `brightness(${newBrightness}%)`;
                        this.showBrightnessHUD(newBrightness);
                    } else {
                        const newVol = Math.max(0, Math.min(1, this.startVolume + (-dy / 160)));
                        if (this.dom.media) this.dom.media.volume = newVol;
                        this.showVolumeHUD(newVol);
                    }
                } else if (this.swipeDirection === 'horizontal') {
                    if (!this.dom.media || !this.dom.media.duration) return;
                    const deltaSec = (dx / 200) * 60;
                    const targetSeek = Math.max(0, Math.min(this.dom.media.duration, this.startSeekTime + deltaSec));
                    this.touchTargetSeek = targetSeek;
                    this.showGestureToast('⏱️ ' + this.formatTime(targetSeek) + ' / ' + this.formatTime(this.dom.media.duration));
                }
            }
        }, { passive: true });

        const endTouch = () => {
            clearTimeout(this.pressSpeedTimer);
            if (this.isPressSpeeding) {
                this.isPressSpeeding = false;
                if (this.dom.media) this.dom.media.playbackRate = this.prePressRate;
                if (this.dom.speedBadge) this.dom.speedBadge.style.display = 'none';
            }
            if (this.isSwiping && this.touchTargetSeek !== null) {
                if (this.dom.media) this.dom.media.currentTime = this.touchTargetSeek;
                this.touchTargetSeek = null;
            }
            this.hideHUDs();
            this.hideGestureToast();
        };

        box.addEventListener('touchend', endTouch);
        box.addEventListener('touchcancel', endTouch);
    }

    showControls() {
        this.controlsVisible = true;
        if (this.dom.controlsOverlay) this.dom.controlsOverlay.classList.remove('hidden');
        clearTimeout(this._controlsTimer);
        if (this.isPlaying) {
            this._controlsTimer = setTimeout(() => {
                this.controlsVisible = false;
                if (this.dom.controlsOverlay) this.dom.controlsOverlay.classList.add('hidden');
                this.closeDrawers();
            }, 4000);
        }
    }

    toggleControls() {
        if (this.controlsVisible) {
            this.controlsVisible = false;
            if (this.dom.controlsOverlay) this.dom.controlsOverlay.classList.add('hidden');
            this.closeDrawers();
        } else {
            this.showControls();
        }
    }

    showBrightnessHUD(val) {
        if (!this.dom.hudBrightness) return;
        this.dom.hudBrightness.classList.add('show');
        const percent = Math.round(val); // 亮度值本身即百分比（20-100）
        if (this.dom.hudBrightnessFill) this.dom.hudBrightnessFill.style.height = percent + '%';
        if (this.dom.hudBrightnessVal) this.dom.hudBrightnessVal.textContent = Math.round(val) + '%';
    }

    showVolumeHUD(vol) {
        if (!this.dom.hudVolume) return;
        this.dom.hudVolume.classList.add('show');
        const percent = Math.round(vol * 100);
        if (this.dom.hudVolumeFill) this.dom.hudVolumeFill.style.height = percent + '%';
        if (this.dom.hudVolumeVal) this.dom.hudVolumeVal.textContent = percent + '%';
    }

    hideHUDs() {
        setTimeout(() => {
            if (this.dom.hudBrightness) this.dom.hudBrightness.classList.remove('show');
            if (this.dom.hudVolume) this.dom.hudVolume.classList.remove('show');
        }, 500);
    }

    showGestureToast(msg) {
        if (!this.dom.gestureToast) return;
        this.dom.gestureToast.textContent = msg;
        this.dom.gestureToast.classList.add('show');
    }

    hideGestureToast() {
        setTimeout(() => {
            if (this.dom.gestureToast) this.dom.gestureToast.classList.remove('show');
        }, 800);
    }

    setLoading(loading) {
        if (!this.dom.loadingSpinner) return;
        if (loading) {
            this.dom.loadingSpinner.classList.add('show');
            if (this.dom.centerBadge) this.dom.centerBadge.classList.remove('show');
        } else {
            this.dom.loadingSpinner.classList.remove('show');
        }
    }

    showCenterBadge(text) {
        if (!this.dom.centerBadge) return;
        if (this.dom.loadingSpinner && this.dom.loadingSpinner.classList.contains('show')) return;
        this.dom.centerBadge.textContent = text;
        this.dom.centerBadge.classList.add('show');
        if (this._centerBadgeTimer) clearTimeout(this._centerBadgeTimer);
        this._centerBadgeTimer = setTimeout(() => {
            if (this.dom.centerBadge) this.dom.centerBadge.classList.remove('show');
        }, 320);
    }

    openInExternalApp(protocol = 'intent') {
        if (!this.currentMedia) return;
        const streamUrl = this.getStreamUrl(this.currentMedia);
        if (!streamUrl) return;

        let absoluteUrl = streamUrl;
        if (absoluteUrl.startsWith('/')) {
            if (window.LanDiskAuth && typeof window.LanDiskAuth.api === 'function') {
                absoluteUrl = window.LanDiskAuth.api(streamUrl);
            } else {
                const baseUrl = window.currentServerUrl || window.location.origin;
                absoluteUrl = baseUrl.replace(/\/$/, '') + streamUrl;
            }
        }

        if (protocol === 'copy') {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(absoluteUrl).then(() => {
                    if (window.LanDiskUI && window.LanDiskUI.showToast) {
                        window.LanDiskUI.showToast('✅ 局域网直连串流地址已复制，可在 Infuse / VLC / PotPlayer 中粘贴播放');
                    } else {
                        alert('已复制串流地址: ' + absoluteUrl);
                    }
                }).catch(() => {
                    prompt('请手动复制局域网串流地址：', absoluteUrl);
                });
            } else {
                prompt('请手动复制局域网串流地址：', absoluteUrl);
            }
            return;
        }

        if (protocol === 'vlc') {
            const vlcUrl = `vlc://${absoluteUrl.replace(/^https?:\/\//, 'http://')}`;
            window.location.href = vlcUrl;
            if (window.LanDiskUI && window.LanDiskUI.showToast) {
                window.LanDiskUI.showToast('正在尝试唤起 VLC 播放器...');
            }
            return;
        }

        if (protocol === 'nplayer') {
            const nplayerUrl = `nplayer-${absoluteUrl}`;
            window.location.href = nplayerUrl;
            if (window.LanDiskUI && window.LanDiskUI.showToast) {
                window.LanDiskUI.showToast('正在尝试唤起 nPlayer 播放器...');
            }
            return;
        }

        if (protocol === 'potplayer') {
            const potUrl = `potplayer://${absoluteUrl}`;
            window.location.href = potUrl;
            return;
        }

        // 默认: 唤起移动端系统播放器选择器 (MX Player, 系统相册, VLC 等)
        const isAndroid = /android/i.test(navigator.userAgent);
        if (isAndroid) {
            const cleanHttp = absoluteUrl.replace(/^https?:\/\//, '');
            const intentUrl = `intent://${cleanHttp}#Intent;scheme=http;type=video/*;action=android.intent.action.VIEW;end`;
            window.location.href = intentUrl;
            if (window.LanDiskUI && window.LanDiskUI.showToast) {
                window.LanDiskUI.showToast('正在调起系统与外部播放器 App...');
            }
        } else {
            const choice = confirm(`是否使用外部播放器打开？\n\n点击【确定】复制局域网直连播放地址（可在 Infuse / PotPlayer / VLC / IINA / VidHub 中直接粘贴秒开），点击【取消】留在网页播放。`);
            if (choice) {
                this.openInExternalApp('copy');
            }
        }
    }

    savePlayHistory(current, duration) {
        if (!this.currentMedia || !this.currentMedia.path) return;
        const now = Date.now();
        const curSec = Math.floor(current);
        const durSec = Math.floor(duration);
        const percentage = durSec > 0 ? Math.min(100, Math.max(0, Math.round((curSec / durSec) * 100))) : 0;

        // 1. 写入本地 LocalStorage
        try {
            const raw = localStorage.getItem(this.historyStorageKey);
            const history = raw ? JSON.parse(raw) : {};
            history[this.currentMedia.path] = {
                name: this.currentMedia.name,
                path: this.currentMedia.path,
                current: curSec,
                duration: durSec,
                percentage,
                time: now
            };
            const keys = Object.keys(history);
            if (keys.length > 80) {
                keys.sort((a, b) => history[a].time - history[b].time);
                while (keys.length > 80) {
                    delete history[keys.shift()];
                }
            }
            localStorage.setItem(this.historyStorageKey, JSON.stringify(history));
        } catch (e) {}

        // 2. 跨设备同步至服务端持久化数据库
        try {
            let authHeaders = { 'Content-Type': 'application/json' };
            if (window.LanDiskAuth && typeof window.LanDiskAuth.authHeaders === 'function') {
                authHeaders = window.LanDiskAuth.authHeaders(authHeaders);
            }
            fetch('/api/media/progress', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    path: this.currentMedia.path,
                    time: curSec,
                    duration: durSec
                })
            }).catch(() => {});
        } catch (e) {}
    }

    async checkResumeHistory(item) {
        if (!item || !item.path) return;
        let record = null;

        // 1. 优先尝试从服务端拉取最新的跨设备断点续播记录
        try {
            let authQ = '';
            if (window.LanDiskAuth && typeof window.LanDiskAuth.authQuery === 'function') {
                const q = window.LanDiskAuth.authQuery();
                if (q) authQ = q.replace(/^\?/, '&');
            }
            const endpoint = (window.LanDiskAuth && window.LanDiskAuth.api) ? window.LanDiskAuth.api('/api/media/progress') : (window.api ? window.api('/api/media/progress') : '/api/media/progress');
            const res = await fetch(`${endpoint}?path=${encodeURIComponent(item.path)}${authQ}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.progress && data.progress.time > 8) {
                    record = {
                        current: data.progress.time,
                        duration: data.progress.duration,
                        percentage: data.progress.percentage
                    };
                }
            }
        } catch (e) {}

        // 2. 本地回退检查
        if (!record) {
            try {
                const raw = localStorage.getItem(this.historyStorageKey);
                if (raw) {
                    const history = JSON.parse(raw);
                    const localRec = history[item.path];
                    if (localRec && localRec.current > 8) {
                        record = localRec;
                    }
                }
            } catch (e) {}
        }

        if (record && record.current > 8 && (!record.duration || record.current < record.duration - 12)) {
            const targetTime = record.current;
            const formatted = this.formatTime(targetTime);
            const percentStr = record.percentage ? ` · ${record.percentage}%` : '';
            this.showResumeToast(`${formatted}${percentStr}`, () => {
                if (this.dom.media) {
                    this.dom.media.currentTime = targetTime;
                    this.showGestureToast('已继续播放至 ' + formatted);
                }
            });
        }
    }

    showResumeToast(formattedTime, onResume) {
        if (!this.dom.resumeToast) return;
        if (this.dom.resumeText) this.dom.resumeText.textContent = '上次播放至 ' + formattedTime;
        this.dom.resumeToast.classList.add('show');

        if (this.dom.btnResumeAction) {
            this.dom.btnResumeAction.onclick = (e) => {
                e.stopPropagation();
                this.hideResumeToast();
                if (onResume) onResume();
            };
        }

        clearTimeout(this._resumeToastTimer);
        this._resumeToastTimer = setTimeout(() => this.hideResumeToast(), 8000);
    }

    hideResumeToast() {
        if (this.dom.resumeToast) this.dom.resumeToast.classList.remove('show');
        clearTimeout(this._resumeToastTimer);
    }

    // ---------------- 字幕解析与调度引擎 ----------------
    parseSRT(text) {
        if (!text) return [];
        const cues = [];
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const blocks = normalized.split(/\n\s*\n/);
        
        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length < 2) continue;
            let timeLine = lines[0].includes('-->') ? lines[0] : (lines[1].includes('-->') ? lines[1] : null);
            if (!timeLine) continue;
            
            const match = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[,\.]\d{2,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{2,3})/);
            if (!match) continue;
            
            const start = this.timeStrToSeconds(match[1]);
            const end = this.timeStrToSeconds(match[2]);
            const timeIdx = lines.indexOf(timeLine);
            const textLines = lines.slice(timeIdx + 1).join('\n');
            const cleanText = textLines.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
            if (cleanText) {
                cues.push({ start, end, text: cleanText });
            }
        }
        return cues;
    }

    parseVTT(text) {
        if (!text) return [];
        return this.parseSRT(text.replace(/^WEBVTT[^\n]*\n+/i, ''));
    }

    parseASS(text) {
        if (!text) return [];
        const cues = [];
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            if (line.startsWith('Dialogue:')) {
                const parts = line.split(',');
                if (parts.length >= 10) {
                    const start = this.timeStrToSeconds(parts[1].trim());
                    const end = this.timeStrToSeconds(parts[2].trim());
                    const rawText = parts.slice(9).join(',');
                    const cleanText = rawText.replace(/\{[^}]+\}/g, '').replace(/\\N/gi, '\n').trim();
                    if (cleanText) {
                        cues.push({ start, end, text: cleanText });
                    }
                }
            }
        }
        return cues;
    }

    timeStrToSeconds(str) {
        if (!str) return 0;
        const normalized = str.replace(',', '.');
        const parts = normalized.split(':');
        if (parts.length === 3) {
            return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
            return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(normalized) || 0;
    }

    async detectSubtitles(item) {
        if (!item || !item.path) return;
        this.subtitles = [];
        this.currentSubtitleTrack = null;
        this.subtitleCues = [];
        this.updateSubtitleUI([]);

        try {
            let authQ = '';
            if (window.LanDiskAuth && typeof window.LanDiskAuth.authQuery === 'function') {
                const q = window.LanDiskAuth.authQuery();
                if (q) authQ = q.replace(/^\?/, '&');
            }
            const endpoint = (window.LanDiskAuth && window.LanDiskAuth.api) ? window.LanDiskAuth.api('/api/media/subtitles') : (window.api ? window.api('/api/media/subtitles') : '/api/media/subtitles');
            const res = await fetch(`${endpoint}?path=${encodeURIComponent(item.path)}${authQ}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
                    this.subtitles = data.subtitles;
                    this.updateSubtitleUI(this.subtitles);
                    // 默认自动挂载探测到的第一个字幕
                    this.loadSubtitleTrack(this.subtitles[0]);
                } else {
                    const label = '未发现同名字幕';
                    if (this.dom.fsSubStatus) this.dom.fsSubStatus.textContent = label;
                    if (this.dom.subStatus) this.dom.subStatus.textContent = label;
                }
            }
        } catch (e) {}
    }

    updateSubtitleUI(tracks = []) {
        const renderGrid = (grid) => {
            if (!grid) return;
            let html = `
                <button class="player-opt-pill ${tracks.length > 0 ? 'active' : ''}" data-sub="auto">自动探测</button>
                <button class="player-opt-pill ${tracks.length === 0 ? 'active' : ''}" data-sub="off">关闭字幕</button>
            `;
            tracks.forEach((track, idx) => {
                html += `<button class="player-opt-pill ${idx === 0 ? 'active' : ''}" data-sub="track" data-sub-idx="${idx}">${track.name}</button>`;
            });
            grid.innerHTML = html;
        };

        renderGrid(this.dom.fsSubTracksGrid);
        renderGrid(this.dom.subTracksGrid);
    }

    async loadSubtitleTrack(track) {
        if (!track || !track.url) return;
        this.currentSubtitleTrack = track;
        try {
            let authQ = '';
            if (window.LanDiskAuth && typeof window.LanDiskAuth.authQuery === 'function') {
                const q = window.LanDiskAuth.authQuery();
                if (q) authQ = q.replace(/^\?/, '&');
            }
            const res = await fetch(track.url + authQ);
            if (res.ok) {
                const text = await res.text();
                this.loadSubtitleText(text, track.name, track.format);
            }
        } catch (e) {
            this.showGestureToast('字幕加载失败');
        }
    }

    loadSubtitleText(text, trackName = '自定义字幕', format = 'srt') {
        if (!text) return;
        let cues = [];
        if (format === 'ass' || format === 'ssa' || text.includes('[Script Info]')) {
            cues = this.parseASS(text);
        } else if (format === 'vtt' || text.startsWith('WEBVTT')) {
            cues = this.parseVTT(text);
        } else {
            cues = this.parseSRT(text);
        }

        this.subtitleCues = cues.sort((a, b) => a.start - b.start);
        this.subtitlesEnabled = true;
        
        const statusText = `已挂载字幕: ${trackName} (${cues.length} 句)`;
        if (this.dom.fsSubStatus) this.dom.fsSubStatus.textContent = statusText;
        if (this.dom.subStatus) this.dom.subStatus.textContent = statusText;
        this.showGestureToast(statusText);
    }

    renderSubtitleCue(currentTime) {
        if (!this.dom.subtitleText || !this.subtitlesEnabled || !this.subtitleCues.length) {
            if (this.dom.subtitleText) {
                this.dom.subtitleText.classList.remove('show');
                this.dom.subtitleText.textContent = '';
            }
            return;
        }

        const t = currentTime + (this.subtitleOffset || 0);
        let activeText = '';

        for (let i = 0; i < this.subtitleCues.length; i++) {
            const cue = this.subtitleCues[i];
            if (t >= cue.start && t <= cue.end) {
                activeText = cue.text;
                break;
            }
            if (cue.start > t) break;
        }

        if (activeText) {
            if (this.dom.subtitleText.textContent !== activeText) {
                this.dom.subtitleText.textContent = activeText;
            }
            this.dom.subtitleText.classList.add('show');
        } else {
            this.dom.subtitleText.classList.remove('show');
        }
    }

    setSubtitleSize(size) {
        this.subtitleSize = size;
        if (this.dom.subtitleText) {
            this.dom.subtitleText.classList.remove('sub-size-sm', 'sub-size-md', 'sub-size-lg', 'sub-size-xl');
            this.dom.subtitleText.classList.add('sub-size-' + size);
        }
        [this.dom.fsSubSizeGrid, this.dom.subSizeGrid].forEach(grid => {
            if (grid) {
                grid.querySelectorAll('[data-subsize]').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-subsize') === size);
                });
            }
        });
        const sizeNames = { sm: '小号 (14px)', md: '中号 (18px)', lg: '大号 (22px)', xl: '特大 (26px)' };
        this.showGestureToast(`字幕字号: ${sizeNames[size] || size}`);
    }

    setSubtitleDelay(delay) {
        this.subtitleOffset = parseFloat(delay) || 0;
        [this.dom.fsSubDelayGrid, this.dom.subDelayGrid].forEach(grid => {
            if (grid) {
                grid.querySelectorAll('[data-subdelay]').forEach(btn => {
                    btn.classList.toggle('active', parseFloat(btn.getAttribute('data-subdelay')) === this.subtitleOffset);
                });
            }
        });
        this.showGestureToast(`字幕时间轴: ${this.subtitleOffset > 0 ? '+' : ''}${this.subtitleOffset}s`);
    }

    toggleSubtitle(enabled) {
        this.subtitlesEnabled = !!enabled;
        if (!this.subtitlesEnabled && this.dom.subtitleText) {
            this.dom.subtitleText.classList.remove('show');
            this.dom.subtitleText.textContent = '';
        }
        const label = this.subtitlesEnabled ? '字幕已开启' : '字幕已关闭';
        if (this.dom.fsSubStatus) this.dom.fsSubStatus.textContent = label;
        if (this.dom.subStatus) this.dom.subStatus.textContent = label;
        this.showGestureToast(label);
    }

    initAudioVisualizer() {
        if (this.audioCtx) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
            this.audioAnalyser = this.audioCtx.createAnalyser();
            this.audioAnalyser.fftSize = 64;
            this.audioSource = this.audioCtx.createMediaElementSource(this.dom.media);
            this.audioSource.connect(this.audioAnalyser);
            this.audioAnalyser.connect(this.audioCtx.destination);

            const canvas = this.dom.audioCanvas;
            const ctx = canvas.getContext('2d');
            const bufferLength = this.audioAnalyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const render = () => {
                this.animFrameId = requestAnimationFrame(render);
                this.audioAnalyser.getByteFrequencyData(dataArray);

                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const barWidth = (canvas.width / bufferLength) * 2;
                let x = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const barHeight = (dataArray[i] / 255) * canvas.height * 0.75;
                    ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
                    ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
                    x += barWidth;
                }
            };
            render();
        } catch (e) {}
    }

    onKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (!this.dom.view || !this.dom.view.classList.contains('active')) return;

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'arrowleft':
                e.preventDefault();
                this.seekDelta(-10);
                break;
            case 'arrowright':
                e.preventDefault();
                this.seekDelta(10);
                break;
            case 'f':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 's':
                e.preventDefault();
                this.takeSnapshot();
                break;
            case 'escape':
                const anyDrawerOpen = (this.dom.drawerEpisodes && this.dom.drawerEpisodes.classList.contains('open')) ||
                                      (this.dom.drawerSettings && this.dom.drawerSettings.classList.contains('open'));
                if (anyDrawerOpen) {
                    this.closeDrawers();
                } else {
                    this.close();
                }
                break;
        }
    }
}

window.AppleMediaPlayer = new AppleCinemaPlayerEngine();
