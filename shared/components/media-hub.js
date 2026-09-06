/**
 * 局域网互联 Pro - 媒体调度与画廊中心组件 (MediaHub)
 * 职责：处理视频/音频播放串联、全屏图片画廊（支持双指缩放与下拉关闭手势）、文本/Markdown 查看及弹窗手势交互。
 */

(function (global) {
    'use strict';

    class MediaHub {
        constructor(config = {}) {
            this.imageModal = typeof config.imageModal === 'string' ? document.querySelector(config.imageModal) : config.imageModal;
            this.imageViewer = typeof config.imageViewer === 'string' ? document.querySelector(config.imageViewer) : config.imageViewer;
            this.textModal = typeof config.textModal === 'string' ? document.querySelector(config.textModal) : config.textModal;
            this.textViewer = typeof config.textViewer === 'string' ? document.querySelector(config.textViewer) : config.textViewer;
            this.textTitle = typeof config.textTitle === 'string' ? document.querySelector(config.textTitle) : config.textTitle;

            this.apiFetch = config.apiFetch || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
            this.getPin = config.getPin || (() => typeof localStorage !== 'undefined' ? (localStorage.getItem('lan_disk_pin') || '') : '');
            this.getApiUrl = config.getApiUrl || ((p) => {
                if (typeof global.LanDiskAuth !== 'undefined' && global.LanDiskAuth.api) {
                    return global.LanDiskAuth.api(p);
                }
                if (typeof window !== 'undefined') {
                    const baseUrl = window.currentServerUrl || (typeof localStorage !== 'undefined' && localStorage.getItem('landisk_custom_server')) || '';
                    if (baseUrl) return baseUrl.replace(/\/$/, '') + (p.startsWith('/') ? p : '/' + p);
                }
                return p;
            });

            this.currentGallery = { index: 0, items: [] };
            this.scale = 1;
            this.lastScale = 1;
            this.lastTapTime = 0;

            this._bindTouchEvents();
        }

        _bindTouchEvents() {
            const imageModal = this.imageModal || (typeof document !== 'undefined' ? document.getElementById('image-modal') : null);
            const imageViewer = this.imageViewer || (typeof document !== 'undefined' ? document.getElementById('image-viewer') : null);

            if (!imageModal) return;

            let startX = 0;
            let startY = 0;
            let initialPinchDist = 0;

            imageModal.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else if (e.touches.length === 2) {
                    // 记录双指初始距离 (Pinch-to-Zoom)
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialPinchDist = Math.sqrt(dx * dx + dy * dy);
                }
            }, { passive: true });

            imageModal.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2 && initialPinchDist > 0 && imageViewer) {
                    // 计算双指实时捏合/放缩比例
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const currentDist = Math.sqrt(dx * dx + dy * dy);
                    const factor = currentDist / initialPinchDist;
                    this.scale = Math.min(4, Math.max(0.8, this.lastScale * factor));
                    imageViewer.style.transform = `scale(${this.scale})`;
                }
            }, { passive: true });

            imageModal.addEventListener('touchend', (e) => {
                if (e.touches.length === 0) {
                    this.lastScale = this.scale;
                }

                if (!e.changedTouches || e.changedTouches.length !== 1) return;
                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;

                const diffX = endX - startX;
                const diffY = endY - startY;

                // 双击点按重置/放大
                const now = Date.now();
                if (now - this.lastTapTime < 300 && Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && imageViewer) {
                    this.scale = this.scale > 1.2 ? 1 : 2.2;
                    this.lastScale = this.scale;
                    imageViewer.style.transform = `scale(${this.scale})`;
                    this.lastTapTime = now;
                    return;
                }
                this.lastTapTime = now;

                // 若处于放大状态，优先进行拖拽微调，不动手势切页
                if (this.scale > 1.2) return;

                // 1. 水平滑动手势 (左右切图)
                if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX < 0) {
                        this.nextImage();
                    } else {
                        this.prevImage();
                    }
                }
                // 2. 下拉滑动手势 (Swipe-Down to Dismiss 关闭弹窗)
                else if (diffY > 90 && Math.abs(diffY) > Math.abs(diffX)) {
                    this.closeModals();
                }
            }, { passive: true });
        }

        resetZoom() {
            this.scale = 1;
            this.lastScale = 1;
            const imageViewer = this.imageViewer || document.getElementById('image-viewer');
            if (imageViewer) imageViewer.style.transform = 'scale(1)';
        }

        playMedia(type, path, name, currentFiles = []) {
            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const authQ = () => (global.LanDiskAuth && global.LanDiskAuth.authQuery) ? global.LanDiskAuth.authQuery().replace(/^\?/, '&') : `&pin=${encodeURIComponent(typeof this.getPin === 'function' ? this.getPin() : '')}`;
            const streamUrl = getUrl(`/api/stream?path=${encodeURIComponent(path)}${authQ()}`);

            if (type === 'video' || type === 'audio') {
                // 统一白名单（shared/media-types.js）：本地旧正则漏掉 ts/m4v/flv/wmv/rmvb 等
                const M = global.MediaTypes || null;
                const playlist = (currentFiles || [])
                    .filter(f => !f.isDirectory && (M ? M.isMedia(f.name) : /\.(mp4|mkv|webm|mov|avi|mp3|wav|flac|aac|m4a)$/i.test(f.name)))
                    .map(f => ({
                        name: f.name,
                        path: f.path,
                        type: (M ? M.isAudio(f.name) : /\.(mp3|wav|flac|aac|m4a)$/i.test(f.name)) ? 'audio' : 'video',
                        url: getUrl(`/api/stream?path=${encodeURIComponent(f.path)}${authQ()}`)
                    }));
                const currentItem = { name, path, type, url: streamUrl };

                if (global.AppleMediaPlayer && typeof global.AppleMediaPlayer.play === 'function') {
                    global.AppleMediaPlayer.play(currentItem, playlist);
                } else if (global.LanDiskUI && global.LanDiskUI.downloadUrl) {
                    global.LanDiskUI.downloadUrl(streamUrl, name);
                } else {
                    window.open(streamUrl, '_blank');
                }
            } else if (type === 'image') {
                const imageFiles = (currentFiles || [])
                    .filter(f => !f.isDirectory && /\.(jpg|png|gif|webp|svg|bmp|ico)$/i.test(f.name))
                    .map(f => ({
                        name: f.name,
                        path: f.path,
                        url: getUrl(`/api/stream?path=${encodeURIComponent(f.path)}${authQ()}`)
                    }));
                
                let targetIdx = imageFiles.findIndex(f => f.path === path);
                if (targetIdx === -1) {
                    imageFiles.unshift({ name, path, url: streamUrl });
                    targetIdx = 0;
                }
                this.showImagePreview(targetIdx, imageFiles);
            } else if (type === 'text') {
                this.showTextPreview(name, path);
            }
        }

        showImagePreview(index, imageList = []) {
            this.resetZoom();
            this.currentGallery = { index, items: imageList };
            this.renderGalleryCurrent();
            const modal = this.imageModal || document.getElementById('image-modal');
            if (modal) modal.style.display = 'flex';
        }

        renderGalleryCurrent() {
            const { index, items } = this.currentGallery;
            if (!items || items.length === 0) return;
            const item = items[index];
            if (!item) return;

            this.resetZoom();

            const viewer = this.imageViewer || document.getElementById('image-viewer');
            if (viewer) viewer.src = item.url;
            
            const titleEl = document.getElementById('image-gallery-title');
            if (titleEl) {
                titleEl.textContent = `${item.name} (${index + 1}/${items.length})`;
            }
        }

        nextImage() {
            const { index, items } = this.currentGallery;
            if (!items || items.length <= 1) return;
            this.currentGallery.index = (index + 1) % items.length;
            this.renderGalleryCurrent();
        }

        prevImage() {
            const { index, items } = this.currentGallery;
            if (!items || items.length <= 1) return;
            this.currentGallery.index = (index - 1 + items.length) % items.length;
            this.renderGalleryCurrent();
        }

        _escapeHtml(str) {
            if (typeof str !== 'string') return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        _renderHighlightedCode(code, ext, showLineNumbers = true) {
            if (!code) return '';
            const normExt = (ext || '').toLowerCase().replace(/^\./, '');
            let tokens = [];

            let combinedRegex;
            if (['py', 'python'].includes(normExt)) {
                combinedRegex = /(?:#[^\r\n]*)|(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
            } else if (['sh', 'bash', 'zsh', 'yaml', 'yml'].includes(normExt)) {
                combinedRegex = /(?:#[^\r\n]*)|(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
            } else if (['sql'].includes(normExt)) {
                combinedRegex = /(?:--[^\r\n]*|\/\*[\s\S]*?\*\/)|(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
            } else if (['html', 'xml', 'svg'].includes(normExt)) {
                combinedRegex = /(?:<!--[\s\S]*?-->)|(?:"[^"]*"|'[^']*')/g;
            } else {
                combinedRegex = /(?:\/\*[\s\S]*?\*\/|\/\/[^\r\n]*)|(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
            }

            let masked = code.replace(combinedRegex, (match) => {
                const isComment = match.startsWith('//') || match.startsWith('/*') || match.startsWith('#') || match.startsWith('--') || match.startsWith('<!--');
                const isKey = normExt === 'json' && /^\s*"[^"]*"\s*:/.test(match);
                tokens.push({ type: isComment ? 'comment' : (isKey ? 'key' : 'string'), raw: match });
                return '\uE000_' + (tokens.length - 1) + '_\uE001';
            });

            let escaped = this._escapeHtml(masked);

            const kwMap = {
                js: '\\b(break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|let|static|enum|await|async|from|as|of)\\b',
                py: '\\b(def|class|if|elif|else|while|for|return|yield|import|from|as|try|except|finally|raise|with|pass|continue|break|lambda|assert|global|nonlocal|async|await|is|in|not|and|or)\\b',
                sql: '\\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|ADD|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|AS|DISTINCT|CASE|WHEN|THEN|END|AND|OR|NOT|NULL|IS|IN|LIKE|BETWEEN|EXISTS)\\b',
                shell: '\\b(echo|set|export|if|then|else|elif|fi|for|do|done|while|until|case|esac|function|exit|return|local|sudo|chmod|chown|mkdir|rm|cp|mv|cat|grep|curl)\\b'
            };

            let kwPattern = kwMap.js;
            if (['py', 'python'].includes(normExt)) kwPattern = kwMap.py;
            else if (['sql'].includes(normExt)) kwPattern = kwMap.sql;
            else if (['sh', 'bash', 'zsh'].includes(normExt)) kwPattern = kwMap.shell;
            else if (['json', 'css', 'scss', 'html', 'xml'].includes(normExt)) kwPattern = null;

            if (kwPattern) {
                escaped = escaped.replace(new RegExp(kwPattern, ['sql'].includes(normExt) ? 'gi' : 'g'), '<span class="syn-kw">$&</span>');
            }

            if (['html', 'xml', 'svg'].includes(normExt)) {
                escaped = escaped.replace(/&lt;(\/?[a-zA-Z0-9:-]+)/g, '&lt;<span class="syn-tag">$1</span>');
                escaped = escaped.replace(/\b([a-zA-Z0-9:-]+)(?=\s*=)/g, '<span class="syn-attr">$1</span>');
            }

            escaped = escaped.replace(/\b(true|false|null|undefined|None|True|False|nil)\b/g, '<span class="syn-atom">$&</span>');
            escaped = escaped.replace(/\b(String|Number|Boolean|Object|Array|Promise|Map|Set|Symbol|Error|JSON|Math|Date|RegExp|console|window|document|int|float|double|char|bool|str|dict|list)\b/g, '<span class="syn-type">$&</span>');
            escaped = escaped.replace(/\b\d+(\.\d+)?\b/g, '<span class="syn-num">$&</span>');
            escaped = escaped.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g, '<span class="syn-fn">$1</span>');

            escaped = escaped.replace(/\uE000_(\d+)_\uE001/g, (_, idx) => {
                const item = tokens[Number(idx)];
                if (!item) return '';
                let str = this._escapeHtml(item.raw);
                const cls = item.type === 'comment' ? 'syn-comment' : (item.type === 'key' ? 'syn-prop' : 'syn-str');
                if (str.includes('\n')) {
                    str = str.split('\n').join('</span>\n<span class="' + cls + '">');
                }
                return '<span class="' + cls + '">' + str + '</span>';
            });

            const lines = escaped.split(/\r?\n/);

            if (!showLineNumbers) {
                return '<pre class="code-pre mono"><code>' + lines.join('\n') + '</code></pre>';
            }

            const rows = lines.map((line, i) => {
                const num = i + 1;
                return '<tr class="code-line"><td class="code-lineno" data-line="' + num + '">' + num + '</td><td class="code-line-code">' + (line || '&nbsp;') + '</td></tr>';
            }).join('');

            return '<div class="code-viewer-wrap"><table class="code-table"><tbody>' + rows + '</tbody></table></div>';
        }

        _renderMarkdown(md) {
            if (typeof md !== 'string') return '';
            let text = md.replace(/\r\n/g, '\n');

            // 1. 提取独立代码块 ```lang\ncode\n```
            const codeBlocks = [];
            text = text.replace(/(?:^|\n)```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```(?:\n|$)/g, (match, lang, code) => {
                codeBlocks.push({ lang: (lang || '').trim(), code });
                return '\n\uE002_' + (codeBlocks.length - 1) + '_\uE003\n';
            });

            const lines = text.split('\n');
            const out = [];
            let inList = null; // 'ul' | 'ol'
            let inQuote = false;
            let quoteLines = [];
            let inTable = false;
            let tableLines = [];

            const flushQuote = () => {
                if (inQuote) {
                    const quoteContent = quoteLines.map(line => _parseInline(line)).join('<br>');
                    out.push('<blockquote class="md-quote">' + quoteContent + '</blockquote>');
                    inQuote = false;
                    quoteLines = [];
                }
            };

            const flushList = () => {
                if (inList) {
                    out.push('</' + inList + '>');
                    inList = null;
                }
            };

            const flushTable = () => {
                if (inTable) {
                    if (tableLines.length >= 2) {
                        const headerParts = tableLines[0].split('|').map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                        const alignParts = tableLines[1].split('|').map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                        const aligns = alignParts.map(col => {
                            if (col.startsWith(':') && col.endsWith(':')) return 'center';
                            if (col.endsWith(':')) return 'right';
                            return 'left';
                        });

                        let tableHtml = '<table class="md-table"><thead><tr>';
                        headerParts.forEach((h, i) => {
                            const align = aligns[i] || 'left';
                            tableHtml += '<th style="text-align:' + align + '">' + _parseInline(h) + '</th>';
                        });
                        tableHtml += '</tr></thead><tbody>';

                        for (let r = 2; r < tableLines.length; r++) {
                            const rowParts = tableLines[r].split('|').map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                            tableHtml += '<tr>';
                            headerParts.forEach((_, i) => {
                                const cell = rowParts[i] || '';
                                const align = aligns[i] || 'left';
                                tableHtml += '<td style="text-align:' + align + '">' + _parseInline(cell) + '</td>';
                            });
                            tableHtml += '</tr>';
                        }
                        tableHtml += '</tbody></table>';
                        out.push(tableHtml);
                    }
                    inTable = false;
                    tableLines = [];
                }
            };

            const _parseInline = (raw) => {
                let str = this._escapeHtml(raw);
                str = str.replace(/`([^`\n]+)`/g, '<code class="md-inline-code">$1</code>');
                str = str.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/|\.\/)[^\s)]+)\)/g, '<img class="md-img" src="$2" alt="$1">');
                str = str.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|#)[^\s)]+)\)/g, '<a class="md-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
                str = str.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
                str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');
                str = str.replace(/(^|\s)_([^_]+)_(\s|$)/g, '$1<em>$2</em>$3');
                str = str.replace(/~~([^~]+)~~/g, '<del>$1</del>');
                return str;
            };

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                if (trimmed.startsWith('\uE002_') && trimmed.endsWith('_\uE003')) {
                    flushQuote();
                    flushList();
                    flushTable();
                    out.push(trimmed);
                    continue;
                }

                if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                    flushQuote();
                    flushList();
                    inTable = true;
                    tableLines.push(trimmed);
                    continue;
                } else if (inTable) {
                    flushTable();
                }

                if (trimmed.startsWith('>')) {
                    flushList();
                    inQuote = true;
                    quoteLines.push(trimmed.replace(/^>\s?/, ''));
                    continue;
                } else if (inQuote) {
                    flushQuote();
                }

                if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
                    flushList();
                    out.push('<hr class="md-hr">');
                    continue;
                }

                const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
                if (headingMatch) {
                    flushList();
                    const level = headingMatch[1].length;
                    const headingText = _parseInline(headingMatch[2]);
                    out.push('<h' + level + ' class="md-h' + level + '">' + headingText + '</h' + level + '>');
                    continue;
                }

                const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/);
                const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
                const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);

                if (taskMatch) {
                    if (inList !== 'ul') {
                        flushList();
                        out.push('<ul class="md-ul md-task-list">');
                        inList = 'ul';
                    }
                    const checked = taskMatch[1].toLowerCase() === 'x';
                    out.push('<li class="md-li md-task-item"><input type="checkbox" ' + (checked ? 'checked' : '') + ' disabled class="md-checkbox"> ' + _parseInline(taskMatch[2]) + '</li>');
                    continue;
                } else if (ulMatch) {
                    if (inList !== 'ul') {
                        flushList();
                        out.push('<ul class="md-ul">');
                        inList = 'ul';
                    }
                    out.push('<li class="md-li">' + _parseInline(ulMatch[1]) + '</li>');
                    continue;
                } else if (olMatch) {
                    if (inList !== 'ol') {
                        flushList();
                        out.push('<ol class="md-ol">');
                        inList = 'ol';
                    }
                    out.push('<li class="md-li">' + _parseInline(olMatch[2]) + '</li>');
                    continue;
                } else {
                    flushList();
                }

                if (!trimmed) {
                    continue;
                }

                out.push('<p class="md-p">' + _parseInline(line) + '</p>');
            }

            flushQuote();
            flushList();
            flushTable();

            let finalHtml = out.join('\n');

            finalHtml = finalHtml.replace(/\uE002_(\d+)_\uE003/g, (_, idx) => {
                const block = codeBlocks[Number(idx)];
                if (!block) return '';
                const lang = (block.lang || '').toLowerCase();
                const code = block.code;
                const highlighted = this._renderHighlightedCode(code, lang, false);
                const encodedCode = encodeURIComponent(code);
                return [
                    '<div class="md-code-block">',
                    '  <div class="md-code-header">',
                    '    <span class="md-code-lang">' + (lang || 'code') + '</span>',
                    '    <button type="button" class="md-code-copy-btn" data-code="' + encodedCode + '">复制</button>',
                    '  </div>',
                    '  <div class="md-code-body">' + highlighted + '</div>',
                    '</div>'
                ].join('\n');
            });

            return '<div class="markdown-body">' + finalHtml + '</div>';
        }

        renderTextContent(content = '', filename = '') {
            const viewerEl = this.textViewer || document.getElementById('text-viewer');
            if (!viewerEl) return;
            const name = filename || this.currentTextName || '';
            const ext = (name.split('.').pop() || '').toLowerCase();
            const isMd = ['md', 'markdown', 'mdown', 'mkd'].includes(ext);
            const isCode = ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'json', 'py', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'html', 'htm', 'xml', 'svg', 'css', 'scss', 'less', 'c', 'cpp', 'h', 'hpp', 'cs', 'rs', 'go', 'java', 'sql', 'yaml', 'yml', 'toml', 'ini', 'diff', 'patch'].includes(ext);

            if (isMd) {
                viewerEl.style.whiteSpace = 'normal';
                viewerEl.style.wordBreak = 'break-word';
                viewerEl.style.padding = '0';
                viewerEl.innerHTML = this._renderMarkdown(content);
            } else if (isCode) {
                viewerEl.style.whiteSpace = 'normal';
                viewerEl.style.wordBreak = 'normal';
                viewerEl.style.padding = '0';
                viewerEl.innerHTML = this._renderHighlightedCode(content, ext, true);
            } else {
                viewerEl.style.whiteSpace = 'pre-wrap';
                viewerEl.style.wordBreak = 'break-all';
                viewerEl.style.padding = '16px';
                viewerEl.textContent = content;
            }
        }

        async showTextPreview(name, path) {
            const titleEl = this.textTitle || document.getElementById('text-title');
            const viewerEl = this.textViewer || document.getElementById('text-viewer');
            const inputEl = document.getElementById('text-editor-input');
            const modalEl = this.textModal || document.getElementById('text-modal');
            const badgeEl = document.getElementById('text-editor-badge');
            const iconEl = document.getElementById('text-editor-icon');
            const extEl = document.getElementById('text-stat-ext');

            this.currentTextPath = path;
            this.currentTextName = name;
            this.originalTextContent = '';
            this.isTextEditing = false;

            const ext = (name.split('.').pop() || '').toLowerCase();
            const isMd = ['md', 'markdown', 'mdown', 'mkd'].includes(ext);
            const isCode = ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'json', 'py', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'html', 'htm', 'xml', 'svg', 'css', 'scss', 'less', 'c', 'cpp', 'h', 'hpp', 'cs', 'rs', 'go', 'java', 'sql', 'yaml', 'yml', 'toml', 'ini', 'diff', 'patch'].includes(ext);

            if (titleEl) titleEl.textContent = name;
            if (iconEl && global.Icons) {
                let iconName = 'fileText';
                if (isMd) iconName = 'bookOpen';
                else if (isCode) iconName = 'code';
                iconEl.innerHTML = global.Icons.render(iconName, 16);
            }
            if (extEl) {
                extEl.textContent = isMd ? 'MARKDOWN' : (ext.toUpperCase() || 'TXT');
            }
            if (viewerEl) {
                viewerEl.style.whiteSpace = 'pre-wrap';
                viewerEl.style.padding = '16px';
                viewerEl.textContent = '加载中...';
            }
            if (inputEl) inputEl.value = '';
            this.setEditorMode(false);

            if (modalEl) modalEl.style.display = 'flex';
            this._bindTextEditorEvents();

            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const authHeaders = (global.LanDiskAuth && global.LanDiskAuth.authHeaders) ? global.LanDiskAuth.authHeaders() : {};
            const authQ = (global.LanDiskAuth && global.LanDiskAuth.authQuery) ? global.LanDiskAuth.authQuery().replace(/^\?/, '&') : '';

            try {
                const fetchFn = this.apiFetch || window.fetch.bind(window);
                // 优先走 /api/read-text：服务端有 10MB 上限与转义，比整文件下载更省流量
                const textRes = await fetchFn(getUrl(`/api/read-text?path=${encodeURIComponent(path)}${authQ}`), { headers: authHeaders });
                if (textRes.ok) {
                    const data = await textRes.json();
                    const content = data.content || '';
                    this.originalTextContent = content;
                    if (inputEl) inputEl.value = content;
                    this.renderTextContent(content, name);
                    this.updateTextStats(content);
                    return;
                }
                if (textRes.status === 400 || textRes.status === 413) {
                    const errData = await textRes.json().catch(() => ({}));
                    const errMsg = `无法预览: ${errData.error || '文件过大'}`;
                    if (viewerEl) {
                        viewerEl.style.whiteSpace = 'pre-wrap';
                        viewerEl.style.padding = '16px';
                        viewerEl.textContent = errMsg;
                    }
                    if (badgeEl) badgeEl.textContent = '不可编辑';
                    return;
                }
                throw new Error('无法读取文件内容');
            } catch (err) {
                // 兜底：按原始文件下载后以文本展示
                try {
                    const fetchFn = this.apiFetch || window.fetch.bind(window);
                    const res = await fetchFn(getUrl(`/api/download?path=${encodeURIComponent(path)}${authQ}`), { headers: authHeaders });
                    if (!res.ok) throw new Error('无法读取文件内容');
                    const text = await res.text();
                    this.originalTextContent = text;
                    if (inputEl) inputEl.value = text;
                    this.renderTextContent(text, name);
                    this.updateTextStats(text);
                } catch (err2) {
                    if (viewerEl) {
                        viewerEl.style.whiteSpace = 'pre-wrap';
                        viewerEl.style.padding = '16px';
                        viewerEl.textContent = `读取失败: ${err2.message}`;
                    }
                    if (badgeEl) badgeEl.textContent = '错误';
                }
            }
        }

        setEditorMode(isEdit) {
            this.isTextEditing = !!isEdit;
            const viewerEl = this.textViewer || document.getElementById('text-viewer');
            const inputEl = document.getElementById('text-editor-input');
            const toggleBtn = document.getElementById('btn-text-mode-toggle');
            const saveBtn = document.getElementById('btn-text-save');
            const badgeEl = document.getElementById('text-editor-badge');

            if (isEdit) {
                if (viewerEl) viewerEl.style.display = 'none';
                if (inputEl) {
                    inputEl.style.display = 'block';
                    inputEl.focus();
                }
                if (toggleBtn) toggleBtn.innerHTML = (global.Icons ? global.Icons.render('fileText', 13) : '') + ' 预览';
                if (saveBtn) saveBtn.style.display = 'inline-flex';
                if (badgeEl) {
                    badgeEl.textContent = '编辑中';
                    badgeEl.className = 'apple-badge apple-badge-sm apple-badge-warning';
                }
            } else {
                const currentContent = inputEl ? inputEl.value : (this.originalTextContent || '');
                if (viewerEl) {
                    this.renderTextContent(currentContent, this.currentTextName);
                    viewerEl.style.display = 'block';
                }
                if (inputEl) inputEl.style.display = 'none';
                if (toggleBtn) toggleBtn.innerHTML = (global.Icons ? global.Icons.render('pencil', 13) : '') + ' 编辑';
                if (saveBtn) saveBtn.style.display = 'none';
                if (badgeEl) {
                    const isDirty = inputEl && inputEl.value !== this.originalTextContent;
                    if (isDirty) {
                        badgeEl.textContent = '未保存修改 (预览)';
                        badgeEl.className = 'apple-badge apple-badge-sm apple-badge-warning';
                    } else {
                        const ext = (this.currentTextName || '').split('.').pop().toLowerCase();
                        const isMd = ['md', 'markdown', 'mdown', 'mkd'].includes(ext);
                        const isCode = ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'json', 'py', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'html', 'htm', 'xml', 'svg', 'css', 'scss', 'less', 'c', 'cpp', 'h', 'hpp', 'cs', 'rs', 'go', 'java', 'sql', 'yaml', 'yml', 'toml', 'ini', 'diff', 'patch'].includes(ext);
                        badgeEl.textContent = isMd ? 'Markdown 预览' : (isCode ? '代码高亮' : '只读预览');
                        badgeEl.className = 'apple-badge apple-badge-sm apple-badge-info';
                    }
                }
            }
        }

        updateTextStats(content = '') {
            const lines = content ? content.split('\n').length : 0;
            const chars = content ? content.length : 0;
            const lineEl = document.getElementById('text-stat-lines');
            const charEl = document.getElementById('text-stat-chars');
            if (lineEl) lineEl.textContent = `${lines} 行`;
            if (charEl) charEl.textContent = `${chars} 字符`;
        }

        async saveTextContent() {
            if (!this.currentTextPath) return;
            const inputEl = document.getElementById('text-editor-input');
            const saveBtn = document.getElementById('btn-text-save');
            const badgeEl = document.getElementById('text-editor-badge');
            const content = inputEl ? inputEl.value : '';

            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = (global.Icons ? global.Icons.render('refresh', 13) : '') + ' 保存中…';
            }

            const getUrl = typeof this.getApiUrl === 'function' ? this.getApiUrl : (p => p);
            const authHeaders = (global.LanDiskAuth && global.LanDiskAuth.authHeaders) ? global.LanDiskAuth.authHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };

            try {
                const fetchFn = this.apiFetch || window.fetch.bind(window);
                const res = await fetchFn(getUrl('/api/save-text'), {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ path: this.currentTextPath, content })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) {
                    this.originalTextContent = content;
                    this.renderTextContent(content, this.currentTextName);
                    if (global.LanDiskUI && global.LanDiskUI.toast) {
                        global.LanDiskUI.toast('文件已成功保存', 'success');
                    }
                    if (badgeEl) {
                        badgeEl.textContent = '已保存';
                        badgeEl.className = 'apple-badge apple-badge-sm apple-badge-success';
                    }
                } else {
                    if (global.LanDiskUI && global.LanDiskUI.toast) {
                        global.LanDiskUI.toast(data.error || '保存失败（免密模式下需持权写入）', 'error');
                    }
                }
            } catch (e) {
                if (global.LanDiskUI && global.LanDiskUI.toast) {
                    global.LanDiskUI.toast('保存遇到网络异常', 'error');
                }
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = (global.Icons ? global.Icons.render('check', 13) : '') + ' 保存';
                }
            }
        }

        copyTextContent() {
            const inputEl = document.getElementById('text-editor-input');
            const text = (this.isTextEditing && inputEl) ? inputEl.value : (this.originalTextContent || (inputEl ? inputEl.value : ''));
            if (!text) {
                if (global.LanDiskUI && global.LanDiskUI.toast) global.LanDiskUI.toast('内容为空', 'info');
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    if (global.LanDiskUI && global.LanDiskUI.toast) global.LanDiskUI.toast('全文已复制到剪贴板', 'success');
                }).catch(() => {});
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                if (global.LanDiskUI && global.LanDiskUI.toast) global.LanDiskUI.toast('全文已复制到剪贴板', 'success');
            }
        }

        _bindTextEditorEvents() {
            if (this._textEditorEventsBound) return;
            this._textEditorEventsBound = true;

            const modalEl = this.textModal || document.getElementById('text-modal');
            const inputEl = document.getElementById('text-editor-input');
            const toggleBtn = document.getElementById('btn-text-mode-toggle');
            const saveBtn = document.getElementById('btn-text-save');
            const copyBtn = document.getElementById('btn-text-copy');
            const closeBtn = document.getElementById('text-modal-close');

            toggleBtn && toggleBtn.addEventListener('click', () => {
                this.setEditorMode(!this.isTextEditing);
            });

            saveBtn && saveBtn.addEventListener('click', () => {
                this.saveTextContent();
            });

            copyBtn && copyBtn.addEventListener('click', () => {
                this.copyTextContent();
            });

            closeBtn && closeBtn.addEventListener('click', () => {
                this.closeModals();
            });

            // Tab 缩进支持 (按 Tab 插入 2 个空格而非切换焦点)
            if (inputEl) {
                inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = inputEl.selectionStart;
                        const end = inputEl.selectionEnd;
                        inputEl.value = inputEl.value.substring(0, start) + '  ' + inputEl.value.substring(end);
                        inputEl.selectionStart = inputEl.selectionEnd = start + 2;
                        this.updateTextStats(inputEl.value);
                    }
                });

                inputEl.addEventListener('input', () => {
                    this.updateTextStats(inputEl.value);
                    const badgeEl = document.getElementById('text-editor-badge');
                    if (badgeEl && inputEl.value !== this.originalTextContent) {
                        badgeEl.textContent = '未保存修改';
                        badgeEl.className = 'apple-badge apple-badge-sm apple-badge-warning';
                    }
                });
            }

            // Ctrl+S / Cmd+S 快捷保存与 Esc 快捷关闭
            if (modalEl) {
                modalEl.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                        e.preventDefault();
                        this.saveTextContent();
                    } else if (e.key === 'Escape') {
                        this.closeModals();
                    }
                });
            }

            // 代码块独立快速复制按钮事件代理
            const viewerEl = this.textViewer || document.getElementById('text-viewer');
            if (viewerEl) {
                viewerEl.addEventListener('click', (e) => {
                    const copyBtn = e.target.closest('.md-code-copy-btn');
                    if (!copyBtn) return;
                    const encodedCode = copyBtn.getAttribute('data-code');
                    const codeText = encodedCode ? decodeURIComponent(encodedCode) : '';
                    if (!codeText) return;

                    const copySuccess = () => {
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = '已复制!';
                        copyBtn.style.color = '#34c759';
                        setTimeout(() => {
                            copyBtn.textContent = originalText;
                            copyBtn.style.color = '';
                        }, 1800);
                        if (global.LanDiskUI && global.LanDiskUI.toast) {
                            global.LanDiskUI.toast('代码块已复制', 'success');
                        }
                    };

                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(codeText).then(copySuccess).catch(() => {});
                    } else {
                        const ta = document.createElement('textarea');
                        ta.value = codeText;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        copySuccess();
                    }
                });
            }
        }

        closeModals() {
            this.resetZoom();
            const imgModal = this.imageModal || document.getElementById('image-modal');
            const txtModal = this.textModal || document.getElementById('text-modal');
            if (imgModal) imgModal.style.display = 'none';
            if (txtModal) txtModal.style.display = 'none';
        }
    }

    global.MediaHubComponent = MediaHub;
    // 不再自动创建全局实例：页面（如 index.html）会用带配置的构造函数创建
    // window.MediaHubInstance，脚本级自动实例会给同一弹窗挂重复手势监听器。

})(typeof window !== 'undefined' ? window : this);
