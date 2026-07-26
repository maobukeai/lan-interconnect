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
            if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
                const baseUrl = window.currentServerUrl || 'http://localhost:3000';
                return baseUrl.replace(/\/$/, '') + endpoint;
            }
            return endpoint;
        }

        async fetchProcesses() {
            this._ensureElements();
            try {
                const pin = this.getPin();
                const apiUrl = this.getApiUrl('/api/processes');
                const res = await fetch(apiUrl, { headers: { 'x-pin': pin } });

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

            this.container.innerHTML = groups.map((g, idx) => {
                const memMb = (g.totalMem / 1024 / 1024).toFixed(1);
                const safeName = escapeHtml(g.name) || '系统进程';
                const bgStyle = (idx % 2 === 0) ? 'background: rgba(255, 255, 255, 0.04);' : 'background: rgba(255, 255, 255, 0.02);';

                if (g.items.length === 1) {
                    const p = g.items[0];
                    return `
                        <div style="${bgStyle} border: none; border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; min-height: 46px; margin-bottom: 6px; box-sizing: border-box;">
                            <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:140px; overflow:hidden;">
                                <div style="width:30px; height:30px; border-radius:8px; background:rgba(0,122,255,0.12); color:var(--apple-system-blue); display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0;">💻</div>
                                <div style="flex:1; min-width:0; overflow:hidden;">
                                    <div style="font-weight:700; font-size:13px; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                        ${safeName}
                                        <span style="font-size:10px; font-weight:normal; color:var(--apple-text-subtle); margin-left:6px; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:6px;">PID: ${p.pid}</span>
                                    </div>
                                    <div style="font-size:11px; color:var(--apple-text-muted); margin-top:2px;">内存占用: <b style="color:var(--apple-system-purple);">${memMb} MB</b></div>
                                </div>
                            </div>
                            <button class="apple-btn apple-btn-danger btn-kill-proc" data-pid="${p.pid}" style="padding:4px 12px; font-size:11px; margin-left:10px; flex-shrink:0; border-radius:8px;">结束进程</button>
                        </div>
                    `;
                }

                return `
                    <div style="${bgStyle} border: none; border-radius: 10px; overflow: hidden; margin-bottom: 6px; box-sizing: border-box;">
                        <div style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; min-height: 46px;">
                            <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:140px; overflow:hidden;">
                                <div style="width:30px; height:30px; border-radius:8px; background:rgba(175,82,222,0.12); color:var(--apple-system-purple); display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0;">⚡</div>
                                <div style="flex:1; min-width:0; overflow:hidden;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <span style="font-weight:700; font-size:13px; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeName}</span>
                                        <span class="apple-badge apple-badge-info" style="font-size:10px; padding:2px 6px; border-radius:8px; flex-shrink:0;">${g.items.length} 个子进程</span>
                                    </div>
                                    <div style="font-size:11px; color:var(--apple-text-muted); margin-top:2px;">总内存: <b style="color:var(--apple-system-purple);">${memMb} MB</b></div>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; margin-left:10px;">
                                <button class="apple-btn apple-btn-glass btn-toggle-detail" data-target="group-detail-${idx}" style="padding:3px 8px; font-size:11px; border-radius:6px;">明细</button>
                                <button class="apple-btn apple-btn-danger btn-kill-group" data-pids="${g.pids.join(',')}" data-name="${safeName}" style="padding:3px 10px; font-size:11px; border-radius:6px;">结束全部 (${g.items.length})</button>
                            </div>
                        </div>
                        <div id="group-detail-${idx}" style="display:none; padding:10px 14px; background:rgba(0,0,0,0.3);">
                            <div style="display:flex; flex-wrap:wrap; gap:6px;">
                                ${g.items.map(p => `
                                    <div style="background:rgba(255,255,255,0.08); border-radius:16px; padding:3px 10px; display:inline-flex; align-items:center; gap:6px; font-size:11px;">
                                        <span style="color:var(--apple-text-muted);">PID <b style="color:white;">${p.pid}</b></span>
                                        <span style="color:var(--apple-system-purple); font-weight:600;">${(p.mem/1024/1024).toFixed(1)} MB</span>
                                        <button class="btn-kill-proc" data-pid="${p.pid}" style="border:none; background:rgba(255,59,48,0.2); color:#ff453a; border-radius:50%; width:16px; height:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:9px; font-weight:bold;" title="结束此 PID">✕</button>
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
                const pin = this.getPin();
                const apiUrl = this.getApiUrl('/api/kill-process');
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
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

            const pin = this.getPin();
            const apiUrl = this.getApiUrl('/api/kill-process');
            for (const pid of pids) {
                try {
                    await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                        body: JSON.stringify({ pid })
                    });
                } catch(e){}
            }
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
