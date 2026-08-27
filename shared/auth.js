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
            if (window.currentServerUrl) return window.currentServerUrl.replace(/\/$/, '');
            try {
                const saved = localStorage.getItem('landisk_custom_server');
                if (saved) {
                    window.currentServerUrl = saved;
                    return saved.replace(/\/$/, '');
                }
            } catch (e) {}
            // 如果在浏览器通过常规 http 访问，默认使用当前 origin
            if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
                if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                    return window.location.origin;
                }
                if (window.location.port && window.location.port !== '80' && window.location.port !== '443') {
                    return window.location.origin;
                }
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

    global.LanDiskAuth = { getPin, getToken, hasCredentials, authHeaders, authQuery, getServerUrl, setServerUrl, api };
    if (typeof window !== 'undefined') {
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
