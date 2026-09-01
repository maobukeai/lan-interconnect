/**
 * 猫步互联 Pro - 上传辅助 Web Worker (upload-worker.js)
 * 在后台线程中执行文件分片与 Hash/指纹计算，防止超大文件（10GB+）拖拽时主线程掉帧卡顿。
 */

self.onmessage = async function (e) {
    const data = e.data || {};
    const { action, taskId, file, chunkSize = 4 * 1024 * 1024 } = data;

    if (action === 'calculate_hash') {
        try {
            const size = file.size;
            const name = file.name;
            const lastModified = file.lastModified || 0;

            // 快速指纹：包含文件元数据以及头部、中部、尾部采样
            const sampleSize = 64 * 1024;
            const chunks = [];
            
            // 采样首部
            chunks.push(file.slice(0, Math.min(sampleSize, size)));
            
            // 采样中部
            if (size > sampleSize * 2) {
                const mid = Math.floor(size / 2);
                chunks.push(file.slice(mid, mid + sampleSize));
            }
            
            // 采样尾部
            if (size > sampleSize) {
                chunks.push(file.slice(Math.max(0, size - sampleSize), size));
            }

            // 合并采样块
            let sampleBuffer = new Uint8Array(0);
            for (const chunk of chunks) {
                const buf = new Uint8Array(await chunk.arrayBuffer());
                const next = new Uint8Array(sampleBuffer.length + buf.length);
                next.set(sampleBuffer, 0);
                next.set(buf, sampleBuffer.length);
                sampleBuffer = next;
            }

            // 计算采样 SHA-256 摘要
            let sampleHash = '';
            if (self.crypto && self.crypto.subtle) {
                const hashBuf = await self.crypto.subtle.digest('SHA-256', sampleBuffer);
                const hashArr = Array.from(new Uint8Array(hashBuf));
                sampleHash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
            }

            // 格式化安全文件 Hash (防跨机碰撞)
            const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileHash = `${safeName}_${size}_${lastModified}${sampleHash ? '_' + sampleHash : ''}`;

            const totalChunks = Math.ceil(size / chunkSize);

            self.postMessage({
                taskId,
                success: true,
                fileHash,
                totalChunks,
                chunkSize,
                size,
                name
            });
        } catch (err) {
            self.postMessage({
                taskId,
                success: false,
                error: err.message
            });
        }
    }
};
