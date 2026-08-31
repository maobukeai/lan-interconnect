/**
 * 猫步互联 · 统一媒体扩展名白名单 (UMD：浏览器挂 window.MediaTypes，服务端可直接 require)
 *
 * 此前视频/音频扩展名散落在 5 处各写一份正则且成员不一致：
 * 剧场海报墙漏掉 ts/flv/wmv/rmvb（这些文件能出缩略图却进不了播放列表）、
 * 服务端缩略图白名单又比流式 MIME 表宽。这里收敛为唯一事实源。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MediaTypes = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    // 视频容器。wmv/rmvv 等浏览器多数解不了的格式也保留：可以走外部播放器联动与直链复制
    var VIDEO_EXTS = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'flv', 'ts', 'm2ts',
        'wmv', '3gp', '3g2', 'mpg', 'mpeg', 'ogv', 'rm', 'rmvb'];
    // 音频容器
    var AUDIO_EXTS = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'opus', 'wma'];

    function toRe(exts) {
        return new RegExp('\\.(' + exts.join('|') + ')$', 'i');
    }

    var VIDEO_RE = toRe(VIDEO_EXTS);
    var AUDIO_RE = toRe(AUDIO_EXTS);

    return {
        VIDEO_EXTS: VIDEO_EXTS,
        AUDIO_EXTS: AUDIO_EXTS,
        VIDEO_RE: VIDEO_RE,
        AUDIO_RE: AUDIO_RE,
        MEDIA_RE: new RegExp('\\.(' + VIDEO_EXTS.concat(AUDIO_EXTS).join('|') + ')$', 'i'),
        isVideo: function (name) { return VIDEO_RE.test(String(name || '')); },
        isAudio: function (name) { return AUDIO_RE.test(String(name || '')); },
        isMedia: function (name) { return this.isVideo(name) || this.isAudio(name); }
    };
});
