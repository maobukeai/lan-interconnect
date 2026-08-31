const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { TRASH_DIR } = require('../config');

/**
 * 回收站服务
 * 删除的文件/文件夹移入 ~/.landisk/trash/<id>__<原文件名>，
 * 元数据持久化在 trash.json，支持恢复与彻底清空。
 * 跨盘符 move 失败(EXDEV)时降级为 递归复制 + 删除原文件。
 */

const TRASH_META_FILE = path.join(TRASH_DIR, '..', 'trash.json');
let trashItems = [];

function ensureTrashDir() {
    if (!fs.existsSync(TRASH_DIR)) {
        try { fs.mkdirSync(TRASH_DIR, { recursive: true }); } catch (e) {}
    }
}

function loadMeta() {
    ensureTrashDir();
    try {
        if (fs.existsSync(TRASH_META_FILE)) {
            const arr = JSON.parse(fs.readFileSync(TRASH_META_FILE, 'utf8'));
            if (Array.isArray(arr)) trashItems = arr;
        }
    } catch (e) {
        trashItems = [];
    }
}

function saveMeta() {
    try {
        ensureTrashDir();
        fs.writeFileSync(TRASH_META_FILE, JSON.stringify(trashItems), 'utf8');
    } catch (e) {}
}

// 异步计算目录大小：删除/恢复大目录时不再冻结事件循环拖垮正在播放的流
async function getSize(p) {
    try {
        const st = await fsp.stat(p);
        if (st.isFile()) return st.size;
        let total = 0;
        const walk = async (dir) => {
            let items;
            try {
                items = await fsp.readdir(dir, { withFileTypes: true });
            } catch (e) {
                return;
            }
            const subDirs = [];
            const fileStats = [];
            for (const item of items) {
                const full = path.join(dir, item.name);
                if (item.isDirectory()) subDirs.push(full);
                else fileStats.push(fsp.stat(full).then(s => { total += s.size; }).catch(() => {}));
            }
            await Promise.all(fileStats);
            for (const sub of subDirs) {
                await walk(sub);
            }
        };
        await walk(p);
        return total;
    } catch (e) { return 0; }
}

// 同盘 rename 秒完成；跨盘时降级为异步递归复制 + 删除，避免同步复制大目录阻塞事件循环
async function moveSafe(src, dest) {
    try {
        fs.renameSync(src, dest);
        return true;
    } catch (e) {
        try {
            await fsp.cp(src, dest, { recursive: true });
            await fsp.rm(src, { recursive: true, force: true });
            return true;
        } catch (e2) {
            try { await fsp.rm(dest, { recursive: true, force: true }); } catch (e3) {}
            return false;
        }
    }
}

// 移入回收站，返回条目；失败抛错
async function trashItem(originPath) {
    if (!fs.existsSync(originPath)) throw new Error('文件不存在');
    ensureTrashDir();

    const id = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    const name = path.basename(originPath);
    const trashPath = path.join(TRASH_DIR, `${id}__${name.replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '-')}`);

    if (!(await moveSafe(originPath, trashPath))) throw new Error('移动文件到回收站失败');

    const item = {
        id,
        name,
        originPath: path.resolve(originPath),
        trashPath,
        size: await getSize(trashPath),
        isDirectory: (() => { try { return fs.statSync(trashPath).isDirectory(); } catch (e) { return false; } })(),
        time: Date.now()
    };
    trashItems.unshift(item);
    if (trashItems.length > 200) {
        // 超限时丢弃最老的条目并清掉实体
        const overflow = trashItems.splice(200);
        overflow.forEach(o => { try { fs.rmSync(o.trashPath, { recursive: true, force: true }); } catch (e) {} });
    }
    saveMeta();
    return item;
}

async function restoreItem(id) {
    const item = trashItems.find(t => t.id === id);
    if (!item) throw new Error('回收站中不存在该条目');
    if (!fs.existsSync(item.trashPath)) throw new Error('回收站实体文件已丢失');

    const parentDir = path.dirname(item.originPath);
    try {
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
    } catch (e) {}

    // 目标已同名冲突时自动追加序号
    let dest = item.originPath;
    if (fs.existsSync(dest)) {
        const ext = path.extname(item.name);
        const stem = path.basename(item.name, ext);
        let n = 1;
        while (fs.existsSync(dest)) {
            dest = path.join(parentDir, `${stem} (${n})${ext}`);
            n++;
        }
    }

    if (!(await moveSafe(item.trashPath, dest))) throw new Error('恢复失败：无法移动文件');
    trashItems = trashItems.filter(t => t.id !== id);
    saveMeta();
    return { restoredTo: dest };
}

function purgeItem(id) {
    const item = trashItems.find(t => t.id === id);
    if (!item) throw new Error('回收站中不存在该条目');
    try { fs.rmSync(item.trashPath, { recursive: true, force: true }); } catch (e) {}
    trashItems = trashItems.filter(t => t.id !== id);
    saveMeta();
}

async function purgeAll() {
    let cleaned = 0;
    for (const item of trashItems) {
        try {
            await fsp.rm(item.trashPath, { recursive: true, force: true });
            cleaned++;
        } catch (e) {}
    }
    trashItems = [];
    saveMeta();
    return cleaned;
}

function list() {
    // 过滤实体已不存在的幽灵条目
    trashItems = trashItems.filter(t => {
        try { return fs.existsSync(t.trashPath); } catch (e) { return false; }
    });
    saveMeta();
    return trashItems.map(t => ({ id: t.id, name: t.name, originPath: t.originPath, size: t.size, isDirectory: t.isDirectory, time: t.time }));
}

// 清理回收站中滞留超过 30 天的条目（异步，避免清空大目录时阻塞）
async function cleanupExpired() {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const expired = trashItems.filter(t => t.time < cutoff);
    if (!expired.length) return 0;
    for (const t of expired) {
        try { await fsp.rm(t.trashPath, { recursive: true, force: true }); } catch (e) {}
    }
    trashItems = trashItems.filter(t => t.time >= cutoff);
    saveMeta();
    return expired.length;
}

loadMeta();

module.exports = { trashItem, restoreItem, purgeItem, purgeAll, list, cleanupExpired };
