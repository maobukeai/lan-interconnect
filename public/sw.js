const STATIC_CACHE_NAME = 'lan-disk-static-v3';
const VIDEO_CACHE_NAME = 'lan-disk-video-cache-v3';

const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/favicon.svg',
    '/manifest.json',
    '/shared/apple-theme.css',
    '/shared/apple-player.css',
    '/shared/icons.js',
    '/shared/auth.js',
    '/shared/ui.js',
    '/shared/apple-player.js',
    '/shared/components/file-explorer.js',
    '/shared/components/file-bookmarks.js',
    '/shared/components/file-batch.js',
    '/shared/components/media-theater.js',
    '/shared/components/imessage-chat.js',
    '/shared/components/whiteboard.js',
    '/shared/components/process-monitor.js',
    '/shared/components/web-terminal.js',
    '/shared/components/remote-control.js'
];

// 安装阶段：预缓存核心前端资产并跳过等待
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('[SW] Precache partial error:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// 激活阶段：清理废弃旧缓存并立即接管所有客户端
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== STATIC_CACHE_NAME && key !== VIDEO_CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 拦截请求分发
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. 针对视频流 API 的 Range 切片秒播缓存
    if (url.pathname === '/api/stream' && request.headers.has('range')) {
        event.respondWith(handleVideoRangeRequest(request, event));
        return;
    }

    // 2. 忽略非 GET 请求、其他 API 动态接口与 WebSocket 连接
    if (request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
        return;
    }

    // 3. 对静态文件采用 Stale-While-Revalidate（缓存优先秒开，后台异步更新）
    event.respondWith(
        caches.open(STATIC_CACHE_NAME).then(async (cache) => {
            const cachedResponse = await cache.match(request);
            
            // 后台异步向网络请求最新资源
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            }).catch(() => null);

            // 如果本地已有缓存，0 毫秒即刻返回给用户呈现 UI；否则等待网络响应
            return cachedResponse || (await fetchPromise) || new Response('Offline', { status: 503 });
        })
    );
});

const MAX_VIDEO_CACHE_ITEMS = 60;
// 单个切片超过该字节数不入缓存：防止整部大视频/超大 Range 响应把磁盘缓存撑爆
const MAX_VIDEO_CACHE_BYTES = 8 * 1024 * 1024;

async function trimVideoCache(cache) {
    try {
        const keys = await cache.keys();
        if (keys.length > MAX_VIDEO_CACHE_ITEMS) {
            for (let i = 0; i < 15; i++) {
                if (keys[i]) await cache.delete(keys[i]);
            }
        }
    } catch(e) {}
}

async function handleVideoRangeRequest(request, event) {
    const cache = await caches.open(VIDEO_CACHE_NAME);
    const rangeHeader = request.headers.get('range');
    const url = new URL(request.url);

    // 缓存 key 剥离 pin/token 凭据参数，避免鉴权凭据被持久化到磁盘缓存
    const keyUrl = new URL(request.url);
    keyUrl.searchParams.delete('pin');
    keyUrl.searchParams.delete('token');
    const cacheKey = keyUrl.origin + keyUrl.pathname + keyUrl.search + (keyUrl.search ? '&' : '?') + 'range=' + encodeURIComponent(rangeHeader);
    
    // 1. 检查是否有本地视频切片缓存
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        return cachedResponse;
    }

    // 2. 向服务端请求 Range
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.status === 206) {
            const contentLength = parseInt(networkResponse.headers.get('content-length') || '0', 10);
            if (contentLength > 0 && contentLength <= MAX_VIDEO_CACHE_BYTES) {
                const responseToCache = networkResponse.clone();
                event.waitUntil(
                    cache.put(cacheKey, responseToCache).then(() => trimVideoCache(cache))
                );
            }
        }
        return networkResponse;
    } catch (error) {
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
}