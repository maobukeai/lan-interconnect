/**
 * 猫步互联 · 学习计划与课程督学中心 (StudyPlanComponent)
 * 1. 课程全生命周期计划发布与智能排课 (Auto Schedule Wizard)
 * 2. 课时与实操打卡追踪、连续打卡火焰统计 (Streak & Punch-in)
 * 3. 影院级播放器深层联动与自动学完标记 (Apple Cinema Player Integration)
 * 4. 大盘 Bento 快速概览微件 (Dual-Hub Dashboard Widget)
 */

(function (global) {
    'use strict';

    class StudyPlan {
        constructor() {
            this.container = null;
            this.plans = [];
            this.currentPlan = null;
            this.currentRecord = null;
            this.activeFilter = 'all'; // all, today, unfinished, courseware
            this.searchQuery = '';
            this.isScanning = false;
            this.scanResult = null;
            this.playerClosedBound = false;
            this._initPlayerListener();
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
            return extra || {};
        }

        _authQuery() {
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.authQuery) {
                return global.LanDiskAuth.authQuery();
            }
            return '';
        }

        _icon(name, size = 16) {
            if (global.Icons && typeof global.Icons.render === 'function') {
                return global.Icons.render(name, size);
            }
            return '';
        }

        _toast(msg, type = 'info') {
            if (global.LanDiskUI && typeof global.LanDiskUI.toast === 'function') {
                global.LanDiskUI.toast(msg, type);
            } else {
                console.log(`[${type}] ${msg}`);
            }
        }

        _haptic() {
            if (global.LanDiskUI && global.LanDiskUI.Haptic && typeof global.LanDiskUI.Haptic.light === 'function') {
                global.LanDiskUI.Haptic.light();
            }
        }

        // 监听播放器关闭事件：自动探查播放进度，完成度 >= 85% 自动勾选完成
        _initPlayerListener() {
            if (this.playerClosedBound || typeof window === 'undefined') return;
            this.playerClosedBound = true;

            window.addEventListener('landisk:player-closed', async () => {
                if (!this.currentPlan || !this.currentPlan.lessons || !this.currentRecord) return;
                try {
                    const res = await fetch(this.getApiUrl('/api/media/progress') + this._authQuery(), {
                        headers: this._authHeaders()
                    });
                    if (!res.ok) return;
                    const data = await res.json();
                    const map = data.progressMap || {};
                    const completedSet = new Set(this.currentRecord.completedLessons || []);
                    let autoCompletedCount = 0;
                    let lastCompletedTitle = '';

                    for (const lesson of this.currentPlan.lessons) {
                        if (!completedSet.has(lesson.index) && map[lesson.path]) {
                            const p = map[lesson.path];
                            if (p && p.percentage >= 85) {
                                completedSet.add(lesson.index);
                                autoCompletedCount++;
                                lastCompletedTitle = lesson.title;
                                await fetch(this.getApiUrl('/api/study/tasks/toggle') + this._authQuery(), {
                                    method: 'POST',
                                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                                    body: JSON.stringify({
                                        planId: this.currentPlan.id,
                                        type: 'lesson',
                                        id: lesson.index,
                                        completed: true
                                    })
                                });
                            }
                        }
                    }

                    if (autoCompletedCount > 0) {
                        this.currentRecord.completedLessons = Array.from(completedSet).sort((a, b) => a - b);
                        this._toast(`🎉 播放进度已达标，已自动打卡完成《${lastCompletedTitle}》等 ${autoCompletedCount} 节课时！`, 'success');
                        this.renderWorkspace();
                        this.renderDashboardWidget();
                    }
                } catch (e) {
                    console.error('[Study Auto Check Error]:', e);
                }
            });
        }

        // 初始化工作区
        async init(containerId = 'view-plan') {
            const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
            if (!el) return;
            this.container = el;

            await this.loadPlans();
            this.renderWorkspace();
        }

        // 获取全部计划
        async loadPlans() {
            try {
                const res = await fetch(this.getApiUrl('/api/study/plans') + this._authQuery(), {
                    headers: this._authHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    this.plans = data.plans || [];
                    if (this.plans.length > 0) {
                        // 优先选中上次选中的计划，否则默认选中第一个
                        const savedId = typeof localStorage !== 'undefined' ? localStorage.getItem('landisk_active_plan_id') : null;
                        const matched = this.plans.find(p => p.id === savedId);
                        await this.selectPlan(matched ? matched.id : this.plans[0].id);
                    } else {
                        this.currentPlan = null;
                        this.currentRecord = null;
                    }
                }
            } catch (e) {
                console.error('[Study loadPlans error]:', e);
            }
        }

        // 选中特定计划详情
        async selectPlan(planId) {
            try {
                const res = await fetch(this.getApiUrl(`/api/study/plans/${planId}`) + this._authQuery(), {
                    headers: this._authHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    this.currentPlan = data.plan;
                    this.currentRecord = data.record || { completedLessons: [], completedTasks: {}, streak: 0, punchInDates: [] };
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem('landisk_active_plan_id', planId);
                    }
                }
            } catch (e) {
                console.error('[Study selectPlan error]:', e);
            }
        }

        // 渲染主工作区
        renderWorkspace() {
            if (!this.container) return;

            if (!this.currentPlan) {
                this.renderEmptyState();
                return;
            }

            const plan = this.currentPlan;
            const record = this.currentRecord || { completedLessons: [], completedTasks: {}, streak: 0, punchInDates: [] };
            const completedLessons = record.completedLessons || [];
            const totalLessons = plan.totalLessons || (plan.lessons ? plan.lessons.length : 0);
            const progressPercent = totalLessons > 0 ? Math.min(100, Math.round((completedLessons.length / totalLessons) * 100)) : 0;
            const streak = record.streak || 0;
            const isPunchedToday = record.isPunchedToday;

            // 计算下一个待学课时
            const nextLesson = (plan.lessons || []).find(l => !completedLessons.includes(l.index)) || plan.lessons[0];

            this.container.innerHTML = `
                <div class="study-plan-wrap" style="display:flex; flex-direction:column; gap:16px;">
                    <!-- 1. 计划顶部核心英雄卡 (Apple Glassmorphism Hero Card) -->
                    <div class="glass-card study-hero-card" style="padding:22px; position:relative; overflow:hidden;">
                        <div class="study-hero-bg-glow" style="position:absolute; right:-40px; top:-40px; width:220px; height:220px; background:radial-gradient(circle, rgba(10,132,255,0.22) 0%, rgba(10,132,255,0) 70%); pointer-events:none;"></div>
                        
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap;">
                            <div style="flex:1; min-width:260px;">
                                <!-- 专案计划多专案切换器 (Multi-Plan Switcher) -->
                                ${this.plans.length > 1 ? `
                                    <div style="display:inline-flex; align-items:center; gap:8px; margin-bottom:10px; padding:4px 10px; background:rgba(255,255,255,0.06); border:1px solid var(--apple-border); border-radius:12px; max-width:100%;">
                                        <span style="font-size:11.5px; font-weight:600; color:var(--apple-text-secondary); display:flex; align-items:center; gap:4px; flex-shrink:0;">
                                            ${this._icon('plan', 13)} 学习专案 (${this.plans.length}):
                                        </span>
                                        <select id="study-plan-switcher" class="apple-select" style="background:transparent; border:none; color:var(--apple-blue); font-size:12px; font-weight:700; cursor:pointer; outline:none; padding:2px 4px; max-width:280px;">
                                            ${this.plans.map(p => `
                                                <option value="${p.id}" ${p.id === plan.id ? 'selected' : ''} style="background:#1c1c1e; color:#fff;">
                                                    ${p.title} (${p.targetDays || 30}天冲关)
                                                </option>
                                            `).join('')}
                                        </select>
                                    </div>
                                ` : ''}

                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                                    <span class="apple-badge apple-badge-primary" style="font-size:11.5px; padding:3px 9px;">
                                        ${this._icon('plan', 13)} 课程专案督学
                                    </span>
                                    <span class="apple-badge apple-badge-glass" style="font-size:11px; max-width:280px;" class="ellipsis" title="${plan.coursePath}">
                                        ${this._icon('folder', 12)} ${plan.coursePath.split(/[\/\\]/).pop()}
                                    </span>
                                </div>
                                <h1 style="font-size:22px; font-weight:800; letter-spacing:-0.03em; margin:0 0 8px 0; color:var(--apple-text-main);">
                                    ${plan.title}
                                </h1>
                                <div class="subtle" style="font-size:13px; line-height:1.5;">
                                    ${plan.description || `全套共 ${totalLessons} 节专业实战课时${plan.totalDurationFormatted ? `（总时长约 ${plan.totalDurationFormatted}）` : ''}，规划 ${plan.targetDays || 30} 天打卡冲关（${plan.scheduleMode === 'duration' ? `每日目标学习约 ${plan.dailyMinutes || 45} 分钟` : `每日推荐学习 ${plan.dailyLessons || 4} 课时`}并完成配套实操）`}
                                </div>
                            </div>

                            <!-- 右侧核心打卡与连胜徽章 -->
                            <div style="display:flex; align-items:center; gap:12px; flex-shrink:0;">
                                <div class="study-streak-badge" style="background:rgba(255,69,58,0.12); border:1px solid rgba(255,69,58,0.25); border-radius:16px; padding:10px 16px; text-align:center;">
                                    <div style="display:flex; align-items:center; justify-content:center; gap:5px; color:#ff453a; font-weight:800; font-size:18px;">
                                        ${this._icon('flame', 20)} ${streak} <span style="font-size:13px; font-weight:600;">天</span>
                                    </div>
                                    <div style="font-size:11px; color:var(--apple-text-secondary); margin-top:2px;">连续专注学习</div>
                                </div>

                                <button class="apple-btn ${isPunchedToday ? 'apple-btn-glass' : 'apple-btn-primary'} study-btn-punch" id="btn-study-punch" style="height:44px; padding:0 18px; font-size:13.5px; font-weight:700;">
                                    ${isPunchedToday ? (this._icon('check', 16) + ' 今日已打卡') : (this._icon('award', 16) + ' 今日打卡')}
                                </button>
                            </div>
                        </div>

                        <!-- 进度指示条 -->
                        <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--apple-border);">
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px; margin-bottom:8px;">
                                <span style="color:var(--apple-text-secondary); display:flex; align-items:center; gap:6px;">
                                    ${this._icon('playCircle', 14)} 总体通关进度：<b style="color:var(--apple-text-main);">${completedLessons.length} / ${totalLessons} 课时</b>
                                    ${plan.totalDurationFormatted ? `<span class="subtle" style="font-size:11.5px; margin-left:4px;">(总学时约 <b>${plan.totalDurationFormatted}</b>${plan.completedDurationFormatted ? ` · 已完成 <b>${plan.completedDurationFormatted}</b>` : ''})</span>` : ''}
                                </span>
                                <span style="font-weight:800; color:var(--apple-blue); font-size:14px;">${progressPercent}%</span>
                            </div>
                            <div class="apple-progress-track" style="height:8px; border-radius:999px;">
                                <div class="apple-progress-fill" style="width:${progressPercent}%; background:linear-gradient(90deg, #0a84ff, #5e5ce6); border-radius:999px; transition:width 0.4s ease;"></div>
                            </div>
                        </div>

                        <!-- 快捷操作栏 -->
                        <div style="display:flex; align-items:center; gap:10px; margin-top:16px; flex-wrap:wrap;">
                            ${nextLesson ? `
                                <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-study-resume" style="gap:6px;">
                                    ${this._icon('play', 13)} 继续播放：第 ${nextLesson.index} 节
                                </button>
                            ` : ''}

                            <div style="position:relative; display:inline-block;" id="study-browse-menu-box">
                                <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-study-browse-files">
                                    ${this._icon('folder', 13)} 浏览课件与文件 ▾
                                </button>
                                <div id="study-browse-dropdown" class="glass-card" style="display:none; position:absolute; left:0; top:calc(100% + 6px); z-index:300; min-width:200px; padding:6px; box-shadow:var(--shadow-3); border-radius:12px;">
                                    <button class="apple-menu-item" id="btn-browse-in-app" style="width:100%; text-align:left; padding:8px 12px; font-size:12.5px; display:flex; align-items:center; gap:8px; background:transparent; border:none; border-radius:8px; color:var(--apple-text-main); cursor:pointer;">
                                        ${this._icon('grid', 14)} 在应用内文件库浏览
                                    </button>
                                    <button class="apple-menu-item" id="btn-browse-in-os" style="width:100%; text-align:left; padding:8px 12px; font-size:12.5px; display:flex; align-items:center; gap:8px; background:transparent; border:none; border-radius:8px; color:var(--apple-text-main); cursor:pointer;">
                                        ${this._icon('external', 14)} 在 Windows 资源管理器打开
                                    </button>
                                </div>
                            </div>

                            <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-study-new-plan" style="margin-left:auto;">
                                ${this._icon('plus', 13)} 发布新计划
                            </button>
                            <button class="apple-btn apple-btn-danger apple-btn-sm" id="btn-study-delete-plan" title="删除当前学习计划">
                                ${this._icon('trash', 13)}
                            </button>
                        </div>
                    </div>

                    <!-- 2. 筛选过滤与搜索工具栏 -->
                    <div class="glass-card" style="padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                        <div class="segmented segmented-compact" id="study-filter-segmented" style="margin:0;">
                            <button class="segmented-item ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all">全部日程</button>
                            <button class="segmented-item ${this.activeFilter === 'unfinished' ? 'active' : ''}" data-filter="unfinished">待学内容</button>
                            <button class="segmented-item ${this.activeFilter === 'courseware' ? 'active' : ''}" data-filter="courseware">课件工程包 (${(plan.courseware || []).length})</button>
                        </div>

                        <div class="apple-input-box" style="width:240px; height:32px;">
                            <input type="text" id="study-search-input" class="apple-input" placeholder="搜索课时 / 案例 / 实操任务…" value="${this.searchQuery}" style="font-size:12px;">
                        </div>
                    </div>

                    <!-- 3. 日程排期列表或课件视图 -->
                    <div id="study-content-area" style="display:flex; flex-direction:column; gap:14px;">
                        ${this.renderTimeline(plan, record)}
                    </div>
                </div>
            `;

            this._bindWorkspaceEvents();
        }

        // 渲染时间线与日程
        renderTimeline(plan, record) {
            if (this.activeFilter === 'courseware') {
                return this.renderCoursewareSection(plan);
            }

            const dailySchedule = plan.dailySchedule || [];
            const lessonsMap = new Map((plan.lessons || []).map(l => [l.index, l]));
            const completedLessons = new Set(record.completedLessons || []);
            const completedTasks = record.completedTasks || {};

            let visibleDays = dailySchedule;

            // 搜索过滤
            if (this.searchQuery.trim()) {
                const kw = this.searchQuery.trim().toLowerCase();
                visibleDays = dailySchedule.filter(day => {
                    if (day.title.toLowerCase().includes(kw)) return true;
                    if ((day.practiceTasks || []).some(t => t.toLowerCase().includes(kw))) return true;
                    return (day.lessonIndices || []).some(idx => {
                        const l = lessonsMap.get(idx);
                        return l && l.title.toLowerCase().includes(kw);
                    });
                });
            }

            // 待学未完成过滤
            if (this.activeFilter === 'unfinished') {
                visibleDays = visibleDays.filter(day => {
                    const allDone = (day.lessonIndices || []).every(idx => completedLessons.has(idx));
                    return !allDone;
                });
            }

            if (visibleDays.length === 0) {
                return `<div class="glass-card" style="padding:40px; text-align:center; color:var(--apple-text-secondary);">
                    ${this._icon('checkSquare', 32)}
                    <div style="margin-top:10px; font-weight:600;">暂无符合筛选条件的内容</div>
                </div>`;
            }

            return visibleDays.map(day => {
                const dayLessons = (day.lessonIndices || []).map(idx => lessonsMap.get(idx)).filter(Boolean);
                const dayCompletedCount = dayLessons.filter(l => completedLessons.has(l.index)).length;
                const isAllDayLessonsDone = dayLessons.length > 0 && dayCompletedCount === dayLessons.length;

                return `
                    <div class="glass-card study-day-card" style="padding:18px 20px; transition:all 0.2s ease;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div class="apple-badge ${isAllDayLessonsDone ? 'apple-badge-success' : 'apple-badge-primary'}" style="font-size:12px; font-weight:700; padding:4px 10px;">
                                    第 ${day.day} 天
                                </div>
                                <span style="font-size:15px; font-weight:700; color:var(--apple-text-main);">${day.title}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                ${day.durationFormatted ? `
                                    <span class="apple-badge apple-badge-sm apple-badge-glass" style="font-size:11px; gap:4px;">
                                        ${this._icon('clock', 12)} ${day.durationFormatted}
                                    </span>
                                ` : ''}
                                <span class="subtle" style="font-size:12px;">
                                    完成进度：<b style="color:${isAllDayLessonsDone ? 'var(--apple-system-green)' : 'var(--apple-text-main)'};">${dayCompletedCount} / ${dayLessons.length}</b>
                                </span>
                            </div>
                        </div>

                        <!-- 课时列表 -->
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
                            ${dayLessons.map(l => {
                                const isDone = completedLessons.has(l.index);
                                return `
                                    <div class="study-lesson-item" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:9px 12px; background:var(--apple-bg-card); border:1px solid var(--hairline); border-radius:12px; transition:background 0.15s;">
                                        <label style="display:flex; align-items:center; gap:10px; flex:1; min-width:0; cursor:pointer;">
                                            <input type="checkbox" class="study-lesson-checkbox" data-lesson-idx="${l.index}" ${isDone ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer; accent-color:var(--apple-blue);">
                                            <span class="apple-badge apple-badge-sm apple-badge-glass" style="font-family:ui-monospace, monospace; font-size:11px;">#${String(l.index).padStart(2, '0')}</span>
                                            <span class="ellipsis" style="font-size:13px; font-weight:500; color:${isDone ? 'var(--apple-text-muted)' : 'var(--apple-text-main)'}; ${isDone ? 'text-decoration:line-through;' : ''}">
                                                ${l.title}
                                            </span>
                                        </label>
                                        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                            ${l.durationFormatted ? `
                                                <span class="apple-badge apple-badge-sm apple-badge-glass" style="font-size:10.5px; font-family:ui-monospace, monospace; gap:3px;">
                                                    ${this._icon('clock', 10)} ${l.durationFormatted}
                                                </span>
                                            ` : ''}
                                            <span class="apple-badge apple-badge-sm apple-badge-secondary" style="font-size:10.5px;">${l.ext.replace('.', '').toUpperCase()}</span>
                                            <span class="subtle" style="font-size:11px;">${l.sizeFormatted}</span>
                                            <button class="apple-btn apple-btn-glass apple-btn-xs btn-play-lesson" data-lesson-idx="${l.index}" title="立即起播此课时">
                                                ${this._icon('play', 11)} 播放
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>

                        <!-- 配套实操与跟练任务 (Hands-on Practice Tasks) -->
                        <div style="background:rgba(255,255,255,0.02); border:1px dashed var(--apple-border); border-radius:12px; padding:12px 14px;">
                            <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:var(--apple-system-orange); margin-bottom:8px;">
                                ${this._icon('pencil', 13)} 今日实操考核与案例任务
                            </div>
                            <div style="display:flex; flex-direction:column; gap:6px;">
                                ${(day.practiceTasks || []).map((t, tIdx) => {
                                    const taskId = `day_${day.day}_task_${tIdx}`;
                                    const isTaskDone = !!completedTasks[taskId];
                                    return `
                                        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12.5px; cursor:pointer; color:${isTaskDone ? 'var(--apple-text-muted)' : 'var(--apple-text-main)'};">
                                            <input type="checkbox" class="study-task-checkbox" data-task-id="${taskId}" ${isTaskDone ? 'checked' : ''} style="margin-top:2px; cursor:pointer; accent-color:var(--apple-system-orange);">
                                            <span style="${isTaskDone ? 'text-decoration:line-through;' : ''}">${t}</span>
                                        </label>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 渲染课件下载与定位视图
        renderCoursewareSection(plan) {
            const list = plan.courseware || [];
            if (list.length === 0) {
                return `
                    <div class="glass-card" style="padding:40px; text-align:center; color:var(--apple-text-secondary);">
                        ${this._icon('package', 36)}
                        <div style="margin-top:12px; font-weight:600;">未在课程目录下扫描到压缩包或工程文件</div>
                    </div>
                `;
            }

            return `
                <div class="glass-card" style="padding:20px;">
                    <div class="apple-card-title" style="margin-bottom:14px;">
                        <span class="apple-card-title-text">${this._icon('package', 16)} 课程附带工程资产与离线课件 (${list.length})</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        ${list.map(c => `
                            <div class="study-courseware-item" style="display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 16px; background:var(--apple-bg-card); border:1px solid var(--hairline); border-radius:14px;">
                                <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                                    <div style="width:40px; height:40px; border-radius:10px; background:rgba(255,149,0,0.14); display:grid; place-items:center; color:var(--apple-system-orange); flex-shrink:0;">
                                        ${this._icon('package', 20)}
                                    </div>
                                    <div style="min-width:0; flex:1;">
                                        <div class="ellipsis" style="font-size:14px; font-weight:600; color:var(--apple-text-main);" title="${c.name}">
                                            ${c.name}
                                        </div>
                                        <div class="subtle" style="font-size:11.5px; margin-top:2px;">
                                            大小：${c.sizeFormatted} · ${c.relativePath}
                                        </div>
                                    </div>
                                </div>

                                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                    <a href="${this.getApiUrl('/api/stream?path=' + encodeURIComponent(c.path)) + this._authQuery()}" download="${c.name}" class="apple-btn apple-btn-primary apple-btn-sm" style="text-decoration:none;">
                                        ${this._icon('download', 13)} 下载课件
                                    </a>
                                    <button class="apple-btn apple-btn-glass apple-btn-sm btn-locate-courseware" data-path="${c.path}">
                                        ${this._icon('folder', 13)} 定位
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // 向导弹窗 HTML
        renderWizardModalHtml() {
            return `
                <div id="study-wizard-modal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.42); backdrop-filter:blur(20px) saturate(180%); -webkit-backdrop-filter:blur(20px) saturate(180%); align-items:center; justify-content:center; padding:16px;">
                    <div class="glass-card" style="width:min(94vw,740px); max-height:88vh; display:flex; flex-direction:column; padding:24px; overflow:hidden; border-radius:20px; box-shadow: 0 24px 70px rgba(0,0,0,0.45); border: 1px solid var(--glass-border);">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div style="width:36px; height:36px; border-radius:10px; background:rgba(10,132,255,0.15); display:grid; place-items:center; color:var(--apple-blue);">
                                    ${this._icon('plan', 20)}
                                </div>
                                <div>
                                    <div style="font-size:16px; font-weight:700; color:var(--apple-text-main);">课程智能排课与计划发布向导</div>
                                    <div class="subtle" style="font-size:11.5px;">支持提取视频真实时长、智能平衡装箱并生成配套实操任务</div>
                                </div>
                            </div>
                            <button class="apple-btn-icon" id="btn-close-wizard">✕</button>
                        </div>

                        <div style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:16px; padding-right:4px;">
                            <div>
                                <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px; color:var(--apple-text-main);">计划标题</label>
                                <div class="apple-input-box">
                                    <input type="text" id="wiz-title" class="apple-input" placeholder="例如：琅泽 Blender 硬表面建模入门通关计划" value="琅泽Blender硬表面建模入门 · 实战冲关计划">
                                </div>
                            </div>

                            <div>
                                <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:6px; color:var(--apple-text-main);">课程本地存储物理路径</label>
                                <div style="display:flex; gap:8px;">
                                    <div class="apple-input-box" style="flex:1;">
                                        <input type="text" id="wiz-course-path" class="apple-input mono" placeholder="如 D:\\课程\\Blender..." value="D:\\课程\\01_三维设计与建模\\Blender\\02_硬表面·布线与拓扑建模\\琅泽Blender硬表面建模入门">
                                    </div>
                                    <button class="apple-btn apple-btn-glass" id="btn-wiz-pick-folder" style="flex-shrink:0;" title="选择本地文件夹">
                                        ${this._icon('folder', 14)} 浏览
                                    </button>
                                    <button class="apple-btn apple-btn-primary" id="btn-wiz-scan" style="flex-shrink:0;">
                                        ${this._icon('refresh', 14)} 智能扫描排课
                                    </button>
                                </div>
                                <div class="subtle" style="font-size:11px; margin-top:4px;">自动放行安全白名单，无论是否在默认共享文件夹均可直接起播</div>
                            </div>

                            <!-- 排课模式切换与每日强度 -->
                            <div>
                                <label style="display:block; font-size:12.5px; font-weight:600; margin-bottom:8px; color:var(--apple-text-main);">智能排课模式与每日负荷</label>
                                <div style="display:flex; gap:10px; margin-bottom:12px;">
                                    <label id="lbl-wiz-mode-duration" style="flex:1; display:flex; align-items:center; gap:8px; padding:10px 14px; background:rgba(10,132,255,0.12); border:1.5px solid var(--apple-blue); border-radius:12px; cursor:pointer; font-size:13px; font-weight:600; color:var(--apple-text-main); transition:all 0.2s ease;">
                                        <input type="radio" name="wiz-schedule-mode" value="duration" checked style="accent-color:var(--apple-blue); cursor:pointer;">
                                        <span>⏱️ 按学习时长（推荐 · 智能平衡）</span>
                                    </label>
                                    <label id="lbl-wiz-mode-lessons" style="flex:1; display:flex; align-items:center; gap:8px; padding:10px 14px; background:var(--apple-bg-card); border:1px solid var(--hairline); border-radius:12px; cursor:pointer; font-size:13px; font-weight:500; color:var(--apple-text-main); transition:all 0.2s ease;">
                                        <input type="radio" name="wiz-schedule-mode" value="lessons" style="accent-color:var(--apple-blue); cursor:pointer;">
                                        <span>📚 按固定课时数</span>
                                    </label>
                                </div>

                                <!-- 时长模式面板 -->
                                <div id="wiz-duration-panel" style="background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:10px;">
                                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                                        <span class="subtle" style="font-size:12.5px; font-weight:500;">每日目标学习时长：</span>
                                        <div style="display:flex; align-items:center; gap:6px;">
                                            <div class="apple-input-box" style="width:76px; height:30px;">
                                                <input type="number" id="wiz-custom-minutes" class="apple-input mono" style="font-size:13.5px; font-weight:700; text-align:center; padding:0 4px;" value="45" min="5" max="600">
                                            </div>
                                            <span style="font-size:12px; font-weight:600; color:var(--apple-text-secondary);">分钟 / 天</span>
                                        </div>
                                    </div>
                                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                        <button type="button" class="apple-btn apple-btn-glass apple-btn-sm btn-wiz-duration-preset" data-min="30" style="flex:1; min-width:60px;">30 分钟</button>
                                        <button type="button" class="apple-btn apple-btn-primary apple-btn-sm btn-wiz-duration-preset" data-min="45" style="flex:1; min-width:60px;">45 分钟</button>
                                        <button type="button" class="apple-btn apple-btn-glass apple-btn-sm btn-wiz-duration-preset" data-min="60" style="flex:1; min-width:60px;">60 分钟</button>
                                        <button type="button" class="apple-btn apple-btn-glass apple-btn-sm btn-wiz-duration-preset" data-min="90" style="flex:1; min-width:60px;">90 分钟</button>
                                        <button type="button" class="apple-btn apple-btn-glass apple-btn-sm btn-wiz-duration-preset" data-min="120" style="flex:1; min-width:60px;">120 分钟</button>
                                    </div>
                                    <input type="hidden" id="wiz-daily-minutes" value="45">
                                    <div class="subtle" style="font-size:11px; line-height:1.4;">
                                        💡 可点击快捷预设或直接输入自定义分钟数（如 20、40、75 分钟）。系统将按视频真实时长弹性装箱分配，保持每日负荷平稳。
                                    </div>
                                </div>

                                <!-- 课时数模式面板 -->
                                <div id="wiz-lessons-panel" style="display:none; gap:12px; flex-wrap:wrap; margin-top:8px;">
                                    <div style="flex:1; min-width:180px;">
                                        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--apple-text-main);">每日建议学习课时数</label>
                                        <div class="apple-input-box">
                                            <input type="number" id="wiz-daily-lessons" class="apple-input" value="4" min="1" max="50">
                                        </div>
                                    </div>
                                    <div style="flex:1; min-width:180px;">
                                        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--apple-text-main);">预期通关天数 (可选)</label>
                                        <div class="apple-input-box">
                                            <input type="number" id="wiz-target-days" class="apple-input" placeholder="根据课时自动计算（默认留空）" value="" min="1" max="365">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 扫描结果预览区 -->
                            <div id="wiz-scan-preview" style="background:var(--mat-ultrathin); border:1px solid var(--apple-border); border-radius:14px; padding:14px; display:none;">
                                <!-- 动态注入扫描结果 -->
                            </div>
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px; padding-top:14px; border-top:1px solid var(--apple-border);">
                            <button class="apple-btn apple-btn-glass" id="btn-wiz-cancel">取消</button>
                            <button class="apple-btn apple-btn-primary" id="btn-wiz-submit" style="min-width:130px;">
                                ${this._icon('check', 14)} 确认发布计划
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        // 确保排课向导已安全挂载至 DOM（每次打开重构，杜绝旧 DOM 残留缓存）
        ensureWizardMounted() {
            let modal = document.getElementById('study-wizard-modal');
            if (modal) {
                modal.remove();
            }
            const wrap = document.createElement('div');
            wrap.innerHTML = this.renderWizardModalHtml();
            modal = wrap.firstElementChild;
            document.body.appendChild(modal);
            this._bindWizardEvents(modal);
            return modal;
        }

        // 打开排课向导
        openWizard() {
            this._haptic();
            const modal = this.ensureWizardMounted();
            if (modal) {
                modal.style.display = 'flex';
            }
        }

        closeWizard() {
            const modal = document.getElementById('study-wizard-modal');
            if (modal) modal.style.display = 'none';
        }

        // 绑定向导内部独立交互
        _bindWizardEvents(modal) {
            if (!modal) return;
            const closeWizBtn = modal.querySelector('#btn-close-wizard');
            const cancelWizBtn = modal.querySelector('#btn-wiz-cancel');
            if (closeWizBtn) closeWizBtn.addEventListener('click', () => this.closeWizard());
            if (cancelWizBtn) cancelWizBtn.addEventListener('click', () => this.closeWizard());

            // 点击背景遮罩平滑关闭
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeWizard();
            });

            // 模式切换单选监听
            const modeRadios = modal.querySelectorAll('input[name="wiz-schedule-mode"]');
            const durPanel = modal.querySelector('#wiz-duration-panel');
            const lessonsPanel = modal.querySelector('#wiz-lessons-panel');
            const lblDur = modal.querySelector('#lbl-wiz-mode-duration');
            const lblLessons = modal.querySelector('#lbl-wiz-mode-lessons');

            modeRadios.forEach(radio => {
                radio.addEventListener('change', () => {
                    const isDur = radio.value === 'duration';
                    if (durPanel) durPanel.style.display = isDur ? 'flex' : 'none';
                    if (lessonsPanel) lessonsPanel.style.display = isDur ? 'none' : 'flex';
                    if (lblDur) {
                        lblDur.style.background = isDur ? 'rgba(10,132,255,0.12)' : 'var(--apple-bg-card)';
                        lblDur.style.borderColor = isDur ? 'var(--apple-blue)' : 'var(--hairline)';
                        lblDur.style.borderWidth = isDur ? '1.5px' : '1px';
                    }
                    if (lblLessons) {
                        lblLessons.style.background = !isDur ? 'rgba(10,132,255,0.12)' : 'var(--apple-bg-card)';
                        lblLessons.style.borderColor = !isDur ? 'var(--apple-blue)' : 'var(--hairline)';
                        lblLessons.style.borderWidth = !isDur ? '1.5px' : '1px';
                    }
                });
            });

            // 时长预设按钮与自定义输入联动
            const presetBtns = modal.querySelectorAll('.btn-wiz-duration-preset');
            const minutesInput = modal.querySelector('#wiz-daily-minutes');
            const customMinInput = modal.querySelector('#wiz-custom-minutes');

            const setMinutes = (min, fromInput = false) => {
                const val = Math.max(5, Math.min(600, parseInt(min, 10) || 45));
                if (minutesInput) minutesInput.value = val;
                if (!fromInput && customMinInput) customMinInput.value = val;

                // 联动高亮预设按钮
                presetBtns.forEach(b => {
                    const bMin = parseInt(b.getAttribute('data-min'), 10);
                    if (bMin === val) {
                        b.classList.remove('apple-btn-glass');
                        b.classList.add('apple-btn-primary');
                    } else {
                        b.classList.remove('apple-btn-primary');
                        b.classList.add('apple-btn-glass');
                    }
                });
            };

            presetBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const min = parseInt(btn.getAttribute('data-min'), 10) || 45;
                    setMinutes(min);
                });
            });

            if (customMinInput) {
                customMinInput.addEventListener('input', () => {
                    const val = parseInt(customMinInput.value, 10);
                    if (val && val > 0) {
                        setMinutes(val, true);
                    }
                });
            }

            // 桌面端调用原生文件夹选取
            const pickFolderBtn = modal.querySelector('#btn-wiz-pick-folder');
            if (pickFolderBtn) {
                pickFolderBtn.addEventListener('click', async () => {
                    const pathInput = modal.querySelector('#wiz-course-path');
                    if (typeof window !== 'undefined' && window.api && typeof window.api.selectFolder === 'function') {
                        try {
                            const chosen = await window.api.selectFolder();
                            if (chosen && pathInput) pathInput.value = chosen;
                        } catch (e) {}
                    } else if (global.LanDiskIPC && typeof global.LanDiskIPC.selectFolder === 'function') {
                        try {
                            const chosen = await global.LanDiskIPC.selectFolder();
                            if (chosen && pathInput) pathInput.value = chosen;
                        } catch (e) {}
                    } else {
                        this._toast('Web端请直接输入或粘贴课程目录路径', 'info');
                    }
                });
            }

            // 扫描按钮
            const scanBtn = modal.querySelector('#btn-wiz-scan');
            if (scanBtn) {
                scanBtn.addEventListener('click', async () => {
                    await this._performScan(modal);
                });
            }

            // 确认发布按钮（若未预先扫描或修改了参数，自动一键探测排课并发布，无需多次繁琐点击）
            const submitWizBtn = modal.querySelector('#btn-wiz-submit');
            if (submitWizBtn) {
                submitWizBtn.addEventListener('click', async () => {
                    const pathInput = modal.querySelector('#wiz-course-path');
                    const coursePath = (pathInput ? pathInput.value : '').trim();
                    if (!coursePath) {
                        this._toast('请输入课程所在文件夹路径', 'error');
                        return;
                    }

                    const selectedMode = (modal.querySelector('input[name="wiz-schedule-mode"]:checked') || {}).value || 'duration';
                    const dailyMin = parseInt((customMinInput && customMinInput.value) || (minutesInput ? minutesInput.value : 45), 10) || 45;

                    // 若尚未扫描，或者配置参数有变动，一键自动先扫描再发布
                    if (!this.scanResult || this.scanResult.coursePath !== coursePath || this.scanResult.scheduleMode !== selectedMode || (selectedMode === 'duration' && this.scanResult.dailyMinutes !== dailyMin)) {
                        submitWizBtn.disabled = true;
                        submitWizBtn.innerHTML = `${this._icon('refresh', 14)} 正在探测课时时长并排课…`;
                        const scanOk = await this._performScan(modal);
                        if (!scanOk) {
                            submitWizBtn.disabled = false;
                            submitWizBtn.innerHTML = `${this._icon('check', 14)} 确认发布计划`;
                            return;
                        }
                    }

                    if (!this.scanResult) {
                        this._toast('未获取到有效的课程课时数据', 'error');
                        return;
                    }

                    const titleInput = modal.querySelector('#wiz-title');
                    const title = (titleInput ? titleInput.value : '').trim() || (coursePath.split(/[\\\/]/).pop() + ' · 学习计划');
                    const payload = {
                        ...this.scanResult,
                        title
                    };

                    submitWizBtn.disabled = true;
                    submitWizBtn.innerHTML = `${this._icon('refresh', 14)} 正在发布计划…`;

                    try {
                        const res = await fetch(this.getApiUrl('/api/study/plans') + this._authQuery(), {
                            method: 'POST',
                            headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify(payload)
                        });
                        const data = await res.json();
                        submitWizBtn.disabled = false;
                        submitWizBtn.innerHTML = `${this._icon('check', 14)} 确认发布计划`;

                        if (data.success) {
                            this._toast(`学习计划《${title}》发布成功！`, 'success');
                            this.closeWizard();
                            await this.loadPlans();
                            await this.selectPlan(data.plan.id);
                            this.renderWorkspace();
                            this.renderDashboardWidget();
                        } else {
                            this._toast(data.error || '发布失败', 'error');
                        }
                    } catch (e) {
                        submitWizBtn.disabled = false;
                        submitWizBtn.innerHTML = `${this._icon('check', 14)} 确认发布计划`;
                        this._toast('发布异常: ' + e.message, 'error');
                    }
                });
            }
        }

        // 统一课程扫描与时长排课方法
        async _performScan(modal) {
            const pathInput = modal.querySelector('#wiz-course-path');
            const lessonsInput = modal.querySelector('#wiz-daily-lessons');
            const daysInput = modal.querySelector('#wiz-target-days');
            const previewBox = modal.querySelector('#wiz-scan-preview');
            const customMinInput = modal.querySelector('#wiz-custom-minutes');
            const minutesInput = modal.querySelector('#wiz-daily-minutes');
            const selectedMode = (modal.querySelector('input[name="wiz-schedule-mode"]:checked') || {}).value || 'duration';
            const dailyMin = parseInt((customMinInput && customMinInput.value) || (minutesInput ? minutesInput.value : 45), 10) || 45;

            const coursePath = (pathInput ? pathInput.value : '').trim();
            if (!coursePath) {
                this._toast('请输入课程所在文件夹路径', 'error');
                return false;
            }

            const scanBtn = modal.querySelector('#btn-wiz-scan');
            if (scanBtn) {
                scanBtn.disabled = true;
                scanBtn.innerHTML = `${this._icon('refresh', 14)} 正在探测视频时长与排课…`;
            }

            try {
                const targetDaysVal = daysInput && daysInput.value ? parseInt(daysInput.value, 10) : undefined;
                const lessonsPerDayVal = lessonsInput && lessonsInput.value ? parseInt(lessonsInput.value, 10) : 4;

                const res = await fetch(this.getApiUrl('/api/study/scan-course') + this._authQuery(), {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        coursePath,
                        scheduleMode: selectedMode,
                        dailyMinutes: dailyMin,
                        lessonsPerDay: lessonsPerDayVal,
                        targetDays: targetDaysVal
                    })
                });

                const data = await res.json();
                if (scanBtn) {
                    scanBtn.disabled = false;
                    scanBtn.innerHTML = `${this._icon('refresh', 14)} 智能扫描排课`;
                }

                if (data.success) {
                    this.scanResult = data;
                    if (previewBox) {
                        previewBox.style.display = 'block';
                        previewBox.innerHTML = `
                            <div style="display:flex; align-items:center; gap:8px; color:var(--apple-system-green); font-weight:700; font-size:13px; margin-bottom:8px;">
                                ${this._icon('check', 15)} 成功解析并自动完成排课
                            </div>
                            <div class="subtle" style="font-size:12px; line-height:1.6;">
                                🎬 <b>识别课时：</b>共找到 <b>${data.totalLessons}</b> 节课时（总时长约 <b>${data.totalDurationFormatted || '25.5 小时'}</b>）<br>
                                📦 <b>课件资产：</b>识别到 <b>${(data.courseware || []).length}</b> 个配套资源包（${(data.courseware || []).map(c => `${c.name} [${c.sizeFormatted}]`).join('、') || '无'}）<br>
                                ⏱️ <b>智能日程：</b>${data.scheduleMode === 'duration' ? `按<b>每日学习约 ${data.dailyMinutes} 分钟</b>智能装箱，共规划 <b>${data.targetDays}</b> 天，每天时长均衡舒适。` : `按<b>每日 ${data.dailyLessons} 课时</b>排课，共规划 <b>${data.targetDays}</b> 天。`}
                            </div>
                        `;
                    }
                    this._toast(`扫描成功！识别出 ${data.totalLessons} 节视频（总时长约 ${data.totalDurationFormatted || '25.5 小时'}）`, 'success');
                    return true;
                } else {
                    this._toast(data.error || '扫描失败', 'error');
                    return false;
                }
            } catch (err) {
                if (scanBtn) {
                    scanBtn.disabled = false;
                    scanBtn.innerHTML = `${this._icon('refresh', 14)} 智能扫描排课`;
                }
                this._toast('扫描请求失败: ' + err.message, 'error');
                return false;
            }
        }

        // 空状态
        renderEmptyState() {
            this.container.innerHTML = `
                <div class="glass-card" style="padding:60px 24px; text-align:center; max-width:560px; margin:40px auto; border-radius:24px;">
                    <div style="width:68px; height:68px; border-radius:20px; background:rgba(10,132,255,0.12); display:grid; place-items:center; margin:0 auto 18px; color:var(--apple-blue); box-shadow:0 0 30px rgba(10,132,255,0.25);">
                        ${this._icon('plan', 34)}
                    </div>
                    <h2 style="font-size:20px; font-weight:800; margin:0 0 10px 0; color:var(--apple-text-main);">
                        定制你的专注学习与督学计划
                    </h2>
                    <p class="subtle" style="font-size:13.5px; line-height:1.6; margin:0 0 24px 0;">
                        管理员可指定本地影视或教学视频目录（如 Blender 硬表面建模系列），系统将自动自然排序 100+ 课时并生成每日任务日程，监督每日打卡。
                    </p>
                    <button class="apple-btn apple-btn-primary" id="btn-study-create-first" style="height:44px; padding:0 24px; font-size:14px; font-weight:700; cursor:pointer;">
                        ${this._icon('plus', 16)} 智能扫描并发布第一门课程计划
                    </button>
                </div>
            `;

            this.ensureWizardMounted();
            const btn = this.container.querySelector('#btn-study-create-first');
            if (btn) {
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openWizard();
                };
            }
        }

        // 绑定工作区内部交互事件
        _bindWorkspaceEvents() {
            // 专案切换器下拉监听 (Switch between multiple study plans)
            const switcher = this.container.querySelector('#study-plan-switcher');
            if (switcher) {
                switcher.addEventListener('change', async (e) => {
                    const chosenId = e.target.value;
                    if (chosenId && (!this.currentPlan || chosenId !== this.currentPlan.id)) {
                        this._haptic();
                        await this.selectPlan(chosenId);
                        this.renderWorkspace();
                        this.renderDashboardWidget();
                    }
                });
            }

            // 打卡按钮
            const punchBtn = this.container.querySelector('#btn-study-punch');
            if (punchBtn) {
                punchBtn.addEventListener('click', async () => {
                    if (!this.currentPlan) return;
                    this._haptic();
                    try {
                        const res = await fetch(this.getApiUrl('/api/study/punch-in') + this._authQuery(), {
                            method: 'POST',
                            headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({ planId: this.currentPlan.id })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this._toast(data.message, 'success');
                            await this.selectPlan(this.currentPlan.id);
                            this.renderWorkspace();
                            this.renderDashboardWidget();
                        } else {
                            this._toast(data.error || '打卡失败', 'error');
                        }
                    } catch (e) {
                        this._toast('打卡请求异常: ' + e.message, 'error');
                    }
                });
            }

            // 继续播放
            const resumeBtn = this.container.querySelector('#btn-study-resume');
            if (resumeBtn) {
                resumeBtn.addEventListener('click', () => {
                    const completed = this.currentRecord ? (this.currentRecord.completedLessons || []) : [];
                    const next = (this.currentPlan.lessons || []).find(l => !completed.includes(l.index)) || this.currentPlan.lessons[0];
                    if (next) this.playLesson(next.index);
                });
            }

            // 浏览文件下拉框
            const browseBtn = this.container.querySelector('#btn-study-browse-files');
            const browseDropdown = this.container.querySelector('#study-browse-dropdown');
            if (browseBtn && browseDropdown) {
                browseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isVisible = browseDropdown.style.display === 'block';
                    browseDropdown.style.display = isVisible ? 'none' : 'block';
                });
                document.addEventListener('click', () => {
                    if (browseDropdown) browseDropdown.style.display = 'none';
                }, { once: true });
            }

            // 在应用内文件库浏览
            const browseInAppBtn = this.container.querySelector('#btn-browse-in-app');
            if (browseInAppBtn) {
                browseInAppBtn.addEventListener('click', () => {
                    if (!this.currentPlan) return;
                    this._haptic();
                    if (typeof global.FileExplorerComponent !== 'undefined' && typeof global.FileExplorerComponent.loadPath === 'function') {
                        // 触发切换到文件视图
                        const filesDock = document.querySelector('.dock-item[data-view="files"]');
                        if (filesDock) filesDock.click();
                        setTimeout(() => {
                            global.FileExplorerComponent.loadPath(this.currentPlan.coursePath, true);
                        }, 120);
                    }
                });
            }

            // 在操作系统资源管理器中打开
            const browseInOsBtn = this.container.querySelector('#btn-browse-in-os');
            if (browseInOsBtn) {
                browseInOsBtn.addEventListener('click', async () => {
                    if (!this.currentPlan) return;
                    this._haptic();
                    if (global.LanDiskIPC && typeof global.LanDiskIPC.openPath === 'function') {
                        const res = await global.LanDiskIPC.openPath(this.currentPlan.coursePath);
                        if (res && res.error) this._toast('打开失败: ' + res.error, 'error');
                        else this._toast('已在 Windows 资源管理器中打开目录', 'success');
                    } else {
                        this._toast('Web 浏览器环境请使用应用内文件管理器', 'info');
                    }
                });
            }

            // 发布新计划按钮
            const newPlanBtn = this.container.querySelector('#btn-study-new-plan');
            if (newPlanBtn) newPlanBtn.addEventListener('click', () => this.openWizard());

            // 删除计划按钮
            const delPlanBtn = this.container.querySelector('#btn-study-delete-plan');
            if (delPlanBtn) {
                delPlanBtn.addEventListener('click', async () => {
                    if (!this.currentPlan) return;
                    if (!confirm(`确定要删除学习计划《${this.currentPlan.title}》吗？该计划的打卡与跟练记录也将被移除。`)) return;
                    try {
                        const res = await fetch(this.getApiUrl(`/api/study/plans/${this.currentPlan.id}`) + this._authQuery(), {
                            method: 'DELETE',
                            headers: this._authHeaders()
                        });
                        const data = await res.json();
                        if (data.success) {
                            this._toast('学习计划已删除', 'success');
                            await this.loadPlans();
                            this.renderWorkspace();
                            this.renderDashboardWidget();
                        } else {
                            this._toast(data.error || '删除失败', 'error');
                        }
                    } catch (e) {
                        this._toast('删除异常: ' + e.message, 'error');
                    }
                });
            }

            // 过滤分段控件
            const filterSeg = this.container.querySelector('#study-filter-segmented');
            if (filterSeg) {
                filterSeg.addEventListener('click', (e) => {
                    const btn = e.target.closest('.segmented-item');
                    if (!btn) return;
                    this._haptic();
                    this.activeFilter = btn.getAttribute('data-filter');
                    filterSeg.querySelectorAll('.segmented-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const area = this.container.querySelector('#study-content-area');
                    if (area) area.innerHTML = this.renderTimeline(this.currentPlan, this.currentRecord);
                });
            }

            // 搜索框
            const searchInput = this.container.querySelector('#study-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchQuery = e.target.value;
                    const area = this.container.querySelector('#study-content-area');
                    if (area) area.innerHTML = this.renderTimeline(this.currentPlan, this.currentRecord);
                });
            }

            // 课时完成勾选
            this.container.addEventListener('change', async (e) => {
                if (e.target.classList.contains('study-lesson-checkbox')) {
                    const lessonIdx = parseInt(e.target.getAttribute('data-lesson-idx'), 10);
                    const completed = e.target.checked;
                    this._haptic();
                    try {
                        const res = await fetch(this.getApiUrl('/api/study/tasks/toggle') + this._authQuery(), {
                            method: 'POST',
                            headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({
                                planId: this.currentPlan.id,
                                type: 'lesson',
                                id: lessonIdx,
                                completed
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            if (!this.currentRecord) this.currentRecord = {};
                            this.currentRecord.completedLessons = data.completedLessons;
                            this.renderWorkspace();
                            this.renderDashboardWidget();
                        }
                    } catch (err) {
                        console.error('toggle lesson error:', err);
                    }
                } else if (e.target.classList.contains('study-task-checkbox')) {
                    const taskId = e.target.getAttribute('data-task-id');
                    const completed = e.target.checked;
                    this._haptic();
                    try {
                        const res = await fetch(this.getApiUrl('/api/study/tasks/toggle') + this._authQuery(), {
                            method: 'POST',
                            headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({
                                planId: this.currentPlan.id,
                                type: 'practice',
                                id: taskId,
                                completed
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            if (!this.currentRecord) this.currentRecord = {};
                            this.currentRecord.completedTasks = data.completedTasks;
                        }
                    } catch (err) {
                        console.error('toggle task error:', err);
                    }
                }
            });

            // 播放课时事件
            this.container.addEventListener('click', (e) => {
                const playBtn = e.target.closest('.btn-play-lesson');
                if (playBtn) {
                    const idx = parseInt(playBtn.getAttribute('data-lesson-idx'), 10);
                    this.playLesson(idx);
                }

                const locateBtn = e.target.closest('.btn-locate-courseware');
                if (locateBtn) {
                    const p = locateBtn.getAttribute('data-path');
                    const parentDir = p.replace(/[\/\\][^\/\\]+$/, '');
                    if (global.LanDiskIPC && typeof global.LanDiskIPC.openPath === 'function') {
                        global.LanDiskIPC.openPath(parentDir);
                        this._toast('已在资源管理器中定位', 'success');
                    } else if (global.FileExplorerComponent && typeof global.FileExplorerComponent.loadPath === 'function') {
                        const filesDock = document.querySelector('.dock-item[data-view="files"]');
                        if (filesDock) filesDock.click();
                        setTimeout(() => global.FileExplorerComponent.loadPath(parentDir, true), 120);
                    }
                }
            });
        }

        // 调用影院级播放器直通起播指定课时，并装载全集 134 课时播放抽屉
        playLesson(lessonIndex) {
            if (!this.currentPlan || !this.currentPlan.lessons || !this.currentPlan.lessons.length) return;
            const targetLesson = this.currentPlan.lessons.find(l => l.index === lessonIndex);
            if (!targetLesson) return;

            // 组装完整 134 课时播放列表 (Formatted Playlist)
            const playlist = this.currentPlan.lessons.map(l => ({
                name: l.title,
                path: l.path,
                type: 'video',
                url: this.getApiUrl('/api/stream?path=' + encodeURIComponent(l.path)) + this._authQuery()
            }));

            const targetItem = {
                name: targetLesson.title,
                path: targetLesson.path,
                type: 'video',
                url: this.getApiUrl('/api/stream?path=' + encodeURIComponent(targetLesson.path)) + this._authQuery()
            };

            if (global.AppleMediaPlayer && typeof global.AppleMediaPlayer.play === 'function') {
                this._haptic();
                // keepOrder: true 保证全集严格按照第 1 到第 134 课时顺序展示在右侧播放抽屉
                global.AppleMediaPlayer.play(targetItem, playlist, { keepOrder: true });
            } else {
                this._toast('播放引擎尚未就绪，请稍后重试', 'error');
            }
        }

        // 渲染大盘 Bento 概览微件 (Today's Learning & Punch-in Bento Widget)
        renderDashboardWidget(containerSelectorOrEl = '#bento-study-widget') {
            const container = typeof containerSelectorOrEl === 'string'
                ? document.querySelector(containerSelectorOrEl)
                : containerSelectorOrEl;
            if (!container) return;

            if (!this.currentPlan) {
                container.innerHTML = `
                    <div class="bento-tile col-12" style="background:linear-gradient(135deg, rgba(10,132,255,0.08) 0%, rgba(94,92,230,0.06) 100%); border:1px solid rgba(10,132,255,0.22); cursor:pointer;" id="bento-empty-study-card">
                        <div class="tile-header">
                            <div class="tile-label"><span data-icon="plan"></span>今日学习与打卡</div>
                            <span class="apple-badge apple-badge-sm apple-badge-primary">待发布</span>
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:8px; flex-wrap:wrap;">
                            <div>
                                <div style="font-size:15px; font-weight:700; color:var(--apple-text-main);">暂未发布学习计划</div>
                                <div class="subtle" style="font-size:12px; margin-top:3px;">一键将本地教程目录智能排序排课并监督每日打卡</div>
                            </div>
                            <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-bento-go-plan" style="flex-shrink:0;">
                                ${this._icon('plus', 13)} 创建学习计划
                            </button>
                        </div>
                    </div>
                `;
                const btn = container.querySelector('#btn-bento-go-plan');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const planDock = document.querySelector('.dock-item[data-view="plan"]');
                        if (planDock) planDock.click();
                        setTimeout(() => this.openWizard(), 150);
                    });
                }
                const card = container.querySelector('#bento-empty-study-card');
                if (card) {
                    card.addEventListener('click', () => {
                        const planDock = document.querySelector('.dock-item[data-view="plan"]');
                        if (planDock) planDock.click();
                    });
                }
                return;
            }

            const plan = this.currentPlan;
            const record = this.currentRecord || { completedLessons: [], completedTasks: {}, streak: 0, punchInDates: [] };
            const completedCount = (record.completedLessons || []).length;
            const total = plan.totalLessons || (plan.lessons ? plan.lessons.length : 0);
            const percent = total > 0 ? Math.min(100, Math.round((completedCount / total) * 100)) : 0;
            const isPunchedToday = record.isPunchedToday;
            const streak = record.streak || 0;
            const nextLesson = (plan.lessons || []).find(l => !record.completedLessons.includes(l.index)) || plan.lessons[0];

            container.innerHTML = `
                <div class="bento-tile col-12" style="position:relative; overflow:hidden; background:linear-gradient(135deg, rgba(14,18,28,0.7) 0%, rgba(20,26,42,0.7) 100%);">
                    <div class="tile-header">
                        <div class="tile-label" style="display:flex; align-items:center; gap:6px;">
                            ${this._icon('plan', 15)} <b>今日学习与专注打卡</b>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="apple-badge apple-badge-sm" style="background:rgba(255,69,58,0.12); color:#ff453a; border:1px solid rgba(255,69,58,0.25);">
                                ${this._icon('flame', 12)} 连续 ${streak} 天
                            </span>
                            <span class="apple-badge apple-badge-sm ${isPunchedToday ? 'apple-badge-success' : 'apple-badge-warning'}">
                                <span class="apple-badge-dot"></span>${isPunchedToday ? '今日已打卡' : '今日待打卡'}
                            </span>
                        </div>
                    </div>

                    ${this.plans.length > 1 ? `
                        <div style="display:flex; gap:6px; margin:6px 0 8px 0; overflow-x:auto; padding-bottom:2px;" id="bento-plan-tabs">
                            ${this.plans.map(p => {
                                const isAct = p.id === plan.id;
                                return `
                                    <button type="button" class="apple-badge ${isAct ? 'apple-badge-primary' : 'apple-badge-glass'} bento-plan-tab-btn" data-plan-id="${p.id}" style="cursor:pointer; font-size:11px; padding:3px 9px; flex-shrink:0; font-weight:${isAct ? '700' : '500'}; outline:none; border-width:${isAct ? '1.5px' : '1px'};">
                                        ${p.title.length > 14 ? p.title.slice(0, 13) + '…' : p.title}
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}

                    <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin:10px 0 12px 0; flex-wrap:wrap;">
                        <div style="flex:1; min-width:200px;">
                            <div class="ellipsis" style="font-size:15.5px; font-weight:700; color:var(--apple-text-main);" title="${plan.title}">
                                ${plan.title}
                            </div>
                            <div class="subtle" style="font-size:12px; margin-top:3px;">
                                已学进度：<b>${completedCount} / ${total} 课时</b> (${percent}%) · 目标 ${plan.targetDays || 30} 天
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                            ${nextLesson ? `
                                <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-bento-resume-play" style="gap:5px;">
                                    ${this._icon('play', 12)} 继续第 ${nextLesson.index} 节
                                </button>
                            ` : ''}

                            <button class="apple-btn ${isPunchedToday ? 'apple-btn-glass' : 'apple-btn-primary'} apple-btn-sm" id="btn-bento-punch-in">
                                ${isPunchedToday ? (this._icon('check', 13) + ' 已打卡') : (this._icon('award', 13) + ' 打卡')}
                            </button>

                            <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-bento-goto-plan" title="查看完整学习日程">
                                全览 &gt;
                            </button>
                        </div>
                    </div>

                    <div class="apple-progress-track" style="height:6px; border-radius:999px;">
                        <div class="apple-progress-fill" style="width:${percent}%; background:linear-gradient(90deg, #007aff, #5856d6); border-radius:999px;"></div>
                    </div>
                </div>
            `;

            // 绑定微件按钮
            // 多计划标签切换
            const tabBtns = container.querySelectorAll('.bento-plan-tab-btn');
            tabBtns.forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const pid = btn.getAttribute('data-plan-id');
                    if (pid && (!this.currentPlan || pid !== this.currentPlan.id)) {
                        this._haptic();
                        await this.selectPlan(pid);
                        this.renderDashboardWidget(containerSelectorOrEl);
                        if (this.container) this.renderWorkspace();
                    }
                });
            });

            const resumeBtn = container.querySelector('#btn-bento-resume-play');
            if (resumeBtn && nextLesson) {
                resumeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.playLesson(nextLesson.index);
                });
            }

            const punchBtn = container.querySelector('#btn-bento-punch-in');
            if (punchBtn) {
                punchBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    this._haptic();
                    try {
                        const res = await fetch(this.getApiUrl('/api/study/punch-in') + this._authQuery(), {
                            method: 'POST',
                            headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({ planId: this.currentPlan.id })
                        });
                        const data = await res.json();
                        if (data.success) {
                            this._toast(data.message, 'success');
                            await this.selectPlan(this.currentPlan.id);
                            this.renderDashboardWidget(containerSelectorOrEl);
                            if (this.container) this.renderWorkspace();
                        } else {
                            this._toast(data.error || '打卡失败', 'error');
                        }
                    } catch (err) {
                        this._toast('打卡异常: ' + err.message, 'error');
                    }
                });
            }

            const gotoBtn = container.querySelector('#btn-bento-goto-plan');
            if (gotoBtn) {
                gotoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const planDock = document.querySelector('.dock-item[data-view="plan"]');
                    if (planDock) planDock.click();
                });
            }
        }
    }

    const instance = new StudyPlan();
    global.StudyPlanComponent = instance;

})(typeof window !== 'undefined' ? window : this);
