/**
 * 猫步互联 Pro · 关于与自动更新组件 (AboutPanelComponent & UpdateModalComponent)
 * 参考高审美 Liquid Glass 质感，集成多源免限流 CDN 探针、软件内一键下载静默升级与独立 UpdateModal 弹窗
 */

(function (global) {
    'use strict';

    const I = (name, size) => (global.Icons ? global.Icons.render(name, size) : '');
    const UI = global.LanDiskUI || global.UI;
    // 使用动态 Proxy 延迟解析 LanDiskIPC，解决脚本加载时序差
    const IPC = new Proxy({}, {
        get: (_, prop) => {
            const real = global.LanDiskIPC;
            if (!real) return undefined;
            const val = real[prop];
            return typeof val === 'function' ? val.bind(real) : val;
        }
    });

    function getApiBase() {
        const real = global.LanDiskIPC;
        if (real && real.state && real.state.url) {
            return real.state.url.replace(/\/$/, '');
        }
        if (global.currentServerUrl) {
            return global.currentServerUrl.replace(/\/$/, '');
        }
        if (typeof location !== 'undefined' && location.protocol && location.protocol.startsWith('http')) {
            return location.origin;
        }
        return 'http://127.0.0.1:3000';
    }

    async function safeFetchJson(url, options) {
        const res = await fetch(url, options);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        const trimmed = (text || '').trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            throw new Error('接口响应非 JSON 结构');
        }
        return JSON.parse(trimmed);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let val = bytes;
        let unitIndex = 0;
        while (val >= 1024 && unitIndex < units.length - 1) {
            val /= 1024;
            unitIndex++;
        }
        return val.toFixed(unitIndex === 0 ? 0 : 1) + ' ' + units[unitIndex];
    }

    function compareVersions(v1, v2) {
        const clean1 = String(v1 || '').replace(/^[vV]/, '').trim();
        const clean2 = String(v2 || '').replace(/^[vV]/, '').trim();
        const p1 = clean1.split(/[-.]/).map(n => parseInt(n, 10) || 0);
        const p2 = clean2.split(/[-.]/).map(n => parseInt(n, 10) || 0);
        const len = Math.max(p1.length, p2.length);
        for (let i = 0; i < len; i++) {
            const a = p1[i] || 0;
            const b = p2[i] || 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    }

    /* ---------- 功能特性与技术架构配置 ---------- */
    const ARCHITECTURE_LAYERS = [
        {
            title: '🎨 前端交互层',
            sub: '原生 Liquid Glass · 60FPS 极速响应',
            desc: '苹果高保真拟物高斯质感，零冗余框架依赖，移动端与桌面端自适应双模交互'
        },
        {
            title: '🦀 桌面后端层',
            sub: 'Rust 核心 · Tauri v2 · 极低内存',
            desc: '系统级 Windows JobObject 进程树沙箱托管，超轻量待机内存恒定 < 15MB'
        },
        {
            title: '⚡ 局域网服务层',
            sub: 'Node.js · Express · WebSocket 双工',
            desc: '本地端口冲突自愈探测，断电防护原子置换写盘，零配置 mDNS 局域网广播'
        },
        {
            title: '🌐 多端互联层',
            sub: '千兆直传 · AirDrop 剪贴板 · 硬件遥控',
            desc: '大文件 Web Worker 异步分片与采样哈希秒传，跨端屏幕流式串流与远程控制'
        }
    ];

    const FEATURE_MATRIX = [
        {
            name: '局域网千兆极速直传',
            badge: '极速传输',
            badgeType: 'verified',
            icon: 'zap',
            desc: '内网千兆跑满零限速，Web Worker 异步哈希，断点续传与文件夹打包秒下'
        },
        {
            name: '多端免装扫码即连',
            badge: '免客户端',
            badgeType: 'free',
            icon: 'devices',
            desc: '手机/平板相机或微信扫一扫直连，支持 iOS / Android / Mac / Linux / Windows'
        },
        {
            name: 'AirDrop 级双向剪贴板',
            badge: '无缝同步',
            badgeType: 'verified',
            icon: 'clipboard',
            desc: '文字毫秒级推送，手机端图片直接粘贴同步至电脑系统剪贴板，支持双向互通'
        },
        {
            name: '院线级影音剧场',
            badge: '流式点播',
            badgeType: 'verified',
            icon: 'playCircle',
            desc: '视频音轨边下边播，智能剧名季集刮削，时间分桶缩略图预览与多轨字幕'
        },
        {
            name: '跨设备桌面与硬件遥控',
            badge: '系统控制',
            badgeType: 'ai',
            icon: 'sliders',
            desc: '低延迟实时屏幕画面串流，高精度触控板/键鼠手势映射与双重防误触电源管理'
        },
        {
            name: '实时协作涂鸦与群聊',
            badge: '即时协同',
            badgeType: 'free',
            icon: 'chat',
            desc: 'iMessage 级平滑气泡聊天，随手涂鸦白板跨端实时协同绘制，文件一键插入'
        },
        {
            name: 'Web 终端与进程监控',
            badge: '运维工具',
            badgeType: 'offline',
            icon: 'terminal',
            desc: '免配环境变量直接网页执行 Shell 命令，系统 CPU / 内存 / 磁盘动态实时监控'
        },
        {
            name: '局域网安全与防断电写盘',
            badge: '安全防线',
            badgeType: 'offline',
            icon: 'shield',
            desc: '可选 PIN 口令认证与 IP 白名单隔离，全盘/互传模式隔离，防突发断电原子写盘'
        }
    ];

    /* ---------- 更新下载轮询管理 ---------- */
    let isChecking = false;
    let progressTimer = null;

    function formatReleaseNotes(notes) {
        if (!notes) return '<div style="color:var(--apple-text-secondary); font-size:12px; line-height:1.5;">包含最新性能优化与问题修复，建议立即升级以获得最佳体验。</div>';
        const lines = String(notes).split('\n').map(l => l.trim()).filter(Boolean);
        let html = '';
        lines.forEach(line => {
            const numMatch = line.match(/^(\d+)[\.、\s](.+)$/);
            if (numMatch) {
                html += `
                    <div class="update-log-item">
                        <span class="update-log-num">${escapeHtml(numMatch[1])}</span>
                        <span style="font-size:12px; color:var(--apple-text-main); flex:1;">${escapeHtml(numMatch[2])}</span>
                    </div>
                `;
            } else {
                html += `
                    <div class="update-log-item">
                        <span style="color:var(--apple-system-blue); font-size:13px; line-height:1; margin-top:3px; flex-shrink:0;">•</span>
                        <span style="font-size:12px; color:var(--apple-text-main); flex:1;">${escapeHtml(line)}</span>
                    </div>
                `;
            }
        });
        return html;
    }

    /* ---------- AboutPanelComponent ---------- */
    const AboutPanelComponent = {
        appInfo: {
            name: '猫步互联 Pro',
            version: '2.3.4',
            author: '猫步可爱 (maobukeai)',
            releaseDate: '2026-09-13',
            releaseNotes: '1. 新增关于页面与技术架构全景展示；\n2. 软件内免限流 CDN 自动检查更新与静默升级；\n3. 新增独立更新模态提醒弹窗与作者互动支持。',
            repoUrl: 'https://github.com/maobukeai/lan-interconnect',
            releasesUrl: 'https://github.com/maobukeai/lan-interconnect/releases'
        },
        updateResult: null,

        init: function (containerId) {
            const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
            if (!el) return;

            // 优先异步拉取最新系统版本信息
            if (IPC && typeof IPC.getAppInfo === 'function') {
                IPC.getAppInfo().then(info => {
                    if (info && info.version) {
                        this.appInfo = Object.assign({}, this.appInfo, info);
                        this.render(el);
                    }
                }).catch(() => {});
            }

            this.render(el);
        },

        render: function (container) {
            const info = this.appInfo;
            const isAutoCheck = localStorage.getItem('landisk_auto_check_update') !== 'false';
            const isAutoSilent = localStorage.getItem('landisk_auto_silent_update') === 'true';
            const isCapacitorAndroid = typeof window !== 'undefined' && (
                !!window.Capacitor || (window.location && window.location.href && window.location.href.includes('capacitor://'))
            );
            const isDesktopApp = !isCapacitorAndroid && typeof window !== 'undefined' && (
                !!window.isTauri ||
                !!window.__TAURI__ ||
                !!window.__TAURI_INTERNALS__ ||
                (global.LanDiskIPC && global.LanDiskIPC.available) ||
                (window.location && (window.location.protocol === 'tauri:' || (window.location.protocol === 'file:' && !window.Capacitor)))
            );

            container.innerHTML = `
                <div class="about-view-root" style="display:flex; flex-direction:column; gap:16px; user-select:text;">
                    <!-- 1. 顶部 Header 卡片 -->
                    <div class="about-hero-card" style="padding:20px 22px; background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:18px; box-shadow:var(--shadow-2);">
                        <div class="row-between" style="gap:16px; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:16px;">
                                <img src="icon.png" alt="logo" style="width:64px; height:64px; border-radius:16px; object-fit:contain; box-shadow:0 6px 18px rgba(0,0,0,0.18); flex-shrink:0; pointer-events:none;">
                                <div>
                                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                        <h1 style="margin:0; font-size:18px; font-weight:700; letter-spacing:-0.02em; color:var(--apple-text-main);">${escapeHtml(info.name)}</h1>
                                        <span class="apple-badge apple-badge-info" style="font-size:11.5px; font-family:ui-monospace,Consolas,monospace; font-weight:700; padding:2px 8px;">v${escapeHtml(info.version)}</span>
                                        ${isCapacitorAndroid ? `
                                            <span class="apple-badge apple-badge-success" style="font-size:11px;"><span class="apple-badge-dot"></span>Android 原生版</span>
                                        ` : isDesktopApp ? `
                                            <span class="apple-badge apple-badge-success" style="font-size:11px;"><span class="apple-badge-dot"></span>Pro 桌面专业版</span>
                                        ` : `
                                            <span class="apple-badge apple-badge-info" style="font-size:11px;"><span class="apple-badge-dot"></span>Web 极速互联版</span>
                                        `}
                                    </div>
                                    <div style="margin-top:5px; font-size:12.5px; color:var(--apple-text-secondary); display:flex; align-items:center; gap:8px;">
                                        <span>开发团队 / 创作者：</span>
                                        <b style="color:var(--apple-text-main); font-weight:600;">${escapeHtml(info.author)}</b>
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-contact" style="padding:6px 13px; font-weight:600; font-size:12px; display:inline-flex; align-items:center; gap:6px;">
                                    <span style="color:#30d158;">${I('chat', 14)}</span>
                                    <span>联系作者</span>
                                </button>
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-sponsor" style="padding:6px 13px; font-weight:600; font-size:12px; display:inline-flex; align-items:center; gap:6px;">
                                    <span style="color:#ff375f;">${I('heart', 14)}</span>
                                    <span>赞助支持</span>
                                </button>
                            </div>
                        </div>

                        <!-- 2. 四列架构展示 -->
                        <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--hairline);">
                            <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--apple-text-secondary); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                                <span style="color:var(--apple-system-blue);">${I('cpu', 14)}</span>
                                <span>软件技术架构矩阵</span>
                            </div>
                            <div class="bento-grid" style="gap:10px; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));">
                                ${ARCHITECTURE_LAYERS.map(layer => `
                                    <div style="padding:12px 14px; background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:12px;">
                                        <div style="font-size:12.5px; font-weight:700; color:var(--apple-text-main);">${escapeHtml(layer.title)}</div>
                                        <div style="font-size:11px; font-weight:600; color:var(--apple-system-blue); margin:3px 0 4px;">${escapeHtml(layer.sub)}</div>
                                        <div style="font-size:11px; color:var(--apple-text-subtle); line-height:1.5;">${escapeHtml(layer.desc)}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- 3. 三列核心应用服务卡片 -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
                        ${isDesktopApp ? `
                        <!-- 卡片 1: 桌面端 自动更新与升级 -->
                        <div style="padding:16px 18px; background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:16px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
                            <div>
                                <div style="display:flex; align-items:center; justify-content:space-between;">
                                    <div style="font-size:13.5px; font-weight:700; color:var(--apple-text-main); display:flex; align-items:center; gap:6px;">
                                        <span style="color:var(--apple-system-blue);">${I('refresh', 16)}</span>
                                        <span>应用更新检查</span>
                                    </div>
                                    <span class="apple-badge apple-badge-info apple-badge-sm" style="font-size:10.5px;">桌面客户端</span>
                                </div>
                                <div style="font-size:11.5px; color:var(--apple-text-subtle); margin-top:4px; line-height:1.4;">
                                    全网免限流 CDN 多源探针，支持软件内自动下载与静默无感安装。
                                </div>
                            </div>

                            <div style="display:flex; flex-direction:column; gap:10px;">
                                <button class="apple-btn apple-btn-primary apple-btn-sm" id="about-btn-check-update" style="width:100%; justify-content:center; padding:7px 0; font-weight:600; font-size:12.5px;">
                                    <span id="about-check-spinner" style="display:none; animation:apple-spin 1s linear infinite; margin-right:4px;">${I('refresh', 13)}</span>
                                    <span id="about-check-text">检查更新</span>
                                </button>

                                <div style="padding-top:8px; border-top:1px solid var(--hairline); display:flex; flex-direction:column; gap:8px;">
                                    <div class="row-between">
                                        <div>
                                            <div style="font-size:11.5px; font-weight:600; color:var(--apple-text-main);">启动时自动检查更新</div>
                                            <div style="font-size:10.5px; color:var(--apple-text-subtle);">启动后后台静默探测新版本</div>
                                        </div>
                                        <label class="apple-switch"><input type="checkbox" id="about-toggle-autocheck" ${isAutoCheck ? 'checked' : ''}><span class="apple-slider"></span></label>
                                    </div>
                                    <div class="row-between">
                                        <div>
                                            <div style="font-size:11.5px; font-weight:600; color:var(--apple-text-main);">全自动静默无感升级</div>
                                            <div style="font-size:10.5px; color:var(--apple-text-subtle);">免点击下一步，后台自动完成覆盖并重启</div>
                                        </div>
                                        <label class="apple-switch"><input type="checkbox" id="about-toggle-autosilent" ${isAutoSilent ? 'checked' : ''}><span class="apple-slider"></span></label>
                                    </div>
                                </div>

                                <!-- 更新检查结果展示区 -->
                                <div id="about-update-result-area"></div>
                            </div>
                        </div>
                        ` : isCapacitorAndroid ? `
                        <!-- 卡片 1: Android 原生客户端 更新与特性 -->
                        <div style="padding:16px 18px; background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:16px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
                            <div>
                                <div style="display:flex; align-items:center; justify-content:space-between;">
                                    <div style="font-size:13.5px; font-weight:700; color:var(--apple-text-main); display:flex; align-items:center; gap:6px;">
                                        <span style="color:var(--apple-system-green);">${I('cpu', 16)}</span>
                                        <span>安卓应用更新</span>
                                    </div>
                                    <span class="apple-badge apple-badge-success apple-badge-sm" style="font-size:10.5px;">Android 原生端</span>
                                </div>
                                <div style="font-size:11.5px; color:var(--apple-text-subtle); margin-top:4px; line-height:1.4;">
                                    Capacitor 原生系统级深度整合，支持千兆极速互传与触控手势遥控。
                                </div>
                            </div>

                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <button class="apple-btn apple-btn-primary apple-btn-sm" id="about-btn-download-android" style="width:100%; justify-content:center; padding:7px 0; font-weight:600; font-size:12.5px; background:linear-gradient(135deg, #34c759, #30b0c7); border-color:transparent;">
                                    ${I('download', 13)} 获取最新 Android 安装包 (APK)
                                </button>
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-view-notes" style="width:100%; justify-content:center; padding:6px 0; font-size:11.5px;">
                                    ${I('info', 12)} 查看最新版本特性说明 (v${escapeHtml(info.version)})
                                </button>
                            </div>
                        </div>
                        ` : `
                        <!-- 卡片 1: 网页端/移动端 客户端与 App 安装 -->
                        <div style="padding:16px 18px; background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:16px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
                            <div>
                                <div style="display:flex; align-items:center; justify-content:space-between;">
                                    <div style="font-size:13.5px; font-weight:700; color:var(--apple-text-main); display:flex; align-items:center; gap:6px;">
                                        <span style="color:var(--apple-system-blue);">${I('download', 16)}</span>
                                        <span>客户端与 App 安装</span>
                                    </div>
                                    <span class="apple-badge apple-badge-success apple-badge-sm" style="font-size:10.5px;">Web 免安装端</span>
                                </div>
                                <div style="font-size:11.5px; color:var(--apple-text-subtle); margin-top:4px; line-height:1.4;">
                                    网页端随电脑主机服务实时同频。您可下载 Android / Windows 客户端或添加至手机主屏。
                                </div>
                            </div>

                            <div style="display:flex; flex-direction:column; gap:7px;">
                                <button class="apple-btn apple-btn-primary apple-btn-sm" id="about-btn-download-android" style="width:100%; justify-content:center; padding:7px 0; font-weight:600; font-size:12px; background:linear-gradient(135deg, #34c759, #30b0c7); border-color:transparent;">
                                    ${I('devices', 13)} 下载 Android 安卓客户端 (APK)
                                </button>
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-download-desktop" style="width:100%; justify-content:center; padding:6px 0; font-size:12px;">
                                    ${I('external', 13)} 下载 Windows 桌面客户端 (.exe)
                                </button>
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-install-pwa" style="width:100%; justify-content:center; padding:6px 0; font-size:12px;">
                                    ${I('sparkles', 13)} 添加到手机主屏幕 (PWA 免装)
                                </button>
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-view-notes" style="width:100%; justify-content:center; padding:5px 0; font-size:11.5px; color:var(--apple-text-secondary);">
                                    ${I('info', 12)} 查看最新版本特性说明 (v${escapeHtml(info.version)})
                                </button>
                            </div>
                        </div>
                        `}

                        <!-- 卡片 2: 局域网服务与运行状态 -->
                        <div style="padding:16px 18px; background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:16px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
                            <div>
                                <div style="font-size:13.5px; font-weight:700; color:var(--apple-text-main); display:flex; align-items:center; gap:6px;">
                                    <span style="color:var(--apple-system-green);">${I('wifi', 16)}</span>
                                    <span>局域网服务状态</span>
                                </div>
                                <div style="font-size:11.5px; color:var(--apple-text-subtle); margin-top:4px; line-height:1.4;">
                                    实时共享中枢，管理全盘/互传模式与在线互联设备。
                                </div>
                            </div>

                            <div style="font-size:12px; color:var(--apple-text-secondary); display:flex; flex-direction:column; gap:6px; background:var(--mat-ultrathin); padding:10px 12px; border-radius:10px;">
                                <div class="row-between">
                                    <span>服务运行状态：</span>
                                    <b style="color:${IPC && IPC.state && IPC.state.running ? '#30d158' : '#8e8e93'};">${IPC && IPC.state && IPC.state.running ? '● 正在运行' : '○ 已停止'}</b>
                                </div>
                                <div class="row-between">
                                    <span>访问网络地址：</span>
                                    <span class="mono" style="font-size:11px;">${IPC && IPC.state && IPC.state.url ? escapeHtml(IPC.state.url) : 'http://127.0.0.1:3000'}</span>
                                </div>
                                <div class="row-between">
                                    <span>局域网广播服务：</span>
                                    <span class="apple-badge apple-badge-success apple-badge-sm">mDNS 5353 就绪</span>
                                </div>
                            </div>

                            <div class="row" style="gap:8px;">
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-goto-security" style="flex:1; justify-content:center; padding:6px 0; font-size:12px;">
                                    ${I('settings', 13)} 配置服务
                                </button>
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-view-qr" style="flex:1; justify-content:center; padding:6px 0; font-size:12px;">
                                    ${I('qr', 13)} 扫码连接
                                </button>
                            </div>
                        </div>

                        <!-- 卡片 3: 开源项目主页与贡献 -->
                        <div style="padding:16px 18px; background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:16px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
                            <div>
                                <div style="font-size:13.5px; font-weight:700; color:var(--apple-text-main); display:flex; align-items:center; gap:6px;">
                                    <span style="color:var(--apple-system-indigo);">${I('globe', 16)}</span>
                                    <span>开源项目主页</span>
                                </div>
                                <div style="font-size:11.5px; color:var(--apple-text-subtle); margin-top:4px; line-height:1.4;">
                                    访问 GitHub 官方仓库获取最新发布、提交反馈与共建代码。
                                </div>
                            </div>

                            <div style="font-size:12px; color:var(--apple-text-secondary); line-height:1.6;">
                                <div>• 采用 <b>MIT License</b> 开放源代码协议</div>
                                <div>• 物理自动化测试套件 100% 验证覆盖</div>
                                <div>• 纯原生局域网环境，零云端隐私上传</div>
                            </div>

                            <div class="row" style="gap:8px;">
                                <button class="apple-btn apple-btn-primary apple-btn-sm" id="about-btn-github" style="flex:1; justify-content:center; padding:6px 0; font-size:12px;">
                                    ${I('external', 13)} GitHub 仓库
                                </button>
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-releases" style="flex:1; justify-content:center; padding:6px 0; font-size:12px;">
                                    ${I('external', 13)} Release 发布页
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 4. 全场景能力与功能矩阵 -->
                    <div style="padding:18px 20px; background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:18px;">
                        <div class="row-between" style="margin-bottom:14px;">
                            <div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--apple-text-main); display:flex; align-items:center; gap:6px;">
                                <span style="color:var(--apple-system-blue);">${I('sparkles', 15)}</span>
                                <span>全场景能力与功能特性矩阵</span>
                            </div>
                            <span class="subtle" style="font-size:11.5px;">共支持 ${FEATURE_MATRIX.length} 组系统级互联核心组件</span>
                        </div>

                        <div class="bento-grid" style="gap:10px; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));">
                            ${FEATURE_MATRIX.map(feat => `
                                <div style="padding:12px 14px; background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:12px; display:flex; flex-direction:column; justify-content:space-between; gap:6px;">
                                    <div>
                                        <div class="row-between" style="margin-bottom:4px;">
                                            <div style="font-size:12.5px; font-weight:700; color:var(--apple-text-main); display:flex; align-items:center; gap:6px;">
                                                <span style="color:var(--apple-system-blue);">${I(feat.icon, 14)}</span>
                                                <span>${escapeHtml(feat.name)}</span>
                                            </div>
                                            <span class="apple-badge ${feat.badgeType === 'verified' ? 'apple-badge-success' : feat.badgeType === 'ai' ? 'apple-badge-info' : ''}" style="font-size:10px;">${escapeHtml(feat.badge)}</span>
                                        </div>
                                        <div style="font-size:11px; color:var(--apple-text-subtle); line-height:1.5;">${escapeHtml(feat.desc)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- 5. 底部开源协议与署名 -->
                    <div style="text-align:center; padding:12px 0; color:var(--apple-text-subtle); font-size:11.5px;">
                        <div>猫步互联 Pro (LanDisk Pro) · 基于 MIT 协议开源发布</div>
                        <div style="margin-top:2px; opacity:0.75;">Copyright © 2026 猫步可爱 (maobukeai). All rights reserved.</div>
                    </div>
                </div>
            `;

            this.bindEvents(container);
        },

        bindEvents: function (container) {
            // 联系作者
            const btnContact = container.querySelector('#about-btn-contact');
            if (btnContact) {
                btnContact.addEventListener('click', () => {
                    this.showQrModal('contact');
                });
            }

            // 赞助支持
            const btnSponsor = container.querySelector('#about-btn-sponsor');
            if (btnSponsor) {
                btnSponsor.addEventListener('click', () => {
                    this.showQrModal('sponsor');
                });
            }

            // 开关切换
            const toggleAutoCheck = container.querySelector('#about-toggle-autocheck');
            if (toggleAutoCheck) {
                toggleAutoCheck.addEventListener('change', (e) => {
                    localStorage.setItem('landisk_auto_check_update', e.target.checked ? 'true' : 'false');
                    if (UI && UI.toast) UI.toast(e.target.checked ? '已开启启动时自动检查更新' : '已关闭自动检查更新', 'info');
                });
            }

            const toggleAutoSilent = container.querySelector('#about-toggle-autosilent');
            if (toggleAutoSilent) {
                toggleAutoSilent.addEventListener('change', (e) => {
                    localStorage.setItem('landisk_auto_silent_update', e.target.checked ? 'true' : 'false');
                    if (UI && UI.toast) UI.toast(e.target.checked ? '已开启全自动静默升级' : '已关闭静默升级', 'info');
                });
            }

            // 检查更新
            const btnCheck = container.querySelector('#about-btn-check-update');
            if (btnCheck) {
                btnCheck.addEventListener('click', () => {
                    this.handleCheckUpdate(container);
                });
            }

            // 快捷跳转
            const btnGotoSec = container.querySelector('#about-btn-goto-security');
            if (btnGotoSec) {
                btnGotoSec.addEventListener('click', () => {
                    const secBtn = document.querySelector('#settings-nav [data-panel="security"]');
                    if (secBtn) secBtn.click();
                });
            }

            const btnViewQr = container.querySelector('#about-btn-view-qr');
            if (btnViewQr) {
                btnViewQr.addEventListener('click', () => {
                    if (global.LanDiskShowQrModal) global.LanDiskShowQrModal();
                    else if (document.getElementById('btn-show-qr')) document.getElementById('btn-show-qr').click();
                });
            }

            // Android APK 下载直达
            const btnDownloadAndroid = container.querySelector('#about-btn-download-android');
            if (btnDownloadAndroid) {
                btnDownloadAndroid.addEventListener('click', () => {
                    const assets = (this.updateResult && this.updateResult.latest && this.updateResult.latest.assets)
                        || (this.appInfo && this.appInfo.assets) || [];
                    const apkAsset = assets.find(a => (a.name || '').toLowerCase().endsWith('.apk'));
                    const apkUrl = (apkAsset && apkAsset.url) || 'https://github.com/maobukeai/lan-interconnect/releases';
                    if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(apkUrl);
                    else window.open(apkUrl, '_blank');
                });
            }

            // 网页端专属操作按钮交互
            const btnDownloadDesktop = container.querySelector('#about-btn-download-desktop');
            if (btnDownloadDesktop) {
                btnDownloadDesktop.addEventListener('click', () => {
                    const downloadUrl = (this.updateResult && this.updateResult.latest && this.updateResult.latest.download_url)
                        || this.appInfo.releasesUrl;
                    if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(downloadUrl);
                    else window.open(downloadUrl, '_blank');
                });
            }

            const btnInstallPwa = container.querySelector('#about-btn-install-pwa');
            if (btnInstallPwa) {
                btnInstallPwa.addEventListener('click', () => {
                    this.showPwaGuideModal();
                });
            }

            const btnViewNotes = container.querySelector('#about-btn-view-notes');
            if (btnViewNotes) {
                btnViewNotes.addEventListener('click', () => {
                    this.showReleaseNotesModal();
                });
            }

            // 外链
            const btnGithub = container.querySelector('#about-btn-github');
            if (btnGithub) {
                btnGithub.addEventListener('click', () => {
                    if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(this.appInfo.repoUrl);
                    else window.open(this.appInfo.repoUrl, '_blank');
                });
            }

            const btnReleases = container.querySelector('#about-btn-releases');
            if (btnReleases) {
                btnReleases.addEventListener('click', () => {
                    if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(this.appInfo.releasesUrl);
                    else window.open(this.appInfo.releasesUrl, '_blank');
                });
            }
        },

        showPwaGuideModal: function () {
            if (!UI || !UI.openModal) {
                alert('添加到主屏幕指南：\n• iOS: 点击 Safari 底部分享按钮 -> 添加到主屏幕\n• Android: 点击浏览器菜单 -> 添加到主屏幕');
                return;
            }

            const modal = UI.openModal(`
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <div style="display:flex; align-items:flex-start; gap:14px;">
                        <div style="width:48px; height:48px; border-radius:14px; background:linear-gradient(135deg, rgba(48,209,88,0.2), rgba(0,122,255,0.2)); border:1px solid rgba(48,209,88,0.3); display:grid; place-items:center; font-size:24px; flex-shrink:0;">
                            📲
                        </div>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--apple-text-main);">免安装添加至手机主屏幕</h3>
                                <span class="apple-badge apple-badge-success" style="font-size:10.5px;">PWA 极速体验</span>
                            </div>
                            <div style="font-size:12px; color:var(--apple-text-secondary); margin-top:3px; line-height:1.4;">
                                无需从应用商店下载几十兆安装包，像原生 App 一样秒开并全屏运行。
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <!-- iOS Safari 步骤 -->
                        <div style="background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:12px; padding:12px 14px;">
                            <div style="font-size:12.5px; font-weight:700; color:var(--apple-text-main); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                                <span style="color:var(--apple-system-blue);">${I('devices', 14)}</span>
                                <span>苹果 iPhone / iPad (Safari 浏览器)</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:6px; font-size:11.5px; color:var(--apple-text-secondary); line-height:1.5;">
                                <div style="display:flex; align-items:flex-start; gap:6px;">
                                    <span class="apple-badge apple-badge-info apple-badge-sm" style="flex-shrink:0; padding:1px 5px;">步骤 1</span>
                                    <span>在手机 Safari 底部工具栏点击 <b>【分享】</b> 按钮（带向上箭头的方框）。</span>
                                </div>
                                <div style="display:flex; align-items:flex-start; gap:6px;">
                                    <span class="apple-badge apple-badge-info apple-badge-sm" style="flex-shrink:0; padding:1px 5px;">步骤 2</span>
                                    <span>在弹出菜单中向下滑动，找到并点击 <b>【添加到主屏幕】</b>。</span>
                                </div>
                                <div style="display:flex; align-items:flex-start; gap:6px;">
                                    <span class="apple-badge apple-badge-info apple-badge-sm" style="flex-shrink:0; padding:1px 5px;">步骤 3</span>
                                    <span>点击右上角 <b>【添加】</b>，即可在手机桌面生成专属图标，全屏秒开！</span>
                                </div>
                            </div>
                        </div>

                        <!-- Android 步骤 -->
                        <div style="background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:12px; padding:12px 14px;">
                            <div style="font-size:12.5px; font-weight:700; color:var(--apple-text-main); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                                <span style="color:var(--apple-system-green);">${I('cpu', 14)}</span>
                                <span>安卓 Android (Chrome / Edge / 微信)</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:6px; font-size:11.5px; color:var(--apple-text-secondary); line-height:1.5;">
                                <div style="display:flex; align-items:flex-start; gap:6px;">
                                    <span class="apple-badge apple-badge-success apple-badge-sm" style="flex-shrink:0; padding:1px 5px;">步骤 1</span>
                                    <span>点击浏览器右上角 <b>【⋮ 更多菜单】</b> 或底部工具栏。</span>
                                </div>
                                <div style="display:flex; align-items:flex-start; gap:6px;">
                                    <span class="apple-badge apple-badge-success apple-badge-sm" style="flex-shrink:0; padding:1px 5px;">步骤 2</span>
                                    <span>点击 <b>【添加到主屏幕】</b> 或 <b>【安装应用】</b>。</span>
                                </div>
                                <div style="display:flex; align-items:flex-start; gap:6px;">
                                    <span class="apple-badge apple-badge-success apple-badge-sm" style="flex-shrink:0; padding:1px 5px;">步骤 3</span>
                                    <span>确认名称并添加，后续无需重复扫描或手动输入 IP 地址。</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="background:rgba(48,209,88,0.08); border:1px solid rgba(48,209,88,0.2); border-radius:10px; padding:10px 12px; font-size:11px; color:var(--apple-system-green); line-height:1.5;">
                        💡 <b>提示：</b> 添加到主屏幕后，网页端将自动随电脑端服务保持最新状态，完全无需手动检查升级！
                    </div>

                    <div class="modal-actions" style="margin-top:4px;">
                        <button class="apple-btn apple-btn-primary" data-act="close" style="width:100%;">我知道了</button>
                    </div>
                </div>
            `, { width: 420 });

            modal.el.querySelector('[data-act="close"]').addEventListener('click', () => modal.close());
        },

        showReleaseNotesModal: function () {
            const info = this.appInfo;
            if (!UI || !UI.openModal) {
                alert(`${info.name} v${info.version}\n\n更新说明:\n${info.releaseNotes}`);
                return;
            }

            const modal = UI.openModal(`
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <div style="display:flex; align-items:flex-start; gap:14px;">
                        <div style="width:48px; height:48px; border-radius:14px; background:linear-gradient(135deg, rgba(0,122,255,0.2), rgba(88,86,214,0.2)); border:1px solid rgba(0,122,255,0.3); display:grid; place-items:center; font-size:24px; flex-shrink:0;">
                            📋
                        </div>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--apple-text-main);">版本更新特性与日志</h3>
                                <span class="apple-badge apple-badge-info" style="font-size:11px; font-weight:700; font-family:ui-monospace,Consolas,monospace;">v${escapeHtml(info.version)}</span>
                            </div>
                            <div style="font-size:12px; color:var(--apple-text-secondary); margin-top:3px;">
                                发布日期: ${escapeHtml(info.releaseDate || '2026-09-13')} · 当前运行稳定版本
                            </div>
                        </div>
                    </div>

                    <div style="background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:12px; padding:12px 14px; max-height:220px; overflow-y:auto;">
                        <div style="font-size:12px; font-weight:700; color:var(--apple-text-secondary); margin-bottom:8px; display:flex; align-items:center; gap:5px;">
                            ${I('sparkles', 13)} 本次版本核心更新亮点
                        </div>
                        <div style="font-size:12px; color:var(--apple-text-main); line-height:1.7; white-space:pre-line;">
                            ${escapeHtml(info.releaseNotes)}
                        </div>
                    </div>

                    <div class="row" style="gap:8px;">
                        <button class="apple-btn apple-btn-glass" id="modal-notes-open-rel" style="flex:1;">
                            ${I('external', 13)} 查看完整 Releases
                        </button>
                        <button class="apple-btn apple-btn-primary" data-act="close" style="flex:1;">
                            关闭
                        </button>
                    </div>
                </div>
            `, { width: 440 });

            modal.el.querySelector('[data-act="close"]').addEventListener('click', () => modal.close());
            const relBtn = modal.el.querySelector('#modal-notes-open-rel');
            if (relBtn) {
                relBtn.addEventListener('click', () => {
                    if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(info.releasesUrl);
                    else window.open(info.releasesUrl, '_blank');
                });
            }
        },

        showQrModal: function (type) {
            const isContact = type === 'contact';
            const title = isContact ? '联系作者 · 微信二维码' : '赞助支持 · 赞赏码';
            const imgPath = isContact ? 'shared/assets/contact_qr.webp' : 'shared/assets/sponsor_qr.webp';
            const tip = isContact
                ? '微信扫一扫添加好友，交流反馈与需求建议'
                : '感谢您对猫步互联开源项目的大力支持与鼓励！';

            if (!UI || !UI.openModal) {
                alert(title + ':\n微信号: maobukeai');
                return;
            }

            const modal = UI.openModal(`
                <div style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:10px 4px;">
                    <div class="modal-title" style="font-size:16px; font-weight:700; display:flex; align-items:center; gap:6px;">
                        <span style="color:${isContact ? '#30d158' : '#ff375f'}">${I(isContact ? 'chat' : 'heart', 18)}</span>
                        <span>${escapeHtml(title)}</span>
                    </div>

                    <div style="margin:16px 0; padding:12px; background:#ffffff; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.14); display:flex; align-items:center; justify-content:center;">
                        <img src="${imgPath}" alt="QR" style="width:220px; height:220px; object-fit:contain; border-radius:10px; display:block;">
                    </div>

                    <div style="font-size:13.5px; font-weight:700; color:var(--apple-text-main);">猫步可爱 (maobukeai)</div>
                    <div style="font-size:11.5px; color:var(--apple-text-secondary); margin-top:4px; max-width:280px; line-height:1.5;">${escapeHtml(tip)}</div>

                    <div class="modal-actions" style="width:100%; margin-top:20px;">
                        <button class="apple-btn apple-btn-glass" data-act="copy-wx" style="flex:1;">${I('copy', 14)} 复制微信号</button>
                        <button class="apple-btn apple-btn-primary" data-act="close" style="flex:1;">关闭</button>
                    </div>
                </div>
            `, { width: 380 });

            modal.el.querySelector('[data-act="close"]').addEventListener('click', () => modal.close());
            modal.el.querySelector('[data-act="copy-wx"]').addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText('maobukeai');
                    if (UI.toast) UI.toast('微信号 maobukeai 已复制到剪贴板', 'success');
                } catch (e) {}
            });
        },

        handleCheckUpdate: async function (container) {
            if (isChecking) return;
            isChecking = true;

            const spinner = container.querySelector('#about-check-spinner');
            const btnText = container.querySelector('#about-check-text');
            const btnCheck = container.querySelector('#about-btn-check-update');

            if (spinner) spinner.style.display = 'inline-block';
            if (btnText) btnText.textContent = '正在检查更新…';
            if (btnCheck) btnCheck.disabled = true;

            try {
                let result = null;
                if (IPC && typeof IPC.checkAppUpdate === 'function') {
                    result = await IPC.checkAppUpdate();
                } else {
                    const base = getApiBase();
                    try {
                        result = await safeFetchJson(base + '/api/system/check-update');
                    } catch (netErr) {
                        result = {
                            latest: {
                                version: this.appInfo.version,
                                release_date: this.appInfo.releaseDate || '',
                                download_url: this.appInfo.releasesUrl,
                                release_notes: '当前已是最新稳定版本 (v' + this.appInfo.version + ')。'
                            },
                            has_update: false,
                            current_version: this.appInfo.version,
                            error: null
                        };
                    }
                }

                this.updateResult = result;
                this.renderUpdateResult(container, result);

                // 若发现新版本，同时弹出独立 UpdateModal
                if (result && result.has_update && result.latest) {
                    UpdateModalComponent.show(result.latest);
                }
            } catch (err) {
                this.renderUpdateResult(container, {
                    has_update: false,
                    current_version: this.appInfo.version,
                    latest: {
                        version: this.appInfo.version,
                        download_url: this.appInfo.releasesUrl,
                        release_notes: '当前已是最新稳定版本。'
                    },
                    error: '网络探针暂时无法连接版本更新服务器，您当前运行的已是 v' + this.appInfo.version + ' 稳定版。可前往 Releases 查阅最新动态。'
                });
            } finally {
                isChecking = false;
                if (spinner) spinner.style.display = 'none';
                if (btnText) btnText.textContent = '检查更新';
                if (btnCheck) btnCheck.disabled = false;
            }
        },

        renderUpdateResult: function (container, result) {
            const area = container.querySelector('#about-update-result-area');
            if (!area) return;

            if (!result) {
                area.innerHTML = '';
                return;
            }

            if (result.error) {
                area.innerHTML = `
                    <div style="padding:10px 12px; background:rgba(255,149,0,0.1); border:1px solid rgba(255,149,0,0.25); border-radius:10px; font-size:11.5px; color:var(--apple-system-orange); display:flex; flex-direction:column; gap:6px;">
                        <div style="font-weight:700; display:flex; align-items:center; gap:5px;">${I('info', 13)} 检查提示</div>
                        <div style="line-height:1.4;">${escapeHtml(result.error)}</div>
                        <button class="apple-btn apple-btn-glass apple-btn-xs" id="about-res-open-rel" style="align-self:flex-start; margin-top:2px;">${I('external', 12)} 前往 Releases 发布页</button>
                    </div>
                `;
                const relBtn = area.querySelector('#about-res-open-rel');
                if (relBtn) relBtn.addEventListener('click', () => {
                    if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(this.appInfo.releasesUrl);
                    else window.open(this.appInfo.releasesUrl, '_blank');
                });
                return;
            }

            if (result.has_update && result.latest) {
                const l = result.latest;
                area.innerHTML = `
                    <div style="padding:12px; background:rgba(0,122,255,0.08); border:1px solid rgba(0,122,255,0.25); border-radius:12px; font-size:11.5px; display:flex; flex-direction:column; gap:8px;">
                        <div class="row-between">
                            <div style="font-weight:700; color:var(--apple-system-blue); display:flex; align-items:center; gap:5px;">
                                ${I('sparkles', 14)} 发现新版本可用
                            </div>
                            <span class="apple-badge apple-badge-info apple-badge-sm">v${escapeHtml(l.version)}</span>
                        </div>
                        ${l.release_date ? `<div class="subtle" style="font-size:10.5px;">发布日期：${escapeHtml(l.release_date.slice(0, 10))}</div>` : ''}
                        ${l.release_notes ? `<div style="background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:10px; padding:10px 12px; max-height:120px; overflow-y:auto; scrollbar-width:thin;">${formatReleaseNotes(l.release_notes)}</div>` : ''}

                        <!-- 进度条挂载容器 -->
                        <div id="about-inline-progress-box" style="display:none;"></div>

                        <div class="row" style="gap:6px;">
                            <button class="apple-btn apple-btn-primary apple-btn-sm" id="about-btn-start-upgrade" style="flex:1; justify-content:center; padding:6px 0; font-size:12px; font-weight:700;">
                                ⚡ 软件内一键升级
                            </button>
                            <button class="apple-btn apple-btn-glass apple-btn-sm" id="about-btn-open-browser-rel" style="padding:6px 10px; font-size:12px;" title="在浏览器打开">
                                ${I('external', 13)}
                            </button>
                        </div>
                    </div>
                `;

                const btnUpgrade = area.querySelector('#about-btn-start-upgrade');
                if (btnUpgrade) {
                    btnUpgrade.addEventListener('click', () => {
                        this.startInAppUpgrade(area, l);
                    });
                }

                const btnBr = area.querySelector('#about-btn-open-browser-rel');
                if (btnBr) {
                    btnBr.addEventListener('click', () => {
                        const targetUrl = l.download_url || this.appInfo.releasesUrl;
                        if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(targetUrl);
                        else window.open(targetUrl, '_blank');
                    });
                }
                return;
            }

            // 已是最新版
            area.innerHTML = `
                <div style="padding:8px 12px; background:rgba(48,209,88,0.1); border:1px solid rgba(48,209,88,0.25); border-radius:10px; font-size:11.5px; color:var(--apple-system-green); display:flex; align-items:center; justify-content:space-between;">
                    <span style="display:flex; align-items:center; gap:5px; font-weight:600;">${I('check', 13)} 当前已是最新版本 (v${escapeHtml(result.current_version || this.appInfo.version)})</span>
                    <button class="apple-btn apple-btn-glass apple-btn-xs" id="about-btn-latest-rel">${I('external', 11)} Releases</button>
                </div>
            `;
            const relBtn = area.querySelector('#about-btn-latest-rel');
            if (relBtn) relBtn.addEventListener('click', () => {
                if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(this.appInfo.releasesUrl);
                else window.open(this.appInfo.releasesUrl, '_blank');
            });
        },

        startInAppUpgrade: async function (areaEl, latestInfo) {
            const isCapacitorAndroid = typeof window !== 'undefined' && (
                !!window.Capacitor || (window.location && window.location.href && window.location.href.includes('capacitor://'))
            );
            const assets = latestInfo.assets || [];
            if (isCapacitorAndroid) {
                const apkAsset = assets.find(a => (a.name || '').toLowerCase().endsWith('.apk')) || assets[0];
                const apkUrl = (apkAsset && apkAsset.url) || latestInfo.download_url;
                if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(apkUrl);
                else window.open(apkUrl, '_blank');
                if (UI && UI.toast) UI.toast('正在跳转下载最新 APK 安装包…', 'info');
                return;
            }

            const exeAsset = assets.find(a => (a.name || '').toLowerCase().endsWith('.exe')) || assets[0];
            const targetUrl = (exeAsset && exeAsset.url) || latestInfo.download_url;

            if (!targetUrl || !targetUrl.startsWith('http')) {
                if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(latestInfo.download_url);
                else window.open(latestInfo.download_url, '_blank');
                return;
            }

            const pBox = areaEl.querySelector('#about-inline-progress-box');
            const btnUpgrade = areaEl.querySelector('#about-btn-start-upgrade');
            if (btnUpgrade) {
                btnUpgrade.disabled = true;
                btnUpgrade.innerHTML = '正在准备下载…';
            }

            if (pBox) {
                pBox.style.display = 'block';
                pBox.innerHTML = `
                    <div style="background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:5px;">
                        <div class="row-between" style="font-size:11px;">
                            <span id="about-inline-stage" style="color:var(--apple-system-blue); font-weight:600;">正在下载新版本…</span>
                            <span id="about-inline-percent" class="mono" style="font-weight:700;">0%</span>
                        </div>
                        <div class="apple-progress-track" style="height:6px;">
                            <div class="apple-progress-fill" id="about-inline-bar" style="width:0%; background:linear-gradient(90deg, #007aff, #5856d6);"></div>
                        </div>
                        <div class="row-between subtle" style="font-size:10px;">
                            <span id="about-inline-bytes">0 B / 0 B</span>
                            <span id="about-inline-speed">0 B/s</span>
                        </div>
                    </div>
                `;
            }

            try {
                if (IPC && typeof IPC.downloadUpdate === 'function') {
                    await IPC.downloadUpdate(targetUrl);
                } else {
                    await fetch('/api/system/download-update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: targetUrl })
                    });
                }

                // 启动进度轮询
                if (progressTimer) clearInterval(progressTimer);
                progressTimer = setInterval(async () => {
                    let p = null;
                    try {
                        if (IPC && typeof IPC.getUpdateProgress === 'function') {
                            p = await IPC.getUpdateProgress();
                        } else {
                            const pr = await fetch('/api/system/update-progress');
                            if (pr.ok) p = await pr.json();
                        }
                    } catch (e) {}

                    if (!p) return;

                    const stageEl = pBox ? pBox.querySelector('#about-inline-stage') : null;
                    const pctEl = pBox ? pBox.querySelector('#about-inline-percent') : null;
                    const barEl = pBox ? pBox.querySelector('#about-inline-bar') : null;
                    const bytesEl = pBox ? pBox.querySelector('#about-inline-bytes') : null;
                    const speedEl = pBox ? pBox.querySelector('#about-inline-speed') : null;

                    if (pctEl) pctEl.textContent = (p.percentage || 0) + '%';
                    if (barEl) barEl.style.width = Math.min(100, Math.max(0, p.percentage || 0)) + '%';
                    if (bytesEl) bytesEl.textContent = `${formatBytes(p.downloadedBytes)} / ${formatBytes(p.totalBytes)}`;
                    if (speedEl) speedEl.textContent = formatBytes(p.speedBytesPerSec) + '/s';

                    if (p.stage === 'done') {
                        clearInterval(progressTimer);
                        progressTimer = null;
                        if (stageEl) stageEl.textContent = '下载完成，正在自动启动安装升级…';
                        if (btnUpgrade) btnUpgrade.innerHTML = '正在启动升级程序…';
                        const silent = localStorage.getItem('landisk_auto_silent_update') === 'true';

                        setTimeout(async () => {
                            try {
                                if (IPC && typeof IPC.installUpdate === 'function') {
                                    await IPC.installUpdate(silent);
                                } else {
                                    await fetch('/api/system/install-update', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ silent })
                                    });
                                }
                                if (UI && UI.toast) UI.toast('升级程序已成功启动，当前程序即将退出', 'success');
                            } catch (e) {
                                alert('自动启动升级失败: ' + e.message + '\n已为您打开文件目录');
                            }
                        }, 800);
                    } else if (p.stage === 'error') {
                        clearInterval(progressTimer);
                        progressTimer = null;
                        if (stageEl) stageEl.textContent = '下载失败: ' + (p.error || '未知网络错误');
                        if (btnUpgrade) {
                            btnUpgrade.disabled = false;
                            btnUpgrade.innerHTML = '重试升级下载';
                        }
                    }
                }, 400);

            } catch (err) {
                if (btnUpgrade) {
                    btnUpgrade.disabled = false;
                    btnUpgrade.innerHTML = '重试升级下载';
                }
                alert('启动下载失败: ' + err.message + '\n已为您在浏览器中打开 Releases 页面。');
                if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(latestInfo.download_url);
                else window.open(latestInfo.download_url, '_blank');
            }
        },

        // 开机或启动时后台静默自动检测
        autoCheckOnStartup: function () {
            const enabled = localStorage.getItem('landisk_auto_check_update') !== 'false';
            if (!enabled) return;

            setTimeout(async () => {
                try {
                    let res = null;
                    if (IPC && typeof IPC.checkAppUpdate === 'function') {
                        res = await IPC.checkAppUpdate();
                    } else {
                        const r = await fetch('/api/system/check-update');
                        if (r.ok) res = await r.json();
                    }
                    if (res && res.has_update && res.latest) {
                        UpdateModalComponent.show(res.latest);
                    }
                } catch (e) {}
            }, 3000);
        }
    };

    /* ---------- UpdateModalComponent ---------- */
    const UpdateModalComponent = {
        activeModal: null,

        show: function (latestInfo) {
            if (!latestInfo) return;
            if (this.activeModal) {
                try { this.activeModal.close(); } catch (e) {}
            }

            const currentVer = (AboutPanelComponent.appInfo && AboutPanelComponent.appInfo.version) || '2.3.4';
            let isSilent = localStorage.getItem('landisk_auto_silent_update') === 'true';

            const modal = UI.openModal(`
                <div class="update-modal-dialog" style="display:flex; flex-direction:column; gap:16px; user-select:none;">
                    <!-- 模态顶部 -->
                    <div style="display:flex; align-items:flex-start; gap:14px;">
                        <div style="position:relative; width:52px; height:52px; border-radius:16px; background:linear-gradient(135deg, rgba(0,122,255,0.22), rgba(88,86,214,0.26)); border:1px solid rgba(0,122,255,0.38); display:grid; place-items:center; font-size:26px; flex-shrink:0; box-shadow:0 8px 24px rgba(0,122,255,0.18);">
                            🚀
                            <span style="position:absolute; bottom:-2px; right:-2px; width:12px; height:12px; border-radius:50%; background:#30d158; border:2px solid var(--apple-bg-card, #fff); box-shadow:0 0 8px rgba(48,209,88,0.6);"></span>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <h3 style="margin:0; font-size:17px; font-weight:700; letter-spacing:-0.02em; color:var(--apple-text-main);">发现新版本可用</h3>
                                <span class="apple-badge apple-badge-info" style="font-size:11.5px; font-weight:700; font-family:ui-monospace,Consolas,monospace; padding:2px 8px; border-radius:6px;">v${escapeHtml(latestInfo.version)}</span>
                            </div>
                            <div style="font-size:12px; color:var(--apple-text-secondary); margin-top:4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <span>当前版本: <b class="mono" style="color:var(--apple-text-main); font-weight:600;">v${escapeHtml(currentVer)}</b></span>
                                ${latestInfo.release_date ? `<span>·</span><span>发布于 ${escapeHtml(latestInfo.release_date.slice(0, 10))}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- 更新日志说明（结构化美化，自适应呼吸空间，绝不截断） -->
                    <div style="background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:14px; padding:12px 14px; max-height:175px; overflow-y:auto; scrollbar-width:thin;">
                        <div style="font-size:11.5px; font-weight:700; color:var(--apple-text-secondary); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                            <span style="color:var(--apple-system-blue);">${I('sparkles', 13)}</span>
                            <span>新版特性与重要更新</span>
                        </div>
                        <div class="update-notes-content" style="user-select:text;">
                            ${formatReleaseNotes(latestInfo.release_notes)}
                        </div>
                    </div>

                    <!-- 静默升级选项 -->
                    <div class="row-between" style="background:var(--mat-thin); border:1px solid var(--apple-border); border-radius:12px; padding:10px 14px; gap:12px;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:12.5px; font-weight:600; color:var(--apple-text-main);">全自动静默无感升级 (推荐)</div>
                            <div style="font-size:11px; color:var(--apple-text-subtle); margin-top:2px;">下载完成后后台全自动平滑覆盖并重启，免除繁琐点击</div>
                        </div>
                        <label class="apple-switch" style="flex-shrink:0;"><input type="checkbox" id="modal-toggle-silent" ${isSilent ? 'checked' : ''}><span class="apple-slider"></span></label>
                    </div>

                    <!-- 动态下载进度与状态提示容器 -->
                    <div id="modal-update-progress-wrap" style="display:none;">
                        <div style="background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:8px;">
                            <div class="row-between" style="font-size:12px;">
                                <span id="modal-p-stage" style="color:var(--apple-system-blue); font-weight:600; display:flex; align-items:center; gap:6px;">
                                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#007aff;"></span>
                                    正在下载新版本安装包…
                                </span>
                                <span id="modal-p-percent" class="mono" style="font-weight:700; color:var(--apple-system-blue);">0%</span>
                            </div>
                            <div class="apple-progress-track" style="height:7px; border-radius:999px; overflow:hidden; background:rgba(0,122,255,0.12);">
                                <div class="apple-progress-fill" id="modal-p-bar" style="width:0%; height:100%; border-radius:999px; background:linear-gradient(90deg, #007aff, #5856d6); transition:width 0.2s ease-out;"></div>
                            </div>
                            <div class="row-between subtle" style="font-size:11px;">
                                <span id="modal-p-bytes">0 B / 0 B</span>
                                <span id="modal-p-speed">0 B/s</span>
                            </div>
                            <div id="modal-p-alert-box" style="display:none;"></div>
                        </div>
                    </div>

                    <!-- 底部操作按钮：确保绝对不折行，间距呼吸自然 -->
                    <div class="modal-actions" style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:4px;">
                        <button class="apple-btn apple-btn-glass" data-act="later" style="flex:1; white-space:nowrap; height:38px; padding:0 10px; font-size:12.5px; font-weight:500;">
                            稍后提醒
                        </button>
                        <button class="apple-btn apple-btn-glass" data-act="browser" style="flex:1.15; white-space:nowrap; height:38px; padding:0 10px; font-size:12.5px; font-weight:500; display:inline-flex; align-items:center; justify-content:center; gap:5px;">
                            ${I('external', 13)}
                            <span>浏览器下载</span>
                        </button>
                        <button class="apple-btn apple-btn-primary" data-act="upgrade" style="flex:1.4; white-space:nowrap; height:38px; padding:0 12px; font-size:12.5px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                            ⚡ 一键升级
                        </button>
                    </div>
                </div>
            `, { width: 480 });

            this.activeModal = modal;

            const chkSilent = modal.el.querySelector('#modal-toggle-silent');
            if (chkSilent) {
                chkSilent.addEventListener('change', (e) => {
                    localStorage.setItem('landisk_auto_silent_update', e.target.checked ? 'true' : 'false');
                    isSilent = e.target.checked;
                });
            }

            modal.el.querySelector('[data-act="later"]').addEventListener('click', () => modal.close());

            modal.el.querySelector('[data-act="browser"]').addEventListener('click', () => {
                const targetUrl = latestInfo.download_url || (AboutPanelComponent.appInfo && AboutPanelComponent.appInfo.releasesUrl);
                if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(targetUrl);
                else window.open(targetUrl, '_blank');
                modal.close();
            });

            modal.el.querySelector('[data-act="upgrade"]').addEventListener('click', () => {
                this.startModalUpgrade(modal, latestInfo, isSilent);
            });
        },

        startModalUpgrade: async function (modal, latestInfo, isSilent) {
            const isCapacitorAndroid = typeof window !== 'undefined' && (
                !!window.Capacitor || (window.location && window.location.href && window.location.href.includes('capacitor://'))
            );
            const assets = latestInfo.assets || [];
            if (isCapacitorAndroid) {
                const apkAsset = assets.find(a => (a.name || '').toLowerCase().endsWith('.apk')) || assets[0];
                const apkUrl = (apkAsset && apkAsset.url) || latestInfo.download_url;
                if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(apkUrl);
                else window.open(apkUrl, '_blank');
                if (UI && UI.toast) UI.toast('正在跳转下载最新 APK 安装包…', 'info');
                modal.close();
                return;
            }

            const exeAsset = assets.find(a => (a.name || '').toLowerCase().endsWith('.exe')) || assets[0];
            const targetUrl = (exeAsset && exeAsset.url) || latestInfo.download_url;

            if (!targetUrl || !targetUrl.startsWith('http')) {
                if (IPC && IPC.openExternalUrl) IPC.openExternalUrl(latestInfo.download_url);
                else window.open(latestInfo.download_url, '_blank');
                modal.close();
                return;
            }

            const pWrap = modal.el.querySelector('#modal-update-progress-wrap');
            const pAlert = modal.el.querySelector('#modal-p-alert-box');
            const btnUpgrade = modal.el.querySelector('[data-act="upgrade"]');
            const btnLater = modal.el.querySelector('[data-act="later"]');

            if (pWrap) pWrap.style.display = 'block';
            if (pAlert) pAlert.style.display = 'none';
            if (btnLater) btnLater.style.display = 'none';
            if (btnUpgrade) {
                btnUpgrade.disabled = true;
                btnUpgrade.innerHTML = '正在准备升级…';
            }

            try {
                if (IPC && typeof IPC.downloadUpdate === 'function') {
                    await IPC.downloadUpdate(targetUrl);
                } else {
                    await fetch('/api/system/download-update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: targetUrl })
                    });
                }

                if (progressTimer) clearInterval(progressTimer);
                progressTimer = setInterval(async () => {
                    let p = null;
                    try {
                        if (IPC && typeof IPC.getUpdateProgress === 'function') {
                            p = await IPC.getUpdateProgress();
                        } else {
                            const pr = await fetch('/api/system/update-progress');
                            if (pr.ok) p = await pr.json();
                        }
                    } catch (e) {}

                    if (!p) return;

                    const stageEl = modal.el.querySelector('#modal-p-stage');
                    const pctEl = modal.el.querySelector('#modal-p-percent');
                    const barEl = modal.el.querySelector('#modal-p-bar');
                    const bytesEl = modal.el.querySelector('#modal-p-bytes');
                    const speedEl = modal.el.querySelector('#modal-p-speed');

                    if (pctEl) pctEl.textContent = (p.percentage || 0) + '%';
                    if (barEl) barEl.style.width = Math.min(100, Math.max(0, p.percentage || 0)) + '%';
                    if (bytesEl) bytesEl.textContent = `${formatBytes(p.downloadedBytes)} / ${formatBytes(p.totalBytes)}`;
                    if (speedEl) speedEl.textContent = formatBytes(p.speedBytesPerSec) + '/s';

                    if (p.stage === 'done') {
                        clearInterval(progressTimer);
                        progressTimer = null;
                        if (pctEl) pctEl.textContent = '100%';
                        if (barEl) barEl.style.width = '100%';
                        if (stageEl) {
                            stageEl.innerHTML = `
                                <span style="color:var(--apple-system-green); font-weight:600; display:flex; align-items:center; gap:5px;">
                                    ${I('check', 14)} 下载完成，正在启动安装程序并重启…
                                </span>
                            `;
                        }
                        if (pAlert && p.isLocalFallback) {
                            pAlert.style.display = 'block';
                            pAlert.innerHTML = `
                                <div style="margin-top:6px; padding:8px 10px; background:rgba(48,209,88,0.08); border:1px solid rgba(48,209,88,0.25); border-radius:8px; font-size:11px; color:var(--apple-system-green);">
                                    已载入本地安装包，正在执行一键升级测试
                                </div>
                            `;
                        }
                        if (btnUpgrade) btnUpgrade.innerHTML = '正在启动安装程序…';

                        setTimeout(async () => {
                            try {
                                if (IPC && typeof IPC.installUpdate === 'function') {
                                    await IPC.installUpdate(isSilent);
                                } else {
                                    await fetch('/api/system/install-update', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ silent: isSilent })
                                    });
                                }
                                if (UI && UI.toast) UI.toast('升级程序已启动，软件即将关闭重启', 'success');
                            } catch (e) {
                                alert('启动升级程序失败: ' + e.message);
                            }
                        }, 800);
                    } else if (p.stage === 'error') {
                        clearInterval(progressTimer);
                        progressTimer = null;
                        if (stageEl) {
                            stageEl.innerHTML = `
                                <span style="color:var(--apple-system-red); font-weight:600; display:flex; align-items:center; gap:5px;">
                                    ${I('alert', 14)} 下载未完成
                                </span>
                            `;
                        }
                        if (pAlert) {
                            pAlert.style.display = 'block';
                            pAlert.innerHTML = `
                                <div style="margin-top:6px; padding:10px 12px; background:rgba(255,69,58,0.08); border:1px solid rgba(255,69,58,0.25); border-radius:10px; font-size:11.5px; color:var(--apple-system-red); line-height:1.5;">
                                    <div style="font-weight:700; margin-bottom:3px;">升级服务提示</div>
                                    <div>${escapeHtml(p.error || '网络连接异常')}</div>
                                    <div style="margin-top:6px; color:var(--apple-text-secondary); font-size:11px;">
                                        建议：您可以点击下方「浏览器下载」前往 Releases 发布页直接获取安装包。
                                    </div>
                                </div>
                            `;
                        }
                        if (btnUpgrade) {
                            btnUpgrade.disabled = false;
                            btnUpgrade.innerHTML = '重试一键升级';
                        }
                        if (btnLater) {
                            btnLater.style.display = '';
                            btnLater.textContent = '稍后提醒';
                        }
                    }
                }, 400);

            } catch (err) {
                if (btnUpgrade) {
                    btnUpgrade.disabled = false;
                    btnUpgrade.innerHTML = '重试一键升级';
                }
                if (btnLater) {
                    btnLater.style.display = '';
                }
                const pAlert = modal.el.querySelector('#modal-p-alert-box');
                if (pAlert) {
                    pAlert.style.display = 'block';
                    pAlert.innerHTML = `
                        <div style="margin-top:6px; padding:10px 12px; background:rgba(255,69,58,0.08); border:1px solid rgba(255,69,58,0.25); border-radius:10px; font-size:11.5px; color:var(--apple-system-red); line-height:1.5;">
                            <div style="font-weight:700; margin-bottom:3px;">启动下载遇到问题</div>
                            <div>${escapeHtml(err.message || '网络连接失败')}</div>
                            <div style="margin-top:6px; color:var(--apple-text-secondary); font-size:11px;">已为您保留浏览器下载通道，点击下方按钮即可前往。</div>
                        </div>
                    `;
                }
            }
        }
    };

    global.AboutPanelComponent = AboutPanelComponent;
    global.UpdateModalComponent = UpdateModalComponent;

})(typeof window !== 'undefined' ? window : this);

