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
        }

        async uploadFiles(filesList, currentPath, isRoot) {
            if (!filesList || !filesList.length) return;
            if (isRoot || !currentPath || currentPath === '根目录') {
                alert('请先进入一个磁盘或文件夹才能上传文件！');
                return;
            }

            const files = Array.from(filesList);
            if (this.progressContainer) this.progressContainer.style.display = 'block';

            const pin = this.getPin();
            const uploadStartTime = Date.now();
            let totalBytesUploaded = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileHash = `${file.name}_${file.size}_${file.lastModified}`;

                let chunkSize = 2 * 1024 * 1024;
                if (file.size > 100 * 1024 * 1024) chunkSize = 8 * 1024 * 1024;
                else if (file.size > 10 * 1024 * 1024) chunkSize = 4 * 1024 * 1024;

                const totalChunks = Math.ceil(file.size / chunkSize);

                try {
                    // 1. 检查秒传 / 断点
                    const checkUrl = this.getApiUrl(`/api/upload/check?fileHash=${encodeURIComponent(fileHash)}&filename=${encodeURIComponent(file.name)}&path=${encodeURIComponent(currentPath)}`);
                    const checkRes = await fetch(checkUrl, { headers: { 'x-pin': pin } });
                    const checkData = await checkRes.json();

                    if (checkData.exists) {
                        if (this.progressFill) this.progressFill.style.width = '100%';
                        if (this.progressText) {
                            this.progressText.innerHTML = `<span>⚡ [${file.name}] 极速秒传完成！</span><span>100%</span>`;
                        }
                        await new Promise(r => setTimeout(r, 600));
                        continue;
                    }

                    const uploadedChunkIndices = new Set(checkData.uploadedChunkIndices || []);

                    // 2. 上传未完成切片
                    for (let c = 0; c < totalChunks; c++) {
                        if (uploadedChunkIndices.has(c)) continue;

                        const start = c * chunkSize;
                        const end = Math.min(file.size, start + chunkSize);
                        const chunkBlob = file.slice(start, end);
                        const chunkSizeCurrent = end - start;

                        const formData = new FormData();
                        formData.append('chunk', chunkBlob);
                        formData.append('fileHash', fileHash);
                        formData.append('chunkIndex', c);
                        formData.append('totalChunks', totalChunks);

                        const uploadUrl = this.getApiUrl('/api/upload/chunk');
                        const res = await fetch(uploadUrl, {
                            method: 'POST',
                            headers: { 'x-pin': pin },
                            body: formData
                        });

                        if (!res.ok) throw new Error(`分片 ${c} 上传失败`);

                        totalBytesUploaded += chunkSizeCurrent;
                        const elapsedTime = (Date.now() - uploadStartTime) / 1000;
                        const speedBytesPerSec = elapsedTime > 0 ? (totalBytesUploaded / elapsedTime) : 0;
                        const speedStr = speedBytesPerSec > 1024 * 1024
                            ? (speedBytesPerSec / 1024 / 1024).toFixed(1) + ' MB/s'
                            : (speedBytesPerSec / 1024).toFixed(1) + ' KB/s';

                        const percent = Math.round(((c + 1) / totalChunks) * 100);
                        if (this.progressFill) this.progressFill.style.width = percent + '%';
                        if (this.progressText) {
                            this.progressText.innerHTML = `<span>⚡ ${speedStr} | 上传 (${i + 1}/${files.length}): ${file.name}</span><span>${percent}%</span>`;
                        }
                    }

                    // 3. 请求后端合并分片
                    if (this.progressText) {
                        this.progressText.innerHTML = `<span>正在合并文件 ${file.name}...</span><span>99%</span>`;
                    }
                    const mergeUrl = this.getApiUrl('/api/upload/merge');
                    const mergeRes = await fetch(mergeUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                        body: JSON.stringify({
                            fileHash: fileHash,
                            filename: file.name,
                            path: currentPath,
                            totalChunks: totalChunks
                        })
                    });

                    const mergeData = await mergeRes.json();
                    if (!mergeData.success) throw new Error(mergeData.error || '分片合并失败');

                } catch (err) {
                    alert(`文件 [${file.name}] 上传失败: ${err.message}`);
                }
            }

            if (this.progressText) {
                this.progressText.innerHTML = `<span>🎉 所有文件上传完成！</span><span>100%</span>`;
            }

            setTimeout(() => {
                if (this.progressContainer) this.progressContainer.style.display = 'none';
                if (this.onUploadComplete) this.onUploadComplete();
            }, 1000);
        }
    }

    global.FileUploader = FileUploader;

})(typeof window !== 'undefined' ? window : this);
