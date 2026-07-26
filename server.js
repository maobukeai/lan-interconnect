const express = require('express');
const compression = require('compression');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { state, generateQrToken, shouldCompress, getLocalIpAddress } = require('./server/config');
const { checkAuth, checkSensitive } = require('./server/middleware/auth');
const mdnsResponder = require('./server/services/mdns');

const devicesRouter = require('./server/routes/devices');
const chatRouter = require('./server/routes/chat');
const filesRouter = require('./server/routes/files');
const uploadRouter = require('./server/routes/upload');
const downloadRouter = require('./server/routes/download');
const systemRouter = require('./server/routes/system');
const toolsRouter = require('./server/routes/tools');

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

        app.use(compression({ filter: shouldCompress }));
        app.use(cors());
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

        // 定期清理过期分享链接与离线设备 (每 60 秒执行一次)
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
        }, 60000);

        // 流量统计中间件
        app.use((req, res, next) => {
            if (req.socket) {
                const rxTracker = () => {
                    state.networkStats.rxBytes += req.socket.bytesRead - (req.socket._lastRx || 0);
                    req.socket._lastRx = req.socket.bytesRead;
                };
                req.socket.on('data', rxTracker);
                
                const originalWrite = res.write;
                const originalEnd = res.end;
                
                res.write = function(chunk, encoding, callback) {
                    if (chunk) state.networkStats.txBytes += chunk.length;
                    originalWrite.call(res, chunk, encoding, callback);
                };
                
                res.end = function(chunk, encoding, callback) {
                    if (chunk) state.networkStats.txBytes += chunk.length;
                    originalEnd.call(res, chunk, encoding, callback);
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
            
        app.use(express.static(publicDir));
        app.use('/shared', express.static(sharedDirStatic));
        app.use('/api', checkAuth);

        // 挂载敏感 API 保护中间件
        app.use('/api/terminal', checkSensitive);
        app.use('/api/processes', checkSensitive);
        app.use('/api/kill-process', checkSensitive);
        app.use('/api/tools/kick-devices', checkSensitive);
        app.use('/api/tools/kick-device', checkSensitive);
        app.use('/api/tools/block-ip', checkSensitive);
        app.use('/api/tools/unblock-ip', checkSensitive);
        app.use('/api/tools/set-device-alias', checkSensitive);
        app.use('/api/tools/clean-links', checkSensitive);

        // 挂载路由模块
        app.use('/api', devicesRouter);
        app.use('/api', chatRouter);
        app.use('/api', filesRouter);
        app.use('/api', uploadRouter);
        app.use('/api', downloadRouter);
        app.use('/api', systemRouter);
        app.use('/api', toolsRouter);

        const targetPort = state.currentConfig.port || 3000;
        const bindHost = state.currentConfig.bindIp || '0.0.0.0';

        const http = require('http');
        state.server = http.createServer(app);
        
        state.server.on('connection', (socket) => {
            state.activeSockets.add(socket);
            socket.on('close', () => {
                state.activeSockets.delete(socket);
            });
        });

        state.server.listen(targetPort, bindHost, () => {
            const ip = state.currentConfig.bindIp && state.currentConfig.bindIp !== '0.0.0.0' 
                ? state.currentConfig.bindIp 
                : getLocalIpAddress();

            // 启动局域网 mDNS 本地域名广播 (landisk.local)
            mdnsResponder.start(ip);

            resolve({ ip, port: targetPort, token });
        });

        state.server.on('error', (err) => {
            reject(err);
        });
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

module.exports = {
    startServer,
    stopServer
};
