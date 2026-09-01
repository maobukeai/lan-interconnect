/**
 * 局域网互联 Pro - 文件上传与切片断点续传模块 (FileUploader)
 * 职责：大文件分片、秒传探测、实时传输速率计算及上传 HUD 状态呈现。
 */

(function (global) {
    'use strict';

    class FileUploader {
        constructor(config = {}) {
            this.progressContainer = typeof config.progressContainer === 'string' ? document.querySelector(config.progressContainer) : config.progressContainer;
            this.progressFill = typeof config.progressFill === 'string' ? document.querySelector(config.progressFill) : config.progressFill;
            this.progressText = typeof config.progressText === 'string' ? document.querySelector(config.progressText) : config.progressText;
            this.getPin = config.getPin || (() => localStorage.getItem('lan_disk_pin') || '');
            this.getApiUrl = config.getApiUrl || (url => url);
            this.onUploadComplete = config.onUploadComplete || null;
            // 单文件粒度状态回调：({name, size, percent, speed, state: 'uploading'|'merging'|'instant'|'done'|'error'})
            this.onFileStatus = config.onFileStatus || null;
            this._initWorker();
        }

        _initWorker() {
            if (typeof Worker === 'undefined') return;
            try {
                this.worker = new Worker('/shared/upload-worker.js');
                this.taskCallbacks = new Map();
                this.worker.onmessage = (e) => {
                    const { taskId, success, ...res } = e.data || {};
                    const cb = this.taskCallbacks.get(taskId);
                    if (cb) {
                        this.taskCallbacks.delete(taskId);
                        if (success) cb.resolve(res);
                        else cb.reject(new Error(res.error || 'Worker calculation failed'));
                    }
                };
            } catch (err) {
                this.worker = null;
            }
        }

        async _calculateFileMeta(file, chunkSize) {
            const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            if (this.worker) {
                return new Promise((resolve, reject) => {
                    this.taskCallbacks.set(taskId, { resolve, reject });
                    this.worker.postMessage({
                        action: 'calculate_hash',
                        taskId,
                        file,
                        chunkSize
                    });
                }).catch(() => this._fallbackCalculateMeta(file, chunkSize));
            }
            return this._fallbackCalculateMeta(file, chunkSize);
        }

        _fallbackCalculateMeta(file, chunkSize) {
            const safeName = (file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileHash = `${safeName}_${file.size}_${file.lastModified || 0}`;
            const totalChunks = Math.ceil(file.size / chunkSize);
            return Promise.resolve({
                fileHash,
                totalChunks,
                chunkSize,
                size: file.size,
                name: file.name
            });
        }

        _status(info) {
            if (this.onFileStatus) this.onFileStatus(info);
        }

        _toast(msg, type) {
            if (typeof global.LanDiskUI !== 'undefined' && global.LanDiskUI.toast) global.LanDiskUI.toast(msg, type);
        }

        _fmtSpeed(bps) {
            return bps > 1024 * 1024 ? (bps / 1024 / 1024).toFixed(1) + ' MB/s' : (bps / 1024).toFixed(1) + ' KB/s';
        }

        _authHeaders(extra) {
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.authHeaders) {
                return global.LanDiskAuth.authHeaders(extra);
            }
            const headers = extra ? Object.assign({}, extra) : {};
            headers['x-pin'] = this.getPin();
            return headers;
        }

        async uploadFiles(filesList, currentPath, isRoot) {
            if (!filesList || !filesList.length) return;
            if (isRoot || !currentPath || currentPath === '根目录') {
                this._toast('请先进入一个磁盘或文件夹再上传', 'info');
                return;
            }

            const files = Array.from(filesList);
            if (this.progressContainer) this.progressContainer.style.display = 'block';

            const uploadStartTime = Date.now();
            let totalBytesUploaded = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                let chunkSize = 2 * 1024 * 1024;
                if (file.size > 100 * 1024 * 1024) chunkSize = 8 * 1024 * 1024;
                else if (file.size > 10 * 1024 * 1024) chunkSize = 4 * 1024 * 1024;

                const meta = await this._calculateFileMeta(file, chunkSize);
                const fileHash = meta.fileHash;
                const totalChunks = meta.totalChunks;

                try {
                    // 1. 检查秒传 / 断点
                    const checkUrl = this.getApiUrl(`/api/upload/check?fileHash=${encodeURIComponent(fileHash)}&filename=${encodeURIComponent(file.name)}&path=${encodeURIComponent(currentPath)}`);
                    const checkRes = await fetch(checkUrl, { headers: this._authHeaders() });
                    if (!checkRes.ok) {
                        const errData = await checkRes.json().catch(() => ({}));
                        throw new Error(errData.error || `鉴权或参数校验失败 (HTTP ${checkRes.status})`);
                    }
                    const checkData = await checkRes.json();

                    if (checkData.exists) {
                        if (this.progressFill) this.progressFill.style.width = '100%';
                        if (this.progressText) {
                            this.progressText.innerHTML = `<span>${global.Icons ? global.Icons.render('sparkles', 13) : ''} [${(global.escapeHtml || String)(file.name)}] 极速秒传完成</span><span>100%</span>`;
                        }
                        this._status({ name: file.name, size: file.size, percent: 100, state: 'instant' });
                        await new Promise(r => setTimeout(r, 600));
                        continue;
                    }

                    const uploadedChunkIndices = new Set(checkData.uploadedChunkIndices || []);
                    this._status({ name: file.name, size: file.size, percent: 0, state: 'uploading', speed: '...' });

                    // 2. 上传未完成切片
                    for (let c = 0; c < totalChunks; c++) {
                        if (uploadedChunkIndices.has(c)) continue;

                        const start = c * chunkSize;
                        const end = Math.min(file.size, start + chunkSize);
                        const chunkBlob = file.slice(start, end);
                        const chunkSizeCurrent = end - start;

                        // 字段放在文件前面（multipart 顺序敏感场景更稳，服务端已兼容任意顺序）
                        const formData = new FormData();
                        formData.append('fileHash', fileHash);
                        formData.append('chunkIndex', c);
                        formData.append('totalChunks', totalChunks);
                        formData.append('chunk', chunkBlob);

                        const uploadUrl = this.getApiUrl('/api/upload/chunk');
                        const res = await fetch(uploadUrl, {
                            method: 'POST',
                            headers: this._authHeaders(),
                            body: formData
                        });

                        if (!res.ok) throw new Error(`分片 ${c} 上传失败`);

                        totalBytesUploaded += chunkSizeCurrent;
                        const elapsedTime = (Date.now() - uploadStartTime) / 1000;
                        const speedBytesPerSec = elapsedTime > 0 ? (totalBytesUploaded / elapsedTime) : 0;
                        const speedStr = this._fmtSpeed(speedBytesPerSec);

                        const percent = Math.round(((c + 1) / totalChunks) * 100);
                        if (this.progressFill) this.progressFill.style.width = percent + '%';
                        if (this.progressText) {
                            this.progressText.innerHTML = `<span>${global.Icons ? global.Icons.render('zap', 13) : ''} ${speedStr} | 上传 (${i + 1}/${files.length}): ${(global.escapeHtml || String)(file.name)}</span><span>${percent}%</span>`;
                        }
                        this._status({ name: file.name, size: file.size, percent, speed: speedStr, state: 'uploading' });
                    }

                    // 3. 请求后端合并分片
                    if (this.progressText) {
                        this.progressText.innerHTML = `<span>正在合并 ${(global.escapeHtml || String)(file.name)} ...</span><span>99%</span>`;
                    }
                    this._status({ name: file.name, size: file.size, percent: 99, state: 'merging' });
                    const mergeUrl = this.getApiUrl('/api/upload/merge');
                    const mergeRes = await fetch(mergeUrl, {
                        method: 'POST',
                        headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            fileHash: fileHash,
                            filename: file.name,
                            path: currentPath,
                            totalChunks: totalChunks
                        })
                    });

                    const mergeData = await mergeRes.json();
                    if (!mergeData.success) throw new Error(mergeData.error || '分片合并失败');
                    this._status({ name: file.name, size: file.size, percent: 100, state: 'done' });

                } catch (err) {
                    this._toast(`文件 [${file.name}] 上传失败: ${err.message}`, 'error');
                    this._status({ name: file.name, size: file.size, percent: 0, state: 'error', error: err.message });
                }
            }

            if (this.progressText) {
                this.progressText.innerHTML = `<span>${global.Icons ? global.Icons.render('check', 13) : ''} 所有文件上传完成</span><span>100%</span>`;
            }

            setTimeout(() => {
                if (this.progressContainer) this.progressContainer.style.display = 'none';
                if (this.onUploadComplete) this.onUploadComplete();
            }, 1000);
        }
    }

    global.FileUploader = FileUploader;

})(typeof window !== 'undefined' ? window : this);
