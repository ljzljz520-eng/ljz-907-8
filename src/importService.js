const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const iconv = require('iconv-lite');
const { pool, ensureConnectionCharset } = require('./db');

const CATEGORIES = ['种植', '养殖', '病虫害', '农机操作'];
const SEASON_MAP = {
  '春': '春', '春季': '春', 'spring': '春',
  '夏': '夏', '夏季': '夏', 'summer': '夏',
  '秋': '秋', '秋季': '秋', 'autumn': '秋', 'fall': '秋',
  '冬': '冬', '冬季': '冬', 'winter': '冬',
};

// 兼容中英文表头
const HEADER_MAP = {
  '标题': 'title', '视频标题': 'title', '名称': 'title', 'title': 'title',
  '类别': 'category', '分类': 'category', '类型': 'category', 'category': 'category', 'type': 'category',
  '作物': 'crop', '作物/对象': 'crop', '养殖对象': 'crop', '品种': 'crop', 'crop': 'crop',
  '季节': 'seasons', '适用季节': 'seasons', 'season': 'seasons', 'seasons': 'seasons',
  '适用地区': 'region', '地区': 'region', '区域': 'region', 'region': 'region', 'area': 'region',
  '视频地址': 'url', '视频链接': 'url', '地址': 'url', '链接': 'url', 'url': 'url', 'link': 'url',
  '时长': 'duration', '时长(秒)': 'duration', '时长（秒）': 'duration', 'duration': 'duration',
  '注意事项': 'precautions', 'precautions': 'precautions', 'notice': 'precautions',
  '简介': 'description', '视频简介': 'description', '说明': 'description', 'description': 'description',
  '来源': 'source', '讲师': 'source', '来源/讲师': 'source', 'source': 'source',
};

function decodeBuffer(buf) {
  // 简易 UTF-8 BOM 检测；否则按 GBK 解码（农技站 Excel 常见导出编码）
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf8');
  }
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('�')) return utf8;
  return iconv.decode(buf, 'gbk');
}

function normalizeSeasons(raw, errors) {
  const rawStr = String(raw || '').trim();
  if (!rawStr) return '';
  const parts = rawStr.split(/[,，、\/\s]+/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const key = p.toLowerCase().trim();
    const s = SEASON_MAP[p.trim()] || SEASON_MAP[key];
    if (!s) {
      errors.push(`季节“${p}”无效，只能为 春/夏/秋/冬`);
    } else if (!out.includes(s)) {
      out.push(s);
    }
  }
  return out.join(',');
}

function validateRow(raw, rowNum) {
  const errors = [];
  const r = {};

  const title = (raw.title || '').trim();
  if (!title) errors.push('缺少标题');
  if (title.length > 200) errors.push('标题超过200字');
  r.title = title;

  const category = (raw.category || '').trim();
  if (!category) errors.push('缺少类别');
  else if (!CATEGORIES.includes(category)) errors.push(`类别“${category}”无效，只能为：${CATEGORIES.join('/')}`);
  r.category = category;

  const crop = (raw.crop || '').trim();
  if (!crop) errors.push('缺少作物/养殖对象');
  r.crop = crop;

  r.seasons = normalizeSeasons(raw.seasons, errors);
  r.region = (raw.region || '').trim();

  const url = (raw.url || '').trim();
  if (!url) errors.push('缺少视频地址');
  else if (!/^https?:\/\/.+/i.test(url)) errors.push('视频地址必须以 http:// 或 https:// 开头');
  r.url = url;

  const durationRaw = (raw.duration || '').toString().trim();
  let duration = 0;
  if (durationRaw) {
    if (!/^\d+$/.test(durationRaw)) errors.push('时长必须为整数秒');
    else duration = Number(durationRaw);
  }
  r.duration = duration;

  r.precautions = (raw.precautions || '').trim();
  r.description = (raw.description || '').trim();
  r.source = (raw.source || '').trim();

  return { row: r, errors: errors.map(e => `第${rowNum}行：${e}`) };
}

/**
 * 导入 CSV
 * @param {Buffer} buffer 文件二进制
 * @param {string} originalName 原始文件名
 * @param {string} reportDir 报告目录
 * @returns 批次信息
 */
async function importCsv(buffer, originalName, reportDir) {
  const text = decodeBuffer(buffer);
  let records;
  try {
    records = parse(text, {
      columns: headers => headers.map(h => HEADER_MAP[h.trim()] || h.trim()),
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    });
  } catch (e) {
    throw new Error('CSV 解析失败：' + e.message);
  }

  if (!records.length) throw new Error('CSV 文件为空或缺少表头');

  const conn = await pool.getConnection();
  let batchId = null;
  const rowErrors = [];
  let success = 0;

  try {
    // 强制本次导入连接使用 utf8mb4，防止中文“类别”写入时被按其他字符集解释
    await ensureConnectionCharset(conn);
    await conn.beginTransaction();
    const [batchRes] = await conn.query(
      'INSERT INTO import_batches (filename, total_rows) VALUES (?, ?)',
      [originalName, records.length]
    );
    batchId = batchRes.insertId;

    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 2; // Excel 行号（含表头）
      const { row, errors } = validateRow(records[i], rowNum);

      if (errors.length) {
        rowErrors.push(...errors);
        continue;
      }

      // 重复检测：标题 + 地址 完全相同视为重复
      const [dup] = await conn.query(
        'SELECT id FROM videos WHERE title = ? AND url = ? LIMIT 1',
        [row.title, row.url]
      );
      if (dup.length) {
        rowErrors.push(`第${rowNum}行：视频“${row.title}”已存在（标题+地址重复），已跳过`);
        continue;
      }

      await conn.query(
        `INSERT INTO videos
         (title, category, crop, seasons, region, url, duration, precautions, description, source, import_batch_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [row.title, row.category, row.crop, row.seasons, row.region, row.url,
         row.duration, row.precautions || null, row.description || null, row.source || null, batchId]
      );
      success++;
    }

    const fail = records.length - success;
    let reportRel = null;

    if (fail > 0) {
      const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const reportName = `import-error-${batchId}-${ts}.csv`;
      const reportPath = path.join(reportDir, reportName);

      const csvCell = v => {
        const s = String(v ?? '');
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = [['行号', '错误原因', '原始内容']];
      for (const e of rowErrors) {
        const m = e.match(/^第(\d+)行：(.*)$/);
        const rn = m ? m[1] : '';
        const reason = m ? m[2] : e;
        const orig = records[Number(rn) - 2] || {};
        rows.push([rn, reason, Object.values(orig).map(v => csvCell(v)).join(',')]);
      }
      const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
      fs.writeFileSync(reportPath, '﻿' + csv, 'utf8');
      reportRel = `/data/${reportName}`;
    }

    await conn.query(
      'UPDATE import_batches SET success_count=?, fail_count=?, report_path=? WHERE id=?',
      [success, fail, reportRel, batchId]
    );
    await conn.commit();

    return {
      batchId, total: records.length, success, fail,
      reportPath: reportRel,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}


module.exports = {
  importCsv,
  CATEGORIES,
  decodeBuffer,
  normalizeSeasons,
  validateRow,
  HEADER_MAP,
};
