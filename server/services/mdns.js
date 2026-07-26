const dgram = require('dgram');

/**
 * 局域网 mDNS 本地域名广播服务 (MdnsResponder)
 * 职责：在局域网内通过 224.0.0.251:5353 多播广播 `landisk.local` 域名，
 * 使手机/电脑浏览器无需记忆变动的 IP 地址，直接输入 http://landisk.local:3000 访问。
 */

class MdnsResponder {
    constructor() {
        this.socket = null;
        this.ip = '127.0.0.1';
        this.domain = 'landisk.local';
    }

    start(localIp) {
        this.stop();
        this.ip = localIp || '127.0.0.1';

        try {
            this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

            this.socket.on('message', (msg, rinfo) => {
                try {
                    const msgStr = msg.toString('utf8');
                    if (msgStr.includes('landisk') || msgStr.includes('local')) {
                        this.respond(rinfo);
                    }
                } catch(e) {}
            });

            this.socket.on('error', (err) => {
                // 某些系统端口 5353 占用时不卡死主服务
                this.stop();
            });

            this.socket.bind(5353, () => {
                try {
                    this.socket.addMembership('224.0.0.251');
                    this.socket.setMulticastTTL(255);
                    this.socket.setMulticastLoopback(true);
                } catch(e) {}
            });
        } catch (e) {
            // 静默优雅容错
        }
    }

    respond(rinfo) {
        if (!this.socket) return;
        try {
            // 构造简易 DNS A 记录响应包
            const ipParts = this.ip.split('.').map(n => parseInt(n, 10));
            if (ipParts.length !== 4) return;

            const response = Buffer.from([
                0x00, 0x00, // ID
                0x84, 0x00, // Flags: Response, Authoritative
                0x00, 0x00, // Questions
                0x00, 0x01, // Answer RRs
                0x00, 0x00, // Authority RRs
                0x00, 0x00, // Additional RRs
                // Domain: landisk.local
                0x07, 0x6c, 0x61, 0x6e, 0x64, 0x69, 0x73, 0x6b, // landisk
                0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, // local
                0x00, // null terminator
                0x00, 0x01, // Type: A
                0x00, 0x01, // Class: IN
                0x00, 0x00, 0x00, 0x78, // TTL: 120s
                0x00, 0x04, // Data length: 4 bytes
                ipParts[0], ipParts[1], ipParts[2], ipParts[3]
            ]);

            this.socket.send(response, 0, response.length, rinfo.port, rinfo.address);
        } catch(e) {}
    }

    stop() {
        if (this.socket) {
            try {
                this.socket.close();
            } catch(e) {}
            this.socket = null;
        }
    }
}

module.exports = new MdnsResponder();
