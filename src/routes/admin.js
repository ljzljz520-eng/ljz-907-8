const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../db');
const { importCsv, CATEGORIES } = require('../importService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.csv$/i.test(file.originalname)) return cb(new Error('只允许上传 CSV 文件'));
    cb(null, true);
  },
});

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// 后台视频列表（含已过期），可按状态/类别筛选
router.get('/videos', async (req, res, next) => {
  try {
    const { status, category } = req.query;
    const where = ['1=1'];
    const params = [];
    if (status === 'expired') { where.push('is_expired = 1'); }
    if (status === 'active')  { where.push('is_expired = 0'); }
    if (category) { where.push('category = ?'); params.push(category); }

    const [rows] = await pool.query(
      `SELECT * FROM videos WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC, id DESC LIMIT 500`,
      params
    );
    res.json({ list: rows, categories: CATEGORIES });
  } catch (e) { next(e); }
});

// CSV 导入
router.post('/import', (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择 CSV 文件' });
    const result = await importCsv(req.file.buffer, req.file.originalname, DATA_DIR);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 导入历史批次
router.get('/batches', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM import_batches ORDER BY id DESC LIMIT 100'
    );
    res.json({ list: rows });
  } catch (e) { next(e); }
});

// 下载导入错误报告
router.get('/reports/:name', (req, res, next) => {
  const name = path.basename(req.params.name);
  const filePath = path.join(DATA_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '报告不存在' });
  res.download(filePath, `导入错误报告-${name}`);
});

// 标记过期 / 恢复
router.post('/videos/:id/expire', async (req, res, next) => {
  try {
    const { expired, reason } = req.body || {};
    const isExpired = expired === false || expired === 'false' ? 0 : 1;
    await pool.query(
      `UPDATE videos SET is_expired = ?,
        expire_reason = ?, expired_at = IF(? = 1, NOW(), NULL)
       WHERE id = ?`,
      [isExpired, isExpired ? (reason || '已过期') : null, isExpired, req.params.id]
    );
    res.json({ ok: true, is_expired: isExpired });
  } catch (e) { next(e); }
});

module.exports = router;
