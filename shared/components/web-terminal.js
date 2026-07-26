/**
 * 局域网互联 Pro - macOS Web 终端组件 (WebTerminal)
 * 职责：处理终端 Shell 命令提交执行、等宽文本流式输出追加与自适应滚动、命令历史记录上下翻阅与清屏。
 * 遵循无全局变量污染、高扩展性设计。
 */

(function (global) {
    'use strict';

    class WebTerminal {
        constructor(config = {}) {
            this.outputElement = typeof config.outputElement === 'string' ? document.querySelector(config.outputElement) : config.outputElement;
            this.inputElement = typeof config.inputElement === 'string' ? document.querySelector(config.inputElement) : config.inputElement;
            this.executeBtnElement = typeof config.executeBtnElement === 'string' ? document.querySelector(config.executeBtnElement) : config.executeBtnElement;

            this.apiFetch = config.apiFetch || window.fetch;
            this.getPin = config.getPin || (() => localStorage.getItem('lan_disk_pin') || '');
            this.getCwd = config.getCwd || (() => 'C:\\');

            this.history = [];
            this.historyIndex = -1;

            this._bindEvents();
        }

        _bindEvents() {
            if (this.inputElement) {
                this.inputElement.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.executeCommand();
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.navigateHistory('up');
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.navigateHistory('down');
                    }
                });
            }

            if (this.executeBtnElement) {
                this.executeBtnElement.addEventListener('click', () => {
                    this.executeCommand();
                });
            }
        }

        navigateHistory(direction) {
            if (!this.history.length || !this.inputElement) return;

            if (direction === 'up') {
                if (this.historyIndex === -1) {
                    this.historyIndex = this.history.length - 1;
                } else if (this.historyIndex > 0) {
                    this.historyIndex--;
                }
            } else if (direction === 'down') {
                if (this.historyIndex !== -1 && this.historyIndex < this.history.length - 1) {
                    this.historyIndex++;
                } else {
                    this.historyIndex = -1;
                    this.inputElement.value = '';
                    return;
                }
            }

            if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
                this.inputElement.value = this.history[this.historyIndex];
            }
        }

        async executeCommand(customCommand) {
            let cmd = customCommand;
            if (typeof cmd !== 'string' && this.inputElement) {
                cmd = this.inputElement.value;
            }

            if (!cmd || !cmd.trim()) return;
            cmd = cmd.trim();

            if (this.inputElement && typeof customCommand !== 'string') {
                this.inputElement.value = '';
            }

            this.history.push(cmd);
            this.historyIndex = -1;

            if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
                this.clearOutput();
                return;
            }

            this.appendLine(`$ ${cmd}`, 'command');

            const cwd = this.getCwd();
            const pin = this.getPin();

            try {
                const res = await fetch('/api/terminal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pin': pin },
                    body: JSON.stringify({
                        command: cmd,
                        cwd: cwd
                    })
                });

                const data = await res.json();
                if (data.error) {
                    this.appendLine(data.error, 'error');
                } else if (data.output) {
                    this.appendLine(data.output, 'normal');
                } else {
                    this.appendLine('(命令执行完毕，无输出)', 'muted');
                }
            } catch (err) {
                this.appendLine(`执行错误: ${err.message}`, 'error');
            }
        }

        appendLine(text, type = 'normal') {
            if (!this.outputElement) return;

            const lineDiv = document.createElement('div');
            lineDiv.style.margin = '2px 0';
            lineDiv.style.wordBreak = 'break-all';

            if (type === 'command') {
                lineDiv.style.color = '#ffffff';
                lineDiv.style.fontWeight = '600';
            } else if (type === 'error') {
                lineDiv.style.color = 'var(--apple-system-red, #ff453a)';
            } else if (type === 'muted') {
                lineDiv.style.color = 'var(--apple-text-muted, #8e8e93)';
            } else {
                lineDiv.style.color = '#34c759';
            }

            lineDiv.textContent = text;
            this.outputElement.appendChild(lineDiv);

            this.scrollToBottom();
        }

        scrollToBottom() {
            if (this.outputElement) {
                this.outputElement.scrollTop = this.outputElement.scrollHeight;
            }
        }

        clearOutput() {
            if (this.outputElement) {
                this.outputElement.innerHTML = '<div style="color: #8e8e93;">zsh - 猫步互联 Pro 控制台 ready...</div>';
            }
        }
    }

    let instance = null;

    WebTerminal.execute = function(inputId, outputId) {
        if (!instance) {
            instance = new WebTerminal({
                outputElement: typeof outputId === 'string' ? '#' + outputId : outputId,
                inputElement: typeof inputId === 'string' ? '#' + inputId : inputId
            });
        }
        instance.executeCommand();
    };

    global.WebTerminalComponent = WebTerminal;

})(typeof window !== 'undefined' ? window : this);
