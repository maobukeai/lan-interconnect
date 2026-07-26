/**
 * 局域网互联 Pro - iMessage 风格聊天组件 (IMessageChat)
 * 职责：处理 SSE 聊天长连接流、发送文本消息、发送图片、语音录制与上传发送、聊天历史记录清理与自适应滚动。
 * 遵循无全局变量污染、高扩展性设计。
 */

(function (global) {
    'use strict';

    class IMessageChat {
        constructor(config = {}) {
            this.container = typeof config.messagesContainer === 'string' ? document.querySelector(config.messagesContainer) : config.messagesContainer;
            this.inputElement = typeof config.inputElement === 'string' ? document.querySelector(config.inputElement) : config.inputElement;
            this.imageInputElement = typeof config.imageInputElement === 'string' ? document.querySelector(config.imageInputElement) : config.imageInputElement;
            this.recordBtnElement = typeof config.recordBtnElement === 'string' ? document.querySelector(config.recordBtnElement) : config.recordBtnElement;

            this.apiFetch = config.apiFetch || window.fetch;
            this.getPin = config.getPin || (() => localStorage.getItem('lan_disk_pin') || '');
            this.deviceId = config.deviceId || localStorage.getItem('lan_device_id') || ('dev_' + Math.random().toString(36).substr(2, 6));

            this.eventSource = null;
            this.mediaRecorder = null;
            this.audioChunks = [];
            this.isRecording = false;

            this._bindEvents();
        }

        _bindEvents() {
            if (this.inputElement) {
                this.inputElement.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.sendText();
                    }
                });
            }

            if (this.imageInputElement) {
                this.imageInputElement.addEventListener('change', (e) => {
                    if (e.target.files && e.target.files[0]) {
                        this.sendImage(e.target.files[0]);
                        e.target.value = '';
                    }
                });
            }

            if (this.recordBtnElement) {
                this.recordBtnElement.addEventListener('click', () => {
                    this.toggleVoiceRecord();
                });
            }
        }

        initStream() {
            if (this.eventSource) {
                this.eventSource.close();
            }

            const pin = this.getPin();
            const streamUrl = `/api/chat/stream?pin=${encodeURIComponent(pin)}`;

            try {
                this.eventSource = new EventSource(streamUrl);

                this.eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'init') {
                            this.renderMessages(data.messages || []);
                        } else if (data.type === 'new') {
                            this.appendMessage(data.message);
                        }
                    } catch (e) {
                        console.error('解析 SSE 聊天数据失败', e);
                    }
                };
            } catch (err) {
                console.error('初始化 SSE 建立失败', err);
            }
        }

        closeStream() {
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
        }

        renderMessages(messages = []) {
            if (!this.container) return;

            if (!messages.length) {
                this.container.innerHTML = '<div style="text-align: center; color: var(--apple-text-muted, #8e8e93); font-size: 12px; margin-top: 20px;">iMessage 实时跨端通信框架</div>';
                return;
            }

            this.container.innerHTML = messages.map(m => this.createMessageHTML(m)).join('');
            this.scrollToBottom();
        }

        appendMessage(message) {
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
            const isMe = m.sender === this.deviceId;
            const timeStr = new Date(m.time || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let contentHtml = '';
            if (m.type === 'image') {
                contentHtml = `<img src="${m.text}" style="max-width:100%; border-radius:12px; display:block;" alt="chat picture">`;
            } else if (m.type === 'voice') {
                contentHtml = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>🎙️ 语音消息</span>
                        <audio src="${m.text}" controls style="max-width:200px; height:32px;"></audio>
                    </div>
                `;
            } else {
                contentHtml = (m.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace/>/g, '&gt;').replace(/\n/g, '<br>');
            }

            return `
                <div class="msg-bubble ${isMe ? 'msg-right' : 'msg-left'}">
                    <div>${contentHtml}</div>
                    <div class="msg-time">${timeStr}</div>
                </div>
            `;
        }

        async sendText(customText) {
            let text = customText;
            if (typeof text !== 'string' && this.inputElement) {
                text = this.inputElement.value;
            }
            if (!text || !text.trim()) return;

            if (this.inputElement && typeof customText !== 'string') {
                this.inputElement.value = '';
            }

            try {
                const pin = this.getPin();
                await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                    body: JSON.stringify({
                        text: text.trim(),
                        sender: this.deviceId,
                        type: 'text'
                    })
                });
            } catch (err) {
                console.error('发送文本消息失败', err);
            }
        }

        sendImage(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = e.target.result;
                try {
                    const pin = this.getPin();
                    await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                        body: JSON.stringify({
                            text: base64Data,
                            sender: this.deviceId,
                            type: 'image'
                        })
                    });
                } catch (err) {
                    console.error('发送图片消息失败', err);
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
            try {
                const pin = this.getPin();
                await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                    body: JSON.stringify({
                        text: base64Audio,
                        sender: this.deviceId,
                        type: 'voice'
                    })
                });
            } catch (err) {
                console.error('发送语音失败', err);
            }
        }

        async clearHistory() {
            if (!confirm('确定要清空所有聊天记录吗？')) return;

            try {
                const pin = this.getPin();
                await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                    body: JSON.stringify({
                        text: 'clear',
                        action: 'clear',
                        sender: this.deviceId
                    })
                });
            } catch (err) {
                console.error('清空聊天记录失败', err);
            }
        }
    }

    let instance = null;

    IMessageChat.init = function(containerId) {
        if (!instance) {
            instance = new IMessageChat({
                messagesContainer: typeof containerId === 'string' ? '#' + containerId : containerId,
                inputElement: '#chat-input',
                recordBtnElement: '#btn-voice'
            });
        }
        instance.initStream();
    };

    IMessageChat.sendMessage = function() { if (instance) instance.sendText(); };
    IMessageChat.sendImage = function(el) { if (instance && el && el.files && el.files[0]) instance.sendImage(el.files[0]); };
    IMessageChat.toggleVoice = function() { if (instance) instance.toggleVoiceRecord(); };
    IMessageChat.clearChat = function() { if (instance) instance.clearHistory(); };

    global.IMessageChatComponent = IMessageChat;

})(typeof window !== 'undefined' ? window : this);
