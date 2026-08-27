const express = require('express');
const router = express.Router();
const { checkSensitive } = require('../middleware/auth');
const historyService = require('../services/history');

// 传输记录列表
router.get('/history', (req, res) => {
    const limit = req.query.limit || 50;
    res.json({ items: historyService.listRecords(limit) });
});

// 清空传输记录
router.post('/history/clear', checkSensitive, (req, res) => {
    historyService.clearRecords();
    res.json({ success: true });
});

module.exports = router;
