const path = require('path');

/**
 * 目录列表内存缓存：短 TTL + 目录自身 mtime/size 指纹。
 * /api/files 每次请求全量重扫磁盘（大目录 5000 项串行 stat）是服务端最重的
 * 请求路径；缓存命中直接返回上一次结果，写操作后调用 invalidate 保持新鲜。
 */

const DIR_CACHE_TTL_MS = 5000;
const MAX_DIR_CACHE_SIZE = 200;

const dirCache = new Map(); // resolvedPath -> { key: fingerprint, ts, data }

function dirCacheGet(resolvedPath, fingerprint) {
    const entry = dirCache.get(resolvedPath);
    if (!entry) return null;
    if (entry.key !== fingerprint) return null;
    if (Date.now() - entry.ts > DIR_CACHE_TTL_MS) {
        dirCache.delete(resolvedPath);
        return null;
    }
    return entry.data;
}

function dirCacheSet(resolvedPath, fingerprint, data) {
    if (dirCache.size >= MAX_DIR_CACHE_SIZE) {
        // Map 按插入序迭代，淘汰最旧的条目
        const oldestKey = dirCache.keys().next().value;
        dirCache.delete(oldestKey);
    }
    dirCache.set(resolvedPath, { key: fingerprint, ts: Date.now(), data });
}

// 目录内容变动后失效对应目录
function dirCacheInvalidate(dirPath) {
    dirCache.delete(path.resolve(dirPath));
}

// 文件/目录被增删改后，失效其所在父目录的列表缓存
function dirCacheInvalidateParent(filePath) {
    dirCache.delete(path.resolve(path.dirname(filePath)));
}

module.exports = { dirCacheGet, dirCacheSet, dirCacheInvalidate, dirCacheInvalidateParent };
