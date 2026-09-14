const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 仅当显式提供 TEST_DB=1 且可连接数据库时运行；否则跳过（保证无 DB 环境 npm test 也能通过）
const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'agri_video_test',
};

let pool;
let importCsv;
let reportDir;
let enabled = false;
let skipReason = '';

before(async () => {
  if (process.env.TEST_DB !== '1') {
    skipReason = '未设置 TEST_DB=1，跳过数据库集成测试';
    return;
  }
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    skipReason = '缺少 mysql2 依赖';
    return;
  }
  try {
    // 先不指定库连接以建库
    const root = await mysql.createConnection({
      host: DB.host, port: DB.port, user: DB.user, password: DB.password,
      charset: 'utf8mb4_unicode_ci',
    });
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB.database}\`
       DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await root.end();

    process.env.DB_NAME = DB.database;
    // 清掉 require 缓存，确保使用测试库
    for (const k of Object.keys(require.cache)) if (k.includes('/src/')) delete require.cache[k];
    const dbMod = require('../src/db');
    pool = dbMod.pool;
    importCsv = require('../src/importService').importCsv;
    await dbMod.ensureSchema();
    reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-it-'));
    enabled = true;
  } catch (e) {
    skipReason = `数据库不可用：${e.code || e.message}`;
  }
});

after(async () => {
  if (pool) await pool.end();
});

describe('数据库集成：CSV 导入（回归 "Data truncated for category"）', { concurrency: false }, () => {
  test('中文“类别”可正常写入 utf8mb4 ENUM/VARCHAR 列，不报 Data truncated', async t => {
    if (!enabled) { t.skip(skipReason); return; }
    await pool.query('DELETE FROM videos');
    const buf = fs.readFileSync(path.join(__dirname, '..', 'sample.csv'));
    const r = await importCsv(buf, 'sample.csv', reportDir);
    assert.equal(r.success, 7, `应成功 7 行，实际 ${r.success}（${JSON.stringify(r)}）`);
    assert.equal(r.fail, 2, 'sample.csv 自带 2 行错误示例');

    const [rows] = await pool.query('SELECT category, HEX(category) AS hx, title FROM videos ORDER BY id');
    assert.equal(rows.length, 7);
    const expectHex = {
      '种植': Buffer.from('种植').toString('hex').toUpperCase(),
      '养殖': Buffer.from('养殖').toString('hex').toUpperCase(),
      '病虫害': Buffer.from('病虫害').toString('hex').toUpperCase(),
      '农机操作': Buffer.from('农机操作').toString('hex').toUpperCase(),
    };
    for (const row of rows) {
      assert.ok(
        ['种植', '养殖', '病虫害', '农机操作'].includes(row.category),
        `类别异常：${row.category}（标题 ${row.title}）`
      );
      assert.equal(row.hx, expectHex[row.category], `类别字节非 UTF-8：${row.title}`);
    }
  });

  test('重复导入触发“标题+地址”判重，不产生重复数据', async t => {
    if (!enabled) { t.skip(skipReason); return; }
    const buf = fs.readFileSync(path.join(__dirname, '..', 'sample.csv'));
    const r = await importCsv(buf, 'sample.csv', reportDir);
    assert.equal(r.success, 0);
    assert.equal(r.fail, 9);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM videos');
    assert.equal(n, 7);
  });

  test('错误批次生成可下载的 UTF-8 BOM 报告', async t => {
    if (!enabled) { t.skip(skipReason); return; }
    assert.ok(fs.existsSync(reportDir));
    const reports = fs.readdirSync(reportDir).filter(f => f.endsWith('.csv'));
    assert.ok(reports.length >= 1, '应至少生成一份错误报告');
    const raw = fs.readFileSync(path.join(reportDir, reports[0]));
    assert.deepEqual([raw[0], raw[1], raw[2]], [0xef, 0xbb, 0xbf], '报告需带 UTF-8 BOM');
    assert.ok(raw.toString('utf8').includes('行号'));
  });

  test('CHECK 约束拒绝四类之外的类别', async t => {
    if (!enabled) { t.skip(skipReason); return; }
    await assert.rejects(
      () => pool.query(
        'INSERT INTO videos (title,category,crop,url) VALUES (?,?,?,?)',
        ['非法类别用例', '渔业', '鱼', 'https://example.com/bad']
      ),
      /chk_category|CONSTRAINT|CHECK/i
    );
  });

  test('每个连接的 character_set_client 都是 utf8mb4', async t => {
    if (!enabled) { t.skip(skipReason); return; }
    const conns = await Promise.all(Array.from({ length: 5 }, () => pool.getConnection()));
    try {
      for (const c of conns) {
        const [[v]] = await c.query(
          "SELECT @@character_set_client AS cs, @@collation_connection AS col"
        );
        assert.equal(v.cs, 'utf8mb4');
        assert.equal(v.col, 'utf8mb4_unicode_ci');
      }
    } finally {
      conns.forEach(c => c.release());
    }
  });

  test('GBK 编码 CSV 导入后中文类别为正确 UTF-8 字节', async t => {
    if (!enabled) { t.skip(skipReason); return; }
    const iconv = require('iconv-lite');
    const text = '标题,类别,作物,视频地址\n' +
      '生猪养殖入门,养殖,生猪,https://example.com/it-gbk';
    await pool.query('DELETE FROM videos WHERE url = ?', ['https://example.com/it-gbk']);
    const r = await importCsv(iconv.encode(text, 'gbk'), 'gbk.csv', reportDir);
    assert.equal(r.success, 1, JSON.stringify(r));
    const [[row]] = await pool.query(
      'SELECT category, HEX(category) hx FROM videos WHERE url = ?',
      ['https://example.com/it-gbk']
    );
    assert.equal(row.category, '养殖');
    assert.equal(row.hx, Buffer.from('养殖').toString('hex').toUpperCase());
  });
});
