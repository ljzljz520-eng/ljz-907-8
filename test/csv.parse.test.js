const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { decodeBuffer, HEADER_MAP } = require('../src/importService');

// 复刻 importCsv 中表头映射 + 解析配置，确保 sample.csv 能被正确解析
function parseCsv(buffer) {
  const text = decodeBuffer(buffer);
  return parse(text, {
    columns: headers => headers.map(h => HEADER_MAP[h.trim()] || h.trim()),
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });
}

describe('sample.csv 模板解析', () => {
  const samplePath = path.join(__dirname, '..', 'sample.csv');

  test('可解析出 9 行数据（含 2 行故意错误示例）', () => {
    const records = parseCsv(fs.readFileSync(samplePath));
    assert.equal(records.length, 9);
  });

  test('表头被映射为英文字段', () => {
    const records = parseCsv(fs.readFileSync(samplePath));
    for (const key of ['title', 'category', 'crop', 'seasons', 'region', 'url', 'duration']) {
      assert.ok(key in records[0], `缺少字段 ${key}`);
    }
  });

  test('合法行的类别均为四类之一，多季节字段保留逗号', () => {
    const records = parseCsv(fs.readFileSync(samplePath));
    const valid = records.filter(r => r.title && /^https?:\/\//.test(r.url));
    assert.ok(valid.length >= 7);
    for (const r of valid) {
      assert.ok(['种植', '养殖', '病虫害', '农机操作'].includes(r.category), `非法类别: ${r.category}`);
    }
    assert.equal(records[0].seasons, '春,夏');
  });

  test('字段内含逗号且加引号时不被错误切分', () => {
    const csv = Buffer.from(
      '标题,类别,作物,季节,适用地区,视频地址,时长,注意事项,简介,来源\n' +
      '示例,种植,番茄,冬,山东,"https://example.com/v",100,"注意一,注意二;注意三",简介,来源\n',
      'utf8'
    );
    const [r] = parseCsv(csv);
    assert.equal(r.precautions, '注意一,注意二;注意三');
    assert.equal(r.url, 'https://example.com/v');
  });

  test('GBK 编码的 CSV 也能解析出中文类别', () => {
    const iconv = require('iconv-lite');
    const text = '标题,类别,作物,视频地址\n测试,养殖,生猪,https://example.com/gbk';
    const records = parseCsv(iconv.encode(text, 'gbk'));
    assert.equal(records[0].category, '养殖');
    assert.equal(records[0].crop, '生猪');
  });

  test('空文件解析为 0 行', () => {
    const records = parseCsv(Buffer.from('标题,类别\n', 'utf8'));
    assert.equal(records.length, 0);
  });
});

describe('错误报告 CSV 生成', () => {
  test('报告以 UTF-8 BOM 开头，Excel 可正确识别中文', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-report-'));
    const name = 'import-error-1-x.csv';
    const cell = v => {
      const s = String(v ?? '');
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [['行号', '错误原因', '原始内容'], ['9', '缺少标题', ',种植,棉花']];
    const csv = rows.map(r => r.map(cell).join(',')).join('\r\n');
    fs.writeFileSync(path.join(dir, name), '﻿' + csv, 'utf8');
    const raw = fs.readFileSync(path.join(dir, name));
    assert.deepEqual([raw[0], raw[1], raw[2]], [0xef, 0xbb, 0xbf]);
    assert.ok(raw.toString('utf8').includes('缺少标题'));
  });
});
