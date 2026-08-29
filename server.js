const express = require('express');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { state, generateQrToken, cleanupExpiredTokens, shouldCompress, getLocalIpAddress } = require('./server/config');
const { checkAuth, checkSensitive, isLocalRequest, isAllowedApiOrigin } = require('./server/middleware/auth');
const mdnsResponder = require('./server/services/mdns');
const trashService = require('./server/services/trash');

const devicesRouter = require('./server/routes/devices');
const chatRouter = require('./server/routes/chat');
const filesRouter = require('./server/routes/files');
const { router: uploadRouter, cleanupTempChunks } = require('./server/routes/upload');
const downloadRouter = require('./server/routes/download');
const systemRouter = require('./server/routes/system');
const toolsRouter = require('./server/routes/tools');
const historyRouter = require('./server/routes/history');
const speedtestRouter = require('./server/routes/speedtest');
const remoteRouter = require('./server/routes/remote');
const mediaRouter = require('./server/routes/media');

function startServer(config) {
    return new Promise(async (resolve, reject) => {
        await stopServer();
        state.currentConfig = Object.assign({}, state.currentConfig, config);
        
        const defaultSharedDir = path.join(os.homedir(), 'Downloads', 'LanDiskShared');
        state.sharedDir = state.currentConfig.customDir && fs.existsSync(state.currentConfig.customDir) 
            ? state.currentConfig.customDir 
            : defaultSharedDir;
            
        if (state.currentConfig.mode === 'shared' && !fs.existsSync(state.sharedDir)) {
            try {
                fs.mkdirSync(state.sharedDir, { recursive: true });
            } catch (err) {
                console.error("Failed to create SHARED_DIR", err);
            }
        }

        // 每次启动服务自动生成全新的安全扫码 Token
        const token = generateQrToken();

        const app = express();
        state.app = app;
        app.disable('x-powered-by');

        app.use(compression({ filter: shouldCompress }));
        // CORS 收紧：只对同机/本机/局域网来源（桌面端 file://、Capacitor http://localhost、
        // 私有网段网页互访）下发跨域头；互联网公网网页一律不下发，配合鉴权层的来源
        // 白名单，防止用户浏览器里的恶意网页 drive-by 读取/调用本机 API。
        app.use((req, res, next) => {
            const origin = req.headers.origin;
            if (origin && isAllowedApiOrigin(req)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-pin, x-qr-token, Range, Accept, x-requested-with, x-upload-dir, x-file-name, x-no-compression');
                res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
                res.setHeader('Access-Control-Max-Age', '600');
            }
            if (req.method === 'OPTIONS') {
                res.status(origin && !isAllowedApiOrigin(req) ? 403 : 204).end();
                return;
            }
            next();
        });
        app.use(express.json({ limit: '50mb' }));
        app.use(express.urlencoded({ limit: '50mb', extended: true }));

        // 计算实时网速的定时器
        if (state.statsInterval) clearInterval(state.statsInterval);
        state.statsInterval = setInterval(() => {
            const now = Date.now();
            const timeDiff = (now - state.lastStatsUpdate) / 1000;
            if (timeDiff > 0) {
                state.networkStats.rxSpeed = (state.networkStats.rxBytes - state.lastRxBytes) / timeDiff;
                state.networkStats.txSpeed = (state.networkStats.txBytes - state.lastTxBytes) / timeDiff;
            }
            state.lastRxBytes = state.networkStats.rxBytes;
            state.lastTxBytes = state.networkStats.txBytes;
            state.lastStatsUpdate = now;
        }, 1000);

        // 定期清理过期分享链接、离线设备、过期 Token、孤儿分片与超期回收站 (每 60 秒执行一次)
        if (state.autoCleanupInterval) clearInterval(state.autoCleanupInterval);
        state.autoCleanupInterval = setInterval(() => {
            const now = Date.now();
            Object.keys(state.sharedLinks).forEach(id => {
                if (state.sharedLinks[id] && state.sharedLinks[id].expiresAt < now) {
                    delete state.sharedLinks[id];
                }
            });
            for (const ip in state.connectedDevices) {
                if (now - state.connectedDevices[ip].lastSeen > 90 * 1000) {
                    delete state.connectedDevices[ip];
                }
            }
            cleanupExpiredTokens();
            cleanupTempChunks();
            trashService.cleanupExpired();
        }, 60000);

        // 流量统计中间件
        app.use((req, res, next) => {
            if (req.socket && !req.socket._hasRxTracker) {
                req.socket._hasRxTracker = true;
                req.socket.on('data', (chunk) => {
                    if (chunk) state.networkStats.rxBytes += chunk.length;
                });
            }

            if (res && !res._hasTxTracker) {
                res._hasTxTracker = true;
                const originalWrite = res.write;
                const originalEnd = res.end;
                
                res.write = function(chunk, encoding, callback) {
                    if (chunk) state.networkStats.txBytes += chunk.length;
                    return originalWrite.call(res, chunk, encoding, callback);
                };
                
                res.end = function(chunk, encoding, callback) {
                    if (chunk) state.networkStats.txBytes += chunk.length;
                    return originalEnd.call(res, chunk, encoding, callback);
                };
            }
            next();
        });

        const isPackaged = __dirname.includes('app.asar');
        const publicDir = isPackaged 
            ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'public') 
            : path.join(__dirname, 'public');
        const sharedDirStatic = isPackaged
            ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'shared')
            : path.join(__dirname, 'shared');
            
        // 主页禁止缓存（原先写在挂载于 /api 的 checkAuth 里，req.path 永远匹配不到根路径，从未生效）
        app.use((req, res, next) => {
            if (req.path === '/' || req.path === '/index.html') {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
            next();
        });
        app.use(express.static(publicDir));
        app.use('/shared', express.static(sharedDirStatic));
        app.use('/api', checkAuth);

        // 挂载敏感 API 保护中间件
        app.use('/api/terminal', checkSensitive);
        app.use('/api/processes', checkSensitive);
        app.use('/api/kill-process', checkSensitive);
        app.use('/api/clipboard', checkSensitive);
        app.use('/api/control/start', checkSensitive);
        app.use('/api/control/stop', checkSensitive);
        app.use('/api/tools/kick-devices', checkSensitive);
        app.use('/api/tools/kick-device', checkSensitive);
        app.use('/api/tools/block-ip', checkSensitive);
        app.use('/api/tools/unblock-ip', checkSensitive);
        app.use('/api/tools/set-device-alias', checkSensitive);
        app.use('/api/tools/clean-links', checkSensitive);
        app.use('/api/remote/power', checkSensitive);
        app.use('/api/remote/mouse', checkSensitive);
        // 音量与屏幕截屏同属敏感控制：截屏涉及隐私，免密模式下不应向局域网访客开放
        app.use('/api/remote/volume', checkSensitive);
        app.use('/api/remote/screen', checkSensitive);

        const QRCode = require('qrcode');

        app.post('/api/control/start', async (req, res) => {
            try {
                const config = req.body || {};
                // 先响应再重启：重启会销毁所有连接（包括当前请求自己的），
                // 若先 await startServer 会把响应写向已销毁的 socket 导致客户端收到连接重置
                res.json({ success: true, restarting: true });
                setTimeout(() => {
                    startServer(config).catch(err => console.error('[control/start] restart failed:', err.message));
                }, 200);
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        app.post('/api/control/stop', async (req, res) => {
            try {
                await stopServer();
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        app.get('/api/control/status', async (req, res) => {
            const ip = state.currentConfig.bindIp && state.currentConfig.bindIp !== '0.0.0.0'
                ? state.currentConfig.bindIp
                : getLocalIpAddress();
            const port = state.currentConfig.port || 3000;
            const serverUrl = `http://${ip}:${port}`;
            // 免密模式下扫码 Token 等同敏感接口通行证，仅向本机下发；
            // 否则任意局域网访客可借 qrUrl 中的 token 调用终端/剪贴板等接口
            const allowToken = !!state.currentConfig.pin || isLocalRequest(req);
            const qrUrl = (allowToken && state.qrToken) ? `${serverUrl}?token=${state.qrToken}` : serverUrl;
            let qrDataUrl = '';
            try { qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 300, margin: 1 }); } catch(e){}
            res.json({
                running: !!state.server,
                url: serverUrl,
                qrUrl,
                qrDataUrl,
                ip,
                port
            });
        });

        // 挂载路由模块（动态加载最新路由文件以支持热更新）
        app.use('/api', require('./server/routes/devices'));
        app.use('/api', require('./server/routes/chat'));
        app.use('/api', require('./server/routes/files'));
        app.use('/api', require('./server/routes/upload').router);
        app.use('/api', require('./server/routes/download'));
        app.use('/api', require('./server/routes/system'));
        app.use('/api', require('./server/routes/tools'));
        app.use('/api', require('./server/routes/history'));
        app.use('/api', require('./server/routes/speedtest'));
        app.use('/api', require('./server/routes/remote'));
        try { delete require.cache[require.resolve('./server/routes/media')]; } catch(e) {}
        app.use('/api', require('./server/routes/media'));

        const preferredPort = parseInt(state.currentConfig.port, 10) || 3000;
        const bindHost = state.currentConfig.bindIp || '0.0.0.0';

        const http = require('http');
        let currentPort = preferredPort;
        let attempts = 0;
        const maxAttempts = 50;

        function tryListen() {
            const server = http.createServer(app);
            state.server = server;
            
            server.on('connection', (socket) => {
                state.activeSockets.add(socket);
                socket.on('close', () => {
                    state.activeSockets.delete(socket);
                });
            });

            server.once('error', (err) => {
                if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && attempts < maxAttempts) {
                    attempts++;
                    const conflictPort = currentPort;
                    currentPort++;
                    console.warn(`[Port Conflict] 端口 ${conflictPort} 被占用，自动尝试切换至端口 ${currentPort}...`);
                    try { server.close(); } catch (e) {}
                    setTimeout(tryListen, 50);
                    return;
                }

                // 启动失败时清理已创建的定时器，避免泄漏
                if (state.statsInterval) {
                    clearInterval(state.statsInterval);
                    state.statsInterval = null;
                }
                if (state.autoCleanupInterval) {
                    clearInterval(state.autoCleanupInterval);
                    state.autoCleanupInterval = null;
                }
                reject(err);
            });

            server.once('listening', () => {
                state.currentConfig.port = currentPort;
                const ip = state.currentConfig.bindIp && state.currentConfig.bindIp !== '0.0.0.0' 
                    ? state.currentConfig.bindIp 
                    : getLocalIpAddress();

                // 启动局域网 mDNS 本地域名广播 (landisk.local)
                mdnsResponder.start(ip);

                console.log(`[Node Server] 服务已在 http://${ip}:${currentPort} 成功启动 (绑定: ${bindHost})`);
                resolve({
                    ip,
                    port: currentPort,
                    token,
                    fallbackFromPort: currentPort !== preferredPort ? preferredPort : null
                });
            });

            server.listen(currentPort, bindHost);
        }

        tryListen();
    });
}

function stopServer() {
    return new Promise((resolve) => {
        mdnsResponder.stop();

        if (state.statsInterval) {
            clearInterval(state.statsInterval);
            state.statsInterval = null;
        }
        if (state.autoCleanupInterval) {
            clearInterval(state.autoCleanupInterval);
            state.autoCleanupInterval = null;
        }
        
        state.sseClients.forEach(client => {
            try { client.res.end(); } catch (e) {}
        });
        state.sseClients = [];

        if (state.server) {
            for (const socket of state.activeSockets) {
                socket.destroy();
            }
            state.activeSockets.clear();

            state.server.close(() => {
                state.server = null;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

if (require.main === module) {
    startServer({}).then(({ ip, port }) => {
        console.log(`[Node Server] Running on http://${ip}:${port}`);
    }).catch(err => {
        console.error('[Node Server] Failed to start:', err);
    });
}

module.exports = {
    startServer,
    stopServer
};
