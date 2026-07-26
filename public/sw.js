const CACHE_NAME = 'lan-disk-video-cache-v1';

// 安装时跳过等待，立即接管
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// 激活时清除旧缓存并立即控制页面
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 拦截网络请求，对视频流进行特殊处理 (Range Request 缓存代理)
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 仅拦截视频流 API
    if (url.pathname === '/api/stream' && request.headers.has('range')) {
        event.respondWith(handleVideoRangeRequest(request, event));
    } else {
        // 其他请求直接放行
        event.respondWith(fetch(request));
    }
});

async function handleVideoRangeRequest(request, event) {
    const cache = await caches.open(CACHE_NAME);
    const rangeHeader = request.headers.get('range');
    
    // 生成一个带有 Range 标记的唯一缓存 Key
    const cacheKey = request.url + '&range=' + rangeHeader;
    
    // 1. 检查本地是否有此片段的缓存
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        // 缓存命中，直接从手机内存/闪存返回，实现 0 延迟秒播
        return cachedResponse;
    }

    // 2. 如果没有缓存，则向服务器发起请求
    try {
        const networkResponse = await fetch(request);
        
        // 只有成功的 206 Partial Content 才值得缓存
        if (networkResponse.status === 206) {
            // 复制一份响应放入缓存，不阻塞原响应返回给播放器
            const responseToCache = networkResponse.clone();
            
            // 异步存入缓存
            event.waitUntil(cache.put(cacheKey, responseToCache));
        }
        
        return networkResponse;
    } catch (error) {
        console.error('Service Worker Fetch Failed:', error);
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
}