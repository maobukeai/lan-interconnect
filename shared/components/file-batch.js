/**
 * 局域网互联 Pro - 批量文件选择与 ZIP 打包下载模块 (FileBatchManager)
 * 职责：管理文件勾选集合、动态渲染底部玻璃质感悬浮操作条、请求后端生成 ZIP 打包下载。
 */

(function (global) {
    'use strict';

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
                <span style="font-size:13px; font-weight:600; color:white;">已选择 ${this.selectedFiles.size} 项</span>
                <button class="apple-btn apple-btn-primary" id="btn-batch-zip" style="padding:4px 12px; font-size:12px;">📦 打包下载 (ZIP)</button>
                <button class="apple-btn apple-btn-glass" id="btn-batch-cancel" style="padding:4px 10px; font-size:12px;">✕ 清空</button>
            `;

            document.getElementById('btn-batch-zip').onclick = () => this.downloadZip();
            document.getElementById('btn-batch-cancel').onclick = () => this.clear();
        }

        async downloadZip(customFilesArr = null, customFolderName = 'batch_download') {
            const filesArr = customFilesArr || Array.from(this.selectedFiles);
            if (!filesArr || filesArr.length === 0) return;

            const pin = this.getPin();

            try {
                const apiUrl = this.getApiUrl('/api/download/batch');
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                    body: JSON.stringify({ files: filesArr, folderName: customFolderName })
                });

                if (!res.ok) throw new Error('打包下载失败');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${customFolderName}_${Date.now()}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } catch (err) {
                alert('打包下载错误: ' + err.message);
            }
        }
    }

    global.FileBatchManager = FileBatchManager;

})(typeof window !== 'undefined' ? window : this);
