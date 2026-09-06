/**
 * 猫步互联 - DLNA / UPnP 智能电视投屏服务
 * 1. 基于 SSDP (UDP 1900) 局域网广播自动发现 DLNA / UPnP MediaRenderer (电视/投影仪/盒子)
 * 2. 解析设备 XML 描述，提取 AVTransport 控制端点与设备名称
 * 3. 通过标准 SOAP 协议下发 SetAVTransportURI / Play / Pause / Stop / Seek 指令
 */

const dgram = require('dgram');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
const DISCOVERY_CACHE_TTL = 120000; // 2 分钟设备缓存

function escapeXml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

class DlnaService {
    constructor() {
        this.devices = new Map(); // id -> device
        this.socket = null;
        this.isScanning = false;
        this.scanTimeout = null;
    }

    /**
     * 发现局域网内的 DLNA 渲染设备
     * @param {number} timeoutMs 扫描等待时间（默认 3000ms）
     * @returns {Promise<Array>} 设备列表
     */
    async discover(timeoutMs = 3000) {
        this.cleanExpired();
        await this._sendSsdpSearch();

        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(this.getDevices());
            }, timeoutMs);
        });
    }

    getDevices() {
        this.cleanExpired();
        return Array.from(this.devices.values()).map(d => ({
            id: d.id,
            name: d.name,
            location: d.location,
            ip: d.ip,
            manufacturer: d.manufacturer || ''
        }));
    }

    cleanExpired() {
        const now = Date.now();
        for (const [id, dev] of this.devices.entries()) {
            if (now - dev.lastSeen > DISCOVERY_CACHE_TTL) {
                this.devices.delete(id);
            }
        }
    }

    _ensureSocket() {
        if (this.socket) return;

        try {
            const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            socket.on('message', (msg, rinfo) => {
                this._handleSsdpMessage(msg.toString('utf8'), rinfo);
            });

            socket.on('error', (err) => {
                console.warn('[DLNA SSDP] Socket error:', err.message);
                try { socket.close(); } catch (e) {}
                this.socket = null;
            });

            socket.bind(0, () => {
                try {
                    socket.addMembership(SSDP_ADDRESS);
                } catch (e) {}
            });

            this.socket = socket;
        } catch (e) {
            console.warn('[DLNA SSDP] Failed to bind UDP socket:', e.message);
        }
    }

    async _sendSsdpSearch() {
        this._ensureSocket();
        if (!this.socket) return;

        const targets = [
            'urn:schemas-upnp-org:service:AVTransport:1',
            'urn:schemas-upnp-org:device:MediaRenderer:1'
        ];

        targets.forEach(st => {
            const searchMsg = Buffer.from(
                'M-SEARCH * HTTP/1.1\r\n' +
                `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\n` +
                'MAN: "ssdp:discover"\r\n' +
                'MX: 3\r\n' +
                `ST: ${st}\r\n` +
                '\r\n'
            );

            try {
                this.socket.send(searchMsg, 0, searchMsg.length, SSDP_PORT, SSDP_ADDRESS);
            } catch (e) {}
        });
    }

    _handleSsdpMessage(msg, rinfo) {
        const lines = msg.split('\r\n');
        const headers = {};
        for (const line of lines) {
            const idx = line.indexOf(':');
            if (idx > 0) {
                const key = line.slice(0, idx).trim().toUpperCase();
                const val = line.slice(idx + 1).trim();
                headers[key] = val;
            }
        }

        const location = headers['LOCATION'];
        const usn = headers['USN'] || location;
        if (!location) return;

        // 如果该 location 已存在且未过期，刷新时间即可
        const existing = Array.from(this.devices.values()).find(d => d.location === location);
        if (existing) {
            existing.lastSeen = Date.now();
            return;
        }

        this._fetchDeviceXml(location, usn, rinfo.address);
    }

    async _fetchDeviceXml(locationUrl, usn, remoteIp) {
        try {
            const xml = await this._httpGet(locationUrl, 4000);
            if (!xml) return;

            // 提取 <friendlyName>
            const friendlyNameMatch = xml.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
            const name = friendlyNameMatch ? friendlyNameMatch[1].trim() : `DLNA 电视 (${remoteIp})`;

            // 提取 <manufacturer>
            const mfgMatch = xml.match(/<manufacturer>([^<]+)<\/manufacturer>/i);
            const manufacturer = mfgMatch ? mfgMatch[1].trim() : '';

            // 提取 AVTransport controlURL
            let controlUrl = null;
            const serviceRegex = /<service>([\s\S]*?)<\/service>/gi;
            let match;
            while ((match = serviceRegex.exec(xml)) !== null) {
                const serviceBlock = match[1];
                if (/AVTransport:1/i.test(serviceBlock)) {
                    const ctrlMatch = serviceBlock.match(/<controlURL>([^<]+)<\/controlURL>/i);
                    if (ctrlMatch) {
                        controlUrl = ctrlMatch[1].trim();
                        break;
                    }
                }
            }

            if (!controlUrl) return;

            const resolvedControlUrl = new URL(controlUrl, locationUrl).href;
            const deviceId = usn ? usn.split('::')[0] : locationUrl;

            this.devices.set(deviceId, {
                id: deviceId,
                name,
                manufacturer,
                location: locationUrl,
                controlUrl: resolvedControlUrl,
                ip: remoteIp,
                lastSeen: Date.now()
            });
        } catch (e) {}
    }

    _httpGet(targetUrl, timeoutMs = 4000) {
        return new Promise((resolve) => {
            try {
                const u = new URL(targetUrl);
                const client = u.protocol === 'https:' ? https : http;
                const req = client.get(targetUrl, { timeout: timeoutMs }, (res) => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        res.resume();
                        return resolve(null);
                    }
                    let data = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => resolve(data));
                });
                req.on('error', () => resolve(null));
                req.on('timeout', () => { req.destroy(); resolve(null); });
            } catch (e) {
                resolve(null);
            }
        });
    }

    async _sendSoapAction(controlUrl, action, argsXml) {
        const serviceType = 'urn:schemas-upnp-org:service:AVTransport:1';
        const body =
            '<?xml version="1.0" encoding="utf-8"?>\r\n' +
            '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\r\n' +
            '  <s:Body>\r\n' +
            `    <u:${action} xmlns:u="${serviceType}">\r\n` +
            '      <InstanceID>0</InstanceID>\r\n' +
            (argsXml || '') +
            `    </u:${action}>\r\n` +
            '  </s:Body>\r\n' +
            '</s:Envelope>';

        return new Promise((resolve, reject) => {
            try {
                const u = new URL(controlUrl);
                const client = u.protocol === 'https:' ? https : http;
                const req = client.request(controlUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/xml; charset="utf-8"',
                        'Content-Length': Buffer.byteLength(body),
                        'SOAPAction': `"${serviceType}#${action}"`
                    },
                    timeout: 8000
                }, (res) => {
                    let resData = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => { resData += chunk; });
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ success: true, status: res.statusCode, data: resData });
                        } else {
                            resolve({ success: false, status: res.statusCode, error: `SOAP error: ${res.statusCode}`, detail: resData });
                        }
                    });
                });

                req.on('error', (err) => reject(err));
                req.on('timeout', () => { req.destroy(); reject(new Error('SOAP 请求超时')); });
                req.write(body);
                req.end();
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * 向目标电视设备推送视频流并播放
     */
    async castPlay(deviceId, videoUrl, title = '猫步互联投屏') {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error('未找到该投屏设备或设备已离线');
        }

        const escapedTitle = escapeXml(title);
        const escapedUrl = escapeXml(videoUrl);

        const didl = `&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;&lt;item id="0" parentID="-1" restricted="1"&gt;&lt;dc:title&gt;${escapedTitle}&lt;/dc:title&gt;&lt;upnp:class&gt;object.item.videoItem&lt;/upnp:class&gt;&lt;res protocolInfo="http-get:*:video/*:*"&gt;${escapedUrl}&lt;/res&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;`;

        const setUriArgs =
            `      <CurrentURI>${escapedUrl}</CurrentURI>\r\n` +
            `      <CurrentURIMetaData>${didl}</CurrentURIMetaData>\r\n`;

        const setRes = await this._sendSoapAction(device.controlUrl, 'SetAVTransportURI', setUriArgs);
        if (!setRes.success) {
            console.warn('[DLNA] SetAVTransportURI failed:', setRes);
        }

        const playArgs = '      <Speed>1</Speed>\r\n';
        return await this._sendSoapAction(device.controlUrl, 'Play', playArgs);
    }

    /**
     * 控制播放（pause, play, stop）
     */
    async control(deviceId, action) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error('设备不存在或已离线');
        }

        if (action === 'pause') {
            return await this._sendSoapAction(device.controlUrl, 'Pause', '');
        } else if (action === 'play') {
            return await this._sendSoapAction(device.controlUrl, 'Play', '      <Speed>1</Speed>\r\n');
        } else if (action === 'stop') {
            return await this._sendSoapAction(device.controlUrl, 'Stop', '');
        } else {
            throw new Error('不支持的控制动作: ' + action);
        }
    }

    /**
     * 跳转进度
     * @param {string} deviceId
     * @param {string} targetTime 格式 HH:MM:SS
     */
    async seek(deviceId, targetTime) {
        const device = this.devices.get(deviceId);
        if (!device) throw new Error('设备不存在');

        const seekArgs =
            '      <Unit>REL_TIME</Unit>\r\n' +
            `      <Target>${escapeXml(targetTime)}</Target>\r\n`;
        return await this._sendSoapAction(device.controlUrl, 'Seek', seekArgs);
    }

    destroy() {
        if (this.socket) {
            try { this.socket.close(); } catch (e) {}
            this.socket = null;
        }
        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
            this.scanTimeout = null;
        }
    }
}

const dlnaService = new DlnaService();
module.exports = dlnaService;