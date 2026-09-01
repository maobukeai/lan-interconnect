/**
 * 局域网互联 Pro - 进程监控组件 (ProcessMonitor)
 * 职责：获取系统进程列表、按应用智能合并多进程、多维排序、关键字搜索与结束 PID / 批量进程。
 * 遵循无全局变量污染、高扩展性设计。
 */

(function (global) {
    'use strict';

    class ProcessMonitor {
        constructor(config = {}) {
            this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
            this.searchInput = typeof config.searchInput === 'string' ? document.querySelector(config.searchInput) : config.searchInput;

            this.getPin = config.getPin || (() => typeof localStorage !== 'undefined' ? (localStorage.getItem('lan_disk_pin') || '') : '');

            this.processes = [];
            this.sortKey = 'mem';
            this.searchQuery = '';
            this.autoRefreshTimer = null;

            this._ensureElements();
        }

        _ensureElements() {
            if (!this.container) {
                this.container = document.querySelector('#process-list') || document.querySelector('#pc-proc-list');
            }
            if (!this.searchInput) {
                this.searchInput = document.querySelector('#process-search') || document.querySelector('#pc-process-search');
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

        // 可见时每 3.5 秒自动刷新（服务端有缓存，开销极小）；展开明细或页面隐藏时跳过
        startAutoRefresh() {
            if (this.autoRefreshTimer) return;
            this.autoRefreshTimer = setInterval(async () => {
                if (document.hidden || !this.container || !this.container.isConnected) return;
                if (this.container.offsetParent === null) return; // 所在视图未激活
                if (this.container.querySelector('div[id^="group-detail-"][style*="display: block"]')) return; // 用户正在看明细
                try {
                    const st = this.container.scrollTop;
                    await this.fetchProcesses();
                    this.container.scrollTop = st; // 保持滚动位置
                } catch (e) {}
            }, 3500);
        }

        async fetchProcesses() {
            this._ensureElements();
            try {
                const apiUrl = this.getApiUrl('/api/processes');
                const res = await fetch(apiUrl, { headers: this._authHeaders() });

                if (res.status === 403) {
                    const data = await res.json().catch(() => ({}));
                    if (this.container) {
                        this.container.innerHTML = `<div style="padding:24px; text-align:center; color:var(--apple-text-muted); font-size:13px;">🔒 ${data.error || '免密模式下敏感操作仅限本机访问，请设置 PIN 密码'}</div>`;
                    }
                    return;
                }

                if (res.status === 401) {
                    if (this.container) {
                        this.container.innerHTML = '<div style="padding:24px; text-align:center; color:var(--apple-text-muted); font-size:13px;">🔒 请在首页输入访问 PIN 密码验证身份后再试</div>';
                    }
                    return;
                }

                if (!res.ok) throw new Error('无法读取进程数据');
                this.processes = await res.json();
                this.renderProcesses();
            } catch (err) {
                if (this.container) {
                    this.container.innerHTML = `<div style="padding:24px; text-align:center; color:var(--apple-text-muted); font-size:13px;">进程监控数据获取失败: ${err.message}</div>`;
                }
            }
        }

        filterProcesses(keyword) {
            this.searchQuery = (keyword || '').toLowerCase().trim();
            this.renderProcesses();
        }

        renderProcesses() {
            this._ensureElements();
            if (!this.container) return;

            const query = this.searchQuery;
            let filtered = this.processes.filter(p => {
                if (!p || !p.name || !p.name.trim()) return false;
                const matchesQuery = !query || p.name.toLowerCase().includes(query) || String(p.pid).includes(query);
                return matchesQuery;
            });

            const appGroups = {};
            for (const p of filtered) {
                const key = p.name.toLowerCase();
                if (!appGroups[key]) {
                    appGroups[key] = { name: p.name, totalMem: 0, pids: [], items: [] };
                }
                appGroups[key].totalMem += p.mem;
                appGroups[key].pids.push(p.pid);
                appGroups[key].items.push(p);
            }

            let groups = Object.values(appGroups);
            groups.sort((a, b) => {
                if (this.sortKey === 'mem') return b.totalMem - a.totalMem;
                if (this.sortKey === 'name') return a.name.localeCompare(b.name, 'zh-CN');
                return b.items.length - a.items.length;
            });

            if (!query && groups.length > 35) {
                groups = groups.slice(0, 35);
            }

            if (!groups.length) {
                this.container.innerHTML = '<div style="padding:30px; text-align:center; color:var(--apple-text-muted); font-size:13px;">暂无匹配的运行进程</div>';
                return;
            }

            const escapeHtml = str => typeof str === 'string' ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : str;
            const I = (n, s) => (global.Icons ? global.Icons.render(n, s) : '');

            this.container.innerHTML = groups.map((g, idx) => {
                const memMb = (g.totalMem / 1024 / 1024).toFixed(1);
                const safeName = escapeHtml(g.name) || '系统进程';

                if (g.items.length === 1) {
                    const p = g.items[0];
                    return `
                        <div class="proc-item-card">
                            <div class="proc-item-main">
                                <div class="proc-item-left">
                                    <div class="proc-item-icon">${I('cpu', 16)}</div>
                                    <div class="proc-item-meta">
                                        <div class="proc-item-title-row">
                                            <span class="proc-item-name" title="${safeName}">${safeName}</span>
                                            <span class="proc-item-pid-tag">PID: ${p.pid}</span>
                                        </div>
                                        <div class="proc-item-sub-row">
                                            <span>内存占用: <b class="proc-item-mem">${memMb} MB</b></span>
                                        </div>
                                    </div>
                                </div>
                                <div class="proc-item-actions">
                                    <button class="proc-btn-danger btn-kill-proc" data-pid="${p.pid}">结束</button>
                                </div>
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="proc-item-card">
                        <div class="proc-item-main">
                            <div class="proc-item-left">
                                <div class="proc-item-icon multi">${I('zap', 16)}</div>
                                <div class="proc-item-meta">
                                    <div class="proc-item-title-row">
                                        <span class="proc-item-name" title="${safeName}">${safeName}</span>
                                        <span class="proc-item-badge">${g.items.length} 个进程</span>
                                    </div>
                                    <div class="proc-item-sub-row">
                                        <span>总内存: <b class="proc-item-mem">${memMb} MB</b></span>
                                    </div>
                                </div>
                            </div>
                            <div class="proc-item-actions">
                                <button class="proc-btn-detail btn-toggle-detail" data-target="group-detail-${idx}">明细</button>
                                <button class="proc-btn-danger btn-kill-group" data-pids="${g.pids.join(',')}" data-name="${safeName}">结束 (${g.items.length})</button>
                            </div>
                        </div>
                        <div id="group-detail-${idx}" class="proc-group-detail" style="display:none;">
                            <div class="proc-detail-pill-grid">
                                ${g.items.map(p => `
                                    <div class="proc-detail-pill">
                                        <span class="proc-detail-pid">PID <b>${p.pid}</b></span>
                                        <span class="proc-detail-mem">${(p.mem/1024/1024).toFixed(1)} MB</span>
                                        <button class="btn-kill-proc proc-detail-del-btn" data-pid="${p.pid}" title="结束此 PID">${I('close', 8)}</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            this.container.querySelectorAll('.btn-kill-proc').forEach(btn => {
                btn.addEventListener('click', () => {
                    const pid = parseInt(btn.getAttribute('data-pid'));
                    this.killProcess(pid);
                });
            });

            this.container.querySelectorAll('.btn-toggle-detail').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetId = btn.getAttribute('data-target');
                    const targetEl = document.getElementById(targetId);
                    if (targetEl) {
                        targetEl.style.display = targetEl.style.display === 'none' ? 'block' : 'none';
                    }
                });
            });

            this.container.querySelectorAll('.btn-kill-group').forEach(btn => {
                btn.addEventListener('click', () => {
                    const pids = btn.getAttribute('data-pids').split(',').map(n => parseInt(n));
                    const name = btn.getAttribute('data-name');
                    this.killGroup(pids, name);
                });
            });
        }

        async killProcess(pid) {
            if (!confirm(`确定要结束 PID 为 ${pid} 的进程吗？`)) return;

            try {
                const apiUrl = this.getApiUrl('/api/kill-process');
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ pid })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    alert('结束进程失败: ' + (data.error || res.statusText));
                } else {
                    this.fetchProcesses();
                }
            } catch (err) {
                alert('结束进程抛出异常: ' + err.message);
            }
        }

        async killGroup(pids, appName) {
            if (!confirm(`确定结束应用「${appName}」的所有 ${pids.length} 个子进程吗？`)) return;

            const apiUrl = this.getApiUrl('/api/kill-process');
            for (const pid of pids) {
                try {
                    await fetch(apiUrl, {
                        method: 'POST',
                        headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ pid })
                    });
                } catch(e){}
            }
            this.fetchProcesses();
        }

        stopAutoRefresh() {
            if (this.autoRefreshTimer) {
                clearInterval(this.autoRefreshTimer);
                this.autoRefreshTimer = null;
            }
        }

        destroy() {
            this.stopAutoRefresh();
            this.processes = [];
        }

        refresh() {
            this.fetchProcesses();
        }
    }

    let instance = null;

    function getOrCreateInstance(containerId) {
        if (!instance) {
            instance = new ProcessMonitor({
                container: typeof containerId === 'string' ? '#' + containerId : (containerId || '#process-list'),
                searchInput: '#process-search'
            });
        }
        return instance;
    }

    ProcessMonitor.load = function(containerId) {
        const inst = getOrCreateInstance(containerId);
        inst.fetchProcesses();
        inst.startAutoRefresh();
    };

    ProcessMonitor.stop = function() {
        if (instance) instance.stopAutoRefresh();
    };

    ProcessMonitor.filter = function(keyword) {
        const inst = getOrCreateInstance();
        inst.filterProcesses(keyword);
    };

    ProcessMonitor.kill = function(pid) {
        const inst = getOrCreateInstance();
        inst.killProcess(pid);
    };

    global.ProcessMonitorComponent = ProcessMonitor;

})(typeof window !== 'undefined' ? window : this);
