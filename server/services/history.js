const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('../config');

/**
 * 传输记录服务：上传/下载成功的文件留痕，持久化在 ~/.landisk/history.json。
 * kind: 'upload' | 'download'
 */

const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_RECORDS = 200;

let records = [];
let persistTimer = null;

try {
    if (fs.existsSync(HISTORY_FILE)) {
        const arr = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        if (Array.isArray(arr)) records = arr;
    }
} catch (e) {
    records = [];
}

function safeWriteHistory() {
    const tmp = HISTORY_FILE + '.tmp';
    try {
        fs.writeFileSync(tmp, JSON.stringify(records), 'utf8');
        fs.renameSync(tmp, HISTORY_FILE);
    } catch (e) {
        try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(records), 'utf8'); } catch (e2) {}
    }
}

// 去抖落盘：连续传输每 250ms 最多写盘一次
function persist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        safeWriteHistory();
    }, 250);
}

function flushPersist() {
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
    }
    safeWriteHistory();
}

function recordTransfer(kind, { name, size, path: filePath, ip, detail }) {
    const rec = {
        id: Date.now().toString(36) + crypto.randomBytes(4).toString('hex'),
        kind, // upload | download
        name: String(name || '未知文件').slice(0, 200),
        size: Number(size) || 0,
        path: filePath ? String(filePath) : '',
        ip: ip || '',
        detail: detail ? String(detail).slice(0, 100) : '',
        time: Date.now()
    };
    records.unshift(rec);
    if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
    persist();
    return rec;
}

function listRecords(limit) {
    const n = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_RECORDS);
    return records.slice(0, n);
}

function clearRecords() {
    records = [];
    flushPersist();
}

module.exports = { recordTransfer, listRecords, clearRecords };
