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

            this.initStream();
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

            const pin = this.getPin();
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const sseUrl = getUrl(`/api/chat/stream${pin ? `?pin=${encodeURIComponent(pin)}` : ''}`);

            try {
                this.eventSource = new EventSource(sseUrl);

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
                    setTimeout(() => this.initStream(), 3000);
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
                this.container.innerHTML = '<div style="text-align: center; color: var(--apple-text-muted); font-size: 12px; margin-top: 20px;">跨端加密实时传输中...</div>';
                return;
            }

            this.container.innerHTML = messages.map(m => this.createMessageHTML(m)).join('');
            this.scrollToBottom();
        }

        appendMessage(message) {
            this.ensureContainer();
            if (!this.container) return;

            if (this.container.children.length === 1 && this.container.children[0].tagName === 'DIV' && !this.container.children[0].classList.contains('msg-bubble')) {
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
            const isMe = m.sender === this.deviceId || m.sender === 'pc';
            const timeStr = new Date(m.time || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let contentHtml = '';
            if (m.type === 'image') {
                contentHtml = `<img src="${m.text}" style="max-width:100%; border-radius:12px; display:block;" alt="chat picture">`;
            } else if (m.type === 'voice' || m.type === 'audio') {
                contentHtml = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>🎙️ 语音消息</span>
                        <audio src="${m.text}" controls style="max-width:200px; height:32px;"></audio>
                    </div>
                `;
            } else {
                const escapeHtml = str => typeof str === 'string' ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : str;
                contentHtml = escapeHtml(m.text || '').replace(/\n/g, '<br>');
            }

            return `
                <div class="msg-bubble ${isMe ? 'msg-right' : 'msg-left'}">
                    <div>${contentHtml}</div>
                    <div class="msg-time">${timeStr}</div>
                </div>
            `;
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

            const pin = this.getPin();
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const chatUrl = getUrl('/api/chat');

            try {
                const res = await fetch(chatUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                    body: JSON.stringify({
                        text: text.trim(),
                        sender: this.deviceId,
                        type: 'text'
                    })
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    alert('发送消息失败: ' + (errData.error || res.statusText));
                }

                this.initStream();
            } catch (err) {
                console.error('发送文本消息失败', err);
                alert('发送文本消息失败: ' + err.message);
            }
        }

        async sendImage(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = e.target.result;
                const pin = this.getPin();
                const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
                const chatUrl = getUrl('/api/chat');

                try {
                    await fetch(chatUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                        body: JSON.stringify({
                            text: base64Data,
                            sender: this.deviceId,
                            type: 'image'
                        })
                    });
                    this.initStream();
                } catch (err) {
                    console.error('发送图片消息失败', err);
                    alert('发送图片消息失败: ' + err.message);
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
                alert('当前浏览器环境不支持麦克风录音功能');
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
                alert('获取麦克风权限失败: ' + err.message);
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
            const pin = this.getPin();
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const chatUrl = getUrl('/api/chat');

            try {
                await fetch(chatUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                    body: JSON.stringify({
                        text: base64Audio,
                        sender: this.deviceId,
                        type: 'voice'
                    })
                });
                this.initStream();
            } catch (err) {
                console.error('发送语音失败', err);
            }
        }

        async clearHistory() {
            if (!confirm('确定要清空所有聊天记录吗？')) return;

            const pin = this.getPin();
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const chatUrl = getUrl('/api/chat');

            try {
                await fetch(chatUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
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
