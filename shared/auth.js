/**
 * 局域网互联 Pro - 统一鉴权与转义工具 (LanDiskAuth)
 * 职责：集中生成带 PIN / 扫码 Token 的请求头与查询串，并提供全局 escapeHtml。
 * 所有 shared/components 组件与页面内联脚本都通过本工具携带凭据，
 * 保证扫码登录的设备与输入 PIN 的设备走完全相同的鉴权链路。
 */

(function (global) {
    'use strict';

    function getPin() {
        try { return localStorage.getItem('lan_disk_pin') || ''; } catch (e) { return ''; }
    }

    function getToken() {
        try { return localStorage.getItem('lan_disk_qr_token') || ''; } catch (e) { return ''; }
    }

    function hasCredentials() {
        return !!(getPin() || getToken());
    }

    // 生成带凭据的请求头；extra 为附加头（如 Content-Type）
    function authHeaders(extra) {
        const headers = extra ? Object.assign({}, extra) : {};
        const pin = getPin();
        const token = getToken();
        if (pin) headers['x-pin'] = pin;
        if (token) headers['x-qr-token'] = token;
        return headers;
    }

    // 生成带凭据的查询串（用于 <img>/<video>/EventSource 等无法携带请求头的场景）
    // 返回 '' 或 '?pin=xxx&token=yyy'
    function authQuery() {
        const parts = [];
        const pin = getPin();
        const token = getToken();
        if (pin) parts.push('pin=' + encodeURIComponent(pin));
        if (token) parts.push('token=' + encodeURIComponent(token));
        return parts.length ? '?' + parts.join('&') : '';
    }

    function getServerUrl() {
        if (typeof window !== 'undefined') {
            const isTauri = !!window.isTauri || !!window.__TAURI__ || !!window.__TAURI_INTERNALS__ 
                || (typeof window.location !== 'undefined' && /(^|\.)localhost$/i.test(window.location.hostname) && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');
            const isCapacitor = !!window.Capacitor || (window.location && window.location.protocol === 'capacitor:');

            // 1. 如果在普通网页浏览器中直接通过常规 HTTP/HTTPS 访问（非 Tauri/Capacitor 内壳），
            // 当前页面的 origin 就是提供服务的后端，绝对优先使用当前 origin，防止被旧的 localStorage 缓存 IP 误导！
            if (!isTauri && !isCapacitor && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
                window.currentServerUrl = window.location.origin;
                return window.location.origin;
            }

            if (window.currentServerUrl) return window.currentServerUrl.replace(/\/$/, '');

            // 2. 检查用户配置的服务器地址（主要供移动端 App 容器绑定）
            try {
                const saved = localStorage.getItem('landisk_custom_server');
                if (saved) {
                    window.currentServerUrl = saved;
                    return saved.replace(/\/$/, '');
                }
            } catch (e) {}

            // 3. Tauri 桌面端本地回环
            if (isTauri) {
                return 'http://127.0.0.1:3000';
            }
        }
        return '';
    }

    function setServerUrl(url) {
        if (typeof window !== 'undefined') {
            if (!url) {
                window.currentServerUrl = '';
                try { localStorage.removeItem('landisk_custom_server'); } catch (e) {}
            } else {
                let clean = url.trim();
                if (!/^https?:\/\//i.test(clean)) clean = 'http://' + clean;
                clean = clean.replace(/\/$/, '');
                window.currentServerUrl = clean;
                try { localStorage.setItem('landisk_custom_server', clean); } catch (e) {}
            }
        }
    }

    function api(endpoint) {
        if (!endpoint) return '';
        const base = getServerUrl();
        if (base) {
            return base + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
        }
        return endpoint;
    }

    function timeoutSignal(ms) {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            try {
                return AbortSignal.timeout(ms);
            } catch (e) {}
        }
        if (typeof AbortController !== 'undefined') {
            const controller = new AbortController();
            const timer = setTimeout(() => {
                try {
                    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
                } catch (e) {
                    controller.abort();
                }
            }, ms);
            if (controller.signal && controller.signal.addEventListener) {
                controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
            }
            return controller.signal;
        }
        return undefined;
    }

    // 全局兼容补丁：低版本 Android WebView (Chrome < 103) 无 AbortSignal.timeout
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
        try {
            AbortSignal.timeout = function (ms) {
                return timeoutSignal(ms);
            };
        } catch (e) {}
    }

    global.LanDiskAuth = { getPin, getToken, hasCredentials, authHeaders, authQuery, getServerUrl, setServerUrl, api, timeoutSignal };
    if (typeof window !== 'undefined' && typeof window.api === 'undefined') {
        window.api = api;
    }

    // 全局 HTML 转义，防止文件名/设备信息等注入 innerHTML
    global.escapeHtml = global.escapeHtml || function (str) {
        if (typeof str !== 'string') return str == null ? '' : String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

})(typeof window !== 'undefined' ? window : this);
