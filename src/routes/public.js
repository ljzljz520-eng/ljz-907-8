const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// 筛选条件（作物、季节）下拉数据
router.get('/filters', async (req, res, next) => {
  try {
    const [crops] = await pool.query(
      `SELECT crop, COUNT(*) AS count FROM videos
       WHERE is_expired = 0 GROUP BY crop ORDER BY crop`
    );
    res.json({ crops, seasons: ['春', '夏', '秋', '冬'] });
  } catch (e) { next(e); }
});

// 视频列表：按类别/作物/季节/关键字筛选；过期视频前台不展示
router.get('/videos', async (req, res, next) => {
  try {
    const { category, crop, season, q } = req.query;
    const where = ['is_expired = 0'];
    const params = [];

    if (category) { where.push('category = ?'); params.push(category); }
    if (crop)     { where.push('crop = ?');     params.push(crop); }
    if (season)   { where.push('FIND_IN_SET(?, seasons)'); params.push(season); }
    if (q) {
      where.push('(title LIKE ? OR crop LIKE ? OR region LIKE ?)');
      const kw = `%${q}%`;
      params.push(kw, kw, kw);
    }

    const [rows] = await pool.query(
      `SELECT id, title, category, crop, seasons, region, duration, source, created_at
       FROM videos WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC, id DESC LIMIT 200`,
      params
    );
    res.json({ list: rows });
  } catch (e) { next(e); }
});

// 视频详情：含适用地区与注意事项
router.get('/videos/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM videos WHERE id = ? AND is_expired = 0',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: '视频不存在或已下架' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
