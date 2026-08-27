/**
 * 局域网互联 Pro - iMessage 跨端实时通信组件 (IMessageChat)
 * 职责：支持 SSE 实时消息流接收、文本消息转义与发送、图片与语音消息传输、历史记录清空。
 */

(function (global) {
    'use strict';

    class IMessageChat {
        constructor(config = {}) {
            this.container = typeof config.messagesContainer === 'string' ? document.querySelector(config.messagesContainer) : config.messagesContainer;
            this.inputElement = typeof config.inputElement === 'string' ? document.querySelector(config.inputElement) : config.inputElement;
            this.recordBtnElement = typeof config.recordBtnElement === 'string' ? document.querySelector(config.recordBtnElement) : config.recordBtnElement;

            this.getPin = config.getPin || (() => typeof localStorage !== 'undefined' ? (localStorage.getItem('lan_disk_pin') || '') : '');
            this.getApiUrl = config.getApiUrl || ((p) => {
                if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
                    const baseUrl = window.currentServerUrl || 'http://localhost:3000';
                    return baseUrl.replace(/\/$/, '') + p;
                }
                return p;
            });

            this.deviceId = this.getDeviceId();
            this.eventSource = null;
            this.mediaRecorder = null;
            this.audioChunks = [];
            this.isRecording = false;

            // 无凭据（未登录）时不自动建连，等待登录成功后由 init() 启动，
            // 避免登录前每 3 秒一次的 401 重连风暴
            if (this.hasCredentials()) {
                this.initStream();
            }
        }

        hasCredentials() {
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.hasCredentials) {
                return global.LanDiskAuth.hasCredentials();
            }
            return !!this.getPin();
        }

        _authHeaders(extra) {
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.authHeaders) {
                return global.LanDiskAuth.authHeaders(extra);
            }
            const headers = extra ? Object.assign({}, extra) : {};
            headers['x-pin'] = this.getPin();
            return headers;
        }

        getDeviceId() {
            let id = typeof localStorage !== 'undefined' ? localStorage.getItem('lan_disk_device_id') : null;
            if (!id) {
                id = 'dev_' + Math.random().toString(36).substr(2, 9);
                if (typeof localStorage !== 'undefined') localStorage.setItem('lan_disk_device_id', id);
            }
            return id;
        }

        initStream() {
            if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) return;

            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            let query = '';
            if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.authQuery) {
                query = global.LanDiskAuth.authQuery();
            } else {
                const pin = this.getPin();
                query = pin ? `?pin=${encodeURIComponent(pin)}` : '';
            }
            const sseUrl = getUrl(`/api/chat/stream${query}`);

            try {
                this.eventSource = new EventSource(sseUrl);

                this.eventSource.onopen = () => {
                    // 连接成功，重置退避
                    this._retryDelay = 3000;
                };

                this.eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'init') {
                            this.renderMessages(data.messages);
                        } else if (data.type === 'new') {
                            this.appendMessage(data.message);
                        } else if (data.type === 'clear') {
                            this.ensureContainer();
                            if (this.container) {
                                this.container.innerHTML = '<div style="text-align: center; color: var(--apple-text-muted); font-size: 12px; margin-top: 20px;">聊天记录已清空</div>';
                            }
                        }
                    } catch (e) {
                        console.error('解析 SSE 消息失败', e);
                    }
                };

                this.eventSource.onerror = () => {
                    if (this.eventSource) {
                        this.eventSource.close();
                        this.eventSource = null;
                    }
                    if (!this.hasCredentials()) return;
                    // 指数退避：3s → 5s → 9s → … 封顶 30s，主机离线时不狂刷
                    if (!this._retryDelay) this._retryDelay = 3000;
                    const delay = this._retryDelay;
                    this._retryDelay = Math.min(Math.round(this._retryDelay * 1.7), 30000);
                    setTimeout(() => this.initStream(), delay);
                };
            } catch (e) {
                console.error('初始化 SSE 失败', e);
            }
        }

        ensureContainer() {
            if (!this.container) {
                this.container = document.querySelector('#chat-messages') || document.querySelector('#pc-chat-messages');
            }
        }

        ensureInput() {
            if (!this.inputElement) {
                this.inputElement = document.querySelector('#chat-input') || document.querySelector('#pc-chat-input');
            }
        }

        renderMessages(messages) {
            this.ensureContainer();
            if (!this.container) return;

            if (!messages || messages.length === 0) {
                const chatIcon = global.Icons ? global.Icons.render('chat', 28) : '';
                this.container.innerHTML = `
                    <div class="chat-empty-state">
                        <div class="chat-empty-icon">${chatIcon}</div>
                        <div class="chat-empty-title">跨端实时消息互通</div>
                        <div class="chat-empty-desc">局域网加密直连 · 支持文本、图片及语音实时双向互传</div>
                    </div>
                `;
                return;
            }

            this.container.innerHTML = messages.map(m => this.createMessageHTML(m)).join('');
            this.scrollToBottom();
        }

        appendMessage(message) {
            // 他人新消息通知钩子：供两端 Dock 未读角标使用
            const isMe = message && (message.sender === this.deviceId || (typeof window !== 'undefined' && window.api && message.sender === 'pc'));
            if (!isMe && typeof global.onChatIncoming === 'function') {
                try { global.onChatIncoming(message); } catch (e) {}
            }

            this.ensureContainer();
            if (!this.container) return;

            if (this.container.querySelector('.chat-empty-state') || (this.container.children.length === 1 && !this.container.children[0].classList.contains('chat-msg-row') && !this.container.children[0].classList.contains('msg-bubble'))) {
                this.container.innerHTML = '';
            }

            this.container.insertAdjacentHTML('beforeend', this.createMessageHTML(message));
            this.scrollToBottom();
        }

        scrollToBottom() {
            if (this.container) {
                this.container.scrollTop = this.container.scrollHeight;
            }
        }

        createMessageHTML(m) {
            const isMe = m.sender === this.deviceId || (typeof window !== 'undefined' && window.api && m.sender === 'pc');
            const d = new Date(m.time || Date.now());
            const isToday = new Date().toDateString() === d.toDateString();
            const timeStr = isToday
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : `${d.getMonth() + 1}月${d.getDate()}日 ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

            let senderLabel = isMe ? '我' : (m.sender === 'pc' ? '电脑端' : (m.sender && m.sender.startsWith('dev_') ? '移动设备' : (m.sender || '其他设备')));
            const isPeerPc = m.sender === 'pc';
            const avatarIconName = isMe 
                ? (typeof window !== 'undefined' && window.api ? 'monitor' : 'smartphone')
                : (isPeerPc ? 'monitor' : 'smartphone');
            const avatarSvg = global.Icons ? global.Icons.render(avatarIconName, 17) : '';

            let contentHtml = '';
            const escapeHtml = global.escapeHtml || (str => typeof str === 'string' ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : str);
            
            if (m.type === 'image') {
                contentHtml = `<img src="${escapeHtml(m.text)}" alt="图片" onclick="window.open(this.src)" title="点击查看大图">`;
            } else if (m.type === 'voice' || m.type === 'audio') {
                contentHtml = `<div class="chat-audio-wrapper"><span style="display:inline-flex; align-items:center; gap:5px; font-size:12px; opacity:0.9;">${global.Icons ? global.Icons.render('mic', 15) : ''} 语音</span><audio src="${escapeHtml(m.text)}" controls></audio></div>`;
            } else {
                contentHtml = escapeHtml((m.text || '').trim()).replace(/\n/g, '<br>');
            }

            return `<div class="chat-msg-row ${isMe ? 'chat-msg-self' : 'chat-msg-peer'}"><div class="chat-avatar" title="${senderLabel}">${avatarSvg}</div><div class="chat-msg-body"><div class="chat-msg-meta"><span class="chat-sender-name">${senderLabel}</span><span class="chat-msg-time">${timeStr}</span></div><div class="chat-bubble ${isMe ? 'bubble-self msg-right' : 'bubble-peer msg-left'}">${contentHtml}</div></div></div>`;
        }

        async sendText(customText) {
            this.ensureInput();
            let text = customText;
            if (typeof text !== 'string' && this.inputElement) {
                text = this.inputElement.value;
            }
            if (!text || !text.trim()) return;

            if (this.inputElement && typeof customText !== 'string') {
                this.inputElement.value = '';
            }

            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const chatUrl = getUrl('/api/chat');

            try {
                const res = await fetch(chatUrl, {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        text: text.trim(),
                        sender: this.deviceId,
                        type: 'text'
                    })
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    this._toast('发送消息失败: ' + (errData.error || res.statusText), 'error');
                }

                this.initStream();
            } catch (err) {
                console.error('发送文本消息失败', err);
                this._toast('发送文本消息失败: ' + err.message, 'error');
            }
        }

        _toast(msg, type) {
            if (typeof global.LanDiskUI !== 'undefined' && global.LanDiskUI.toast) global.LanDiskUI.toast(msg, type);
            else alert(msg);
        }

        async sendImage(file) {
            if (!file) return;
            // 服务端限制 base64 后约 8MB，原图超过 5.5MB 会超限，提前拦截
            if (file.size > 5.5 * 1024 * 1024) {
                this._toast('图片过大（建议 5MB 以内），请压缩后再发送', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = e.target.result;
                const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
                const chatUrl = getUrl('/api/chat');

                try {
                    await fetch(chatUrl, {
                        method: 'POST',
                        headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            text: base64Data,
                            sender: this.deviceId,
                            type: 'image'
                        })
                    });
                    this.initStream();
                } catch (err) {
                    console.error('发送图片消息失败', err);
                    this._toast('发送图片消息失败: ' + err.message, 'error');
                }
            };
            reader.readAsDataURL(file);
        }

        async toggleVoiceRecord() {
            if (this.isRecording) {
                this.stopVoiceRecord();
            } else {
                await this.startVoiceRecord();
            }
        }

        async startVoiceRecord() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this._toast('当前浏览器环境不支持麦克风录音', 'error');
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.audioChunks = [];
                this.mediaRecorder = new MediaRecorder(stream);

                this.mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        this.audioChunks.push(e.data);
                    }
                };

                this.mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        const base64Audio = reader.result;
                        await this.sendVoiceMessage(base64Audio);
                    };
                    reader.readAsDataURL(audioBlob);

                    stream.getTracks().forEach(track => track.stop());
                };

                this.mediaRecorder.start();
                this.isRecording = true;
                const statusEl = document.getElementById('voice-status');
                if (statusEl) statusEl.style.display = 'block';
            } catch (err) {
                this._toast('获取麦克风权限失败：' + err.message, 'error');
            }
        }

        stopVoiceRecord() {
            if (this.mediaRecorder && this.isRecording) {
                this.mediaRecorder.stop();
                this.isRecording = false;
                const statusEl = document.getElementById('voice-status');
                if (statusEl) statusEl.style.display = 'none';
            }
        }

        async sendVoiceMessage(base64Audio) {
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const chatUrl = getUrl('/api/chat');

            // 服务端音频上限 8MB（base64 后），超长录音提前拦截
            if (base64Audio && base64Audio.length > 7.5 * 1024 * 1024) {
                this._toast('语音过长（约超 5 分钟），请缩短后重试', 'error');
                return;
            }

            try {
                await fetch(chatUrl, {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        text: base64Audio,
                        sender: this.deviceId,
                        type: 'audio' // 服务端仅认 text/image/audio；旧版 voice 会被强转成文本乱码
                    })
                });
                this.initStream();
            } catch (err) {
                console.error('发送语音失败', err);
                this._toast('发送语音失败', 'error');
            }
        }

        async clearHistory() {
            if (global.LanDiskUI && global.LanDiskUI.confirmDialog) {
                const ok = await global.LanDiskUI.confirmDialog({ title: '清空聊天记录', message: '所有设备上的聊天记录都会被清空。', danger: true, confirmText: '清空' });
                if (!ok) return;
            } else if (!confirm('确定要清空所有聊天记录吗？')) {
                return;
            }

            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const chatUrl = getUrl('/api/chat');

            try {
                await fetch(chatUrl, {
                    method: 'POST',
                    headers: this._authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        text: 'clear',
                        action: 'clear',
                        sender: this.deviceId
                    })
                });
                this.initStream();
            } catch (err) {
                console.error('清空聊天记录失败', err);
            }
        }
    }

    let instance = null;

    function getOrCreateInstance(containerId) {
        if (!instance) {
            instance = new IMessageChat({
                messagesContainer: typeof containerId === 'string' ? '#' + containerId : (containerId || '#chat-messages'),
                inputElement: '#chat-input',
                recordBtnElement: '#btn-voice'
            });
        }
        return instance;
    }

    IMessageChat.init = function(containerId) {
        const inst = getOrCreateInstance(containerId);
        inst.initStream();
    };

    IMessageChat.sendMessage = function(customText) {
        const inst = getOrCreateInstance();
        inst.sendText(customText);
    };

    IMessageChat.sendImage = function(el) {
        const inst = getOrCreateInstance();
        if (el && el.files && el.files[0]) inst.sendImage(el.files[0]);
    };

    IMessageChat.toggleVoice = function() {
        const inst = getOrCreateInstance();
        inst.toggleVoiceRecord();
    };

    IMessageChat.clearChat = function() {
        const inst = getOrCreateInstance();
        inst.clearHistory();
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (document.querySelector('#chat-messages') || document.querySelector('#pc-chat-messages')) {
                    getOrCreateInstance();
                }
            }, 300);
        });
    }

    global.IMessageChatComponent = IMessageChat;

})(typeof window !== 'undefined' ? window : this);
