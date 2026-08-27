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

    global.LanDiskAuth = { getPin, getToken, hasCredentials, authHeaders, authQuery };

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
