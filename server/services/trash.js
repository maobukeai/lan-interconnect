const fs = require('fs');
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

function getSize(p) {
    try {
        const st = fs.statSync(p);
        if (st.isFile()) return st.size;
        let total = 0;
        const walk = (dir) => {
            for (const name of fs.readdirSync(dir)) {
                const full = path.join(dir, name);
                try {
                    const s = fs.statSync(full);
                    if (s.isDirectory()) walk(full); else total += s.size;
                } catch (e) {}
            }
        };
        walk(p);
        return total;
    } catch (e) { return 0; }
}

function moveSafe(src, dest) {
    try {
        fs.renameSync(src, dest);
        return true;
    } catch (e) {
        try {
            fs.cpSync(src, dest, { recursive: true });
            fs.rmSync(src, { recursive: true, force: true });
            return true;
        } catch (e2) {
            try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e3) {}
            return false;
        }
    }
}

// 移入回收站，返回条目；失败抛错
function trashItem(originPath) {
    if (!fs.existsSync(originPath)) throw new Error('文件不存在');
    ensureTrashDir();

    const id = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    const name = path.basename(originPath);
    const trashPath = path.join(TRASH_DIR, `${id}__${name.replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '-')}`);

    if (!moveSafe(originPath, trashPath)) throw new Error('移动文件到回收站失败');

    const item = {
        id,
        name,
        originPath: path.resolve(originPath),
        trashPath,
        size: getSize(trashPath),
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

function restoreItem(id) {
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

    if (!moveSafe(item.trashPath, dest)) throw new Error('恢复失败：无法移动文件');
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

function purgeAll() {
    let cleaned = 0;
    for (const item of trashItems) {
        try { fs.rmSync(item.trashPath, { recursive: true, force: true }); cleaned++; } catch (e) {}
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

// 清理回收站中滞留超过 30 天的条目
function cleanupExpired() {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const expired = trashItems.filter(t => t.time < cutoff);
    if (!expired.length) return;
    expired.forEach(t => {
        try { fs.rmSync(t.trashPath, { recursive: true, force: true }); } catch (e) {}
    });
    trashItems = trashItems.filter(t => t.time >= cutoff);
    saveMeta();
}

loadMeta();

module.exports = { trashItem, restoreItem, purgeItem, purgeAll, list, cleanupExpired };
