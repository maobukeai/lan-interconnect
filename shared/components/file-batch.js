/**
 * 局域网互联 Pro - 批量文件选择与 ZIP 打包下载模块 (FileBatchManager)
 * 职责：管理文件勾选集合、动态渲染底部玻璃质感悬浮操作条、请求后端生成 ZIP 打包下载。
 */

(function (global) {
    'use strict';

    const I = (name, size) => (global.Icons ? global.Icons.render(name, size) : '');

    class FileBatchManager {
        constructor(config = {}) {
            this.selectedFiles = new Set();
            this.getPin = config.getPin || (() => localStorage.getItem('lan_disk_pin') || '');
            this.getApiUrl = config.getApiUrl || (url => url);
            this.onSelectionChange = config.onSelectionChange || null;
        }

        clear() {
            this.selectedFiles.clear();
            this.updateBatchBar();
            if (this.onSelectionChange) this.onSelectionChange(this.selectedFiles);
        }

        has(path) {
            return this.selectedFiles.has(path);
        }

        add(path) {
            this.selectedFiles.add(path);
            this.updateBatchBar();
            if (this.onSelectionChange) this.onSelectionChange(this.selectedFiles);
        }

        delete(path) {
            this.selectedFiles.delete(path);
            this.updateBatchBar();
            if (this.onSelectionChange) this.onSelectionChange(this.selectedFiles);
        }

        toggle(path) {
            if (this.selectedFiles.has(path)) {
                this.selectedFiles.delete(path);
            } else {
                this.selectedFiles.add(path);
            }
            this.updateBatchBar();
            if (this.onSelectionChange) this.onSelectionChange(this.selectedFiles);
        }

        updateBatchBar() {
            let bar = document.getElementById('apple-floating-batch-bar');
            if (this.selectedFiles.size === 0) {
                if (bar) bar.style.display = 'none';
                return;
            }

            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'apple-floating-batch-bar';
                bar.className = 'apple-floating-batch-bar';
                document.body.appendChild(bar);
            }

            bar.style.display = 'flex';
            bar.innerHTML = `
                <span style="font-size:13px; font-weight:600; color:var(--apple-text-main)">已选择 ${this.selectedFiles.size} 项</span>
                <button class="apple-btn apple-btn-primary apple-btn-sm" id="btn-batch-zip">${I('package', 14)} 打包下载 (ZIP)</button>
                <button class="apple-btn apple-btn-danger apple-btn-sm" id="btn-batch-delete-float">${I('trash', 13)} 批量删除</button>
                <button class="apple-btn apple-btn-glass apple-btn-sm" id="btn-batch-cancel">${I('close', 12)} 清空</button>
            `;

            document.getElementById('btn-batch-zip').onclick = () => this.downloadZip();
            document.getElementById('btn-batch-delete-float').onclick = () => this.deleteBatch();
            document.getElementById('btn-batch-cancel').onclick = () => this.clear();
        }

        async deleteBatch() {
            const filesArr = Array.from(this.selectedFiles);
            if (!filesArr || filesArr.length === 0) return;

            const ui = global.LanDiskUI;
            const ok = ui && ui.confirmDialog
                ? await ui.confirmDialog({
                    title: '批量移入回收站',
                    message: `确定要将选中的 ${filesArr.length} 个文件/文件夹移入回收站吗？`,
                    confirmText: '批量删除',
                    danger: true
                })
                : confirm(`确定要将选中的 ${filesArr.length} 个文件移入回收站吗？`);

            if (!ok) return;

            let succ = 0;
            for (const fPath of filesArr) {
                try {
                    const res = await fetch(this.getApiUrl(`/api/files?path=${encodeURIComponent(fPath)}`), {
                        method: 'DELETE',
                        headers: this._authHeaders()
                    });
                    const d = await res.json().catch(() => ({}));
                    if (d.success) succ++;
                } catch (e) {}
            }

            this.clear();
            if (ui && ui.toast) {
                ui.toast(`已将 ${succ} 项移入回收站`, 'success');
            }
            if (global.FileExplorerComponent && typeof global.FileExplorerComponent.refresh === 'function') {
                global.FileExplorerComponent.refresh();
            }
        }

        _authHeaders(extra) {
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.authHeaders) {
                return global.LanDiskAuth.authHeaders(extra);
            }
            const headers = extra ? Object.assign({}, extra) : {};
            headers['x-pin'] = this.getPin();
            return headers;
        }

        downloadZip(customFilesArr = null, customFolderName = 'batch_download') {
            let filesArr = customFilesArr || Array.from(this.selectedFiles);
            if (!filesArr) return;
            if (typeof filesArr === 'string') {
                filesArr = [filesArr];
            } else if (filesArr instanceof Set) {
                filesArr = Array.from(filesArr);
            } else if (!Array.isArray(filesArr)) {
                try { filesArr = Array.from(filesArr); } catch (e) { filesArr = [filesArr]; }
            }
            filesArr = filesArr.filter(f => typeof f === 'string' && f.trim());
            if (filesArr.length === 0) return;

            try {
                let authQ = '';
                if (window.LanDiskAuth && typeof window.LanDiskAuth.authQuery === 'function') {
                    const q = window.LanDiskAuth.authQuery();
                    if (q) authQ = q.replace(/^\?/, '&');
                }
                const pin = this.getPin();
                if (pin && !authQ.includes('pin=')) {
                    authQ += '&pin=' + encodeURIComponent(pin);
                }

                const apiUrl = this.getApiUrl('/api/download/batch') + (authQ ? ('?' + authQ.replace(/^&/, '')) : '');

                // 原生 Form POST 流式下载：无需将数 GB 的 ZIP 二进制 Blob 驻留于 JS 堆内存中，
                // 挂载独立隐藏 iframe 作为 target，既不刷新/离开当前页面，又能直接由浏览器内核落盘到下载目录
                let iframe = document.getElementById('hidden_batch_download_frame');
                if (!iframe) {
                    iframe = document.createElement('iframe');
                    iframe.id = 'hidden_batch_download_frame';
                    iframe.name = 'hidden_batch_download_frame';
                    iframe.style.display = 'none';
                    document.body.appendChild(iframe);
                }

                const form = document.createElement('form');
                form.method = 'POST';
                form.action = apiUrl;
                form.target = 'hidden_batch_download_frame';
                form.style.display = 'none';

                const inputFolder = document.createElement('input');
                inputFolder.type = 'hidden';
                inputFolder.name = 'folderName';
                inputFolder.value = customFolderName;
                form.appendChild(inputFolder);

                filesArr.forEach(f => {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = 'files';
                    input.value = f;
                    form.appendChild(input);
                });

                if (pin) {
                    const inputPin = document.createElement('input');
                    inputPin.type = 'hidden';
                    inputPin.name = 'pin';
                    inputPin.value = pin;
                    form.appendChild(inputPin);
                }

                document.body.appendChild(form);
                form.submit();
                setTimeout(() => {
                    if (form.parentNode) document.body.removeChild(form);
                }, 3000);

                if (typeof global.LanDiskUI !== 'undefined' && global.LanDiskUI.toast) {
                    global.LanDiskUI.toast('正在流式打包并开始下载...', 'info');
                }
            } catch (err) {
                if (typeof global.LanDiskUI !== 'undefined' && global.LanDiskUI.toast) global.LanDiskUI.toast('打包下载错误: ' + err.message, 'error');
                else alert('打包下载错误: ' + err.message);
            }
        }
    }

    global.FileBatchManager = FileBatchManager;

})(typeof window !== 'undefined' ? window : this);
