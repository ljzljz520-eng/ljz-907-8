const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const iconv = require('iconv-lite');
const {
  CATEGORIES,
  decodeBuffer,
  normalizeSeasons,
  validateRow,
  HEADER_MAP,
} = require('../src/importService');

describe('常量', () => {
  test('类别固定为四类（与 DB CHECK 约束一致）', () => {
    assert.deepEqual(CATEGORIES, ['种植', '养殖', '病虫害', '农机操作']);
  });

  test('中文/英文表头都能映射', () => {
    assert.equal(HEADER_MAP['标题'], 'title');
    assert.equal(HEADER_MAP['类别'], 'category');
    assert.equal(HEADER_MAP['视频地址'], 'url');
    assert.equal(HEADER_MAP['title'], 'title');
    assert.equal(HEADER_MAP['url'], 'url');
  });
});

describe('decodeBuffer 编码识别', () => {
  test('UTF-8 无 BOM 原样解码', () => {
    const buf = Buffer.from('标题,类别\n稻瘟病,病虫害', 'utf8');
    assert.equal(decodeBuffer(buf), '标题,类别\n稻瘟病,病虫害');
  });

  test('UTF-8 BOM 被剥离', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('标题', 'utf8')]);
    assert.equal(decodeBuffer(buf), '标题');
  });

  test('GBK（Excel 默认）正确解码为中文', () => {
    const text = '标题,类别,作物\n稻瘟病,病虫害,水稻';
    const buf = iconv.encode(text, 'gbk');
    assert.equal(decodeBuffer(buf), text);
  });
});

describe('normalizeSeasons 季节归一化', () => {
  test('支持春/夏/秋/冬', () => {
    const e = [];
    assert.equal(normalizeSeasons('春', e), '春');
    assert.deepEqual(e, []);
  });

  test('支持“春季/summer”等别名与中英文逗号、去重', () => {
    const e = [];
    assert.equal(normalizeSeasons('春季, summer，秋、fall 秋', e), '春,夏,秋');
    assert.deepEqual(e, []);
  });

  test('非法季节记录错误', () => {
    const e = [];
    assert.equal(normalizeSeasons('春,旱季', e), '春');
    assert.equal(e.length, 1);
    assert.match(e[0], /季节.*无效/);
  });

  test('空季节返回空串', () => {
    assert.equal(normalizeSeasons('', []), '');
    assert.equal(normalizeSeasons('   ', []), '');
  });
});

describe('validateRow 逐行校验', () => {
  const good = {
    title: '水稻稻瘟病绿色防控技术',
    category: '病虫害',
    crop: '水稻',
    seasons: '春,夏',
    region: '长江中下游',
    url: 'https://example.com/v/1',
    duration: '845',
    precautions: '注意施药',
    description: '简介',
    source: '县农技站',
  };

  test('合法行通过且字段被 trim / 转换', () => {
    const { row, errors } = validateRow({ ...good, title: ` ${good.title} ` }, 2);
    assert.equal(errors.length, 0, errors.join(';'));
    assert.equal(row.title, good.title);
    assert.equal(row.category, '病虫害');
    assert.equal(row.seasons, '春,夏');
    assert.equal(row.duration, 845);
  });

  test('缺少标题报错', () => {
    const { errors } = validateRow({ ...good, title: '  ' }, 9);
    assert.ok(errors.some(x => x.includes('缺少标题')));
    assert.ok(errors[0].startsWith('第9行：'));
  });

  test('非法类别报错（四类之外）', () => {
    const { errors } = validateRow({ ...good, category: '渔业' }, 3);
    assert.ok(errors.some(x => x.includes('类别') && x.includes('无效')));
  });

  test('缺少类别报错', () => {
    const { errors } = validateRow({ ...good, category: '' }, 3);
    assert.ok(errors.some(x => x.includes('缺少类别')));
  });

  test('缺少作物报错', () => {
    const { errors } = validateRow({ ...good, crop: '' }, 3);
    assert.ok(errors.some(x => x.includes('缺少作物')));
  });

  test('标题超长报错', () => {
    const { errors } = validateRow({ ...good, title: '长'.repeat(201) }, 3);
    assert.ok(errors.some(x => x.includes('200')));
  });

  test('非法 URL 报错', () => {
    const { errors } = validateRow({ ...good, url: 'not-a-url' }, 10);
    assert.ok(errors.some(x => x.includes('http')));
  });

  test('缺少 URL 报错', () => {
    const { errors } = validateRow({ ...good, url: '' }, 3);
    assert.ok(errors.some(x => x.includes('缺少视频地址')));
  });

  test('时长非整数报错', () => {
    const { errors } = validateRow({ ...good, duration: '12.5' }, 3);
    assert.ok(errors.some(x => x.includes('时长')));
  });

  test('时长可留空，默认 0', () => {
    const { row, errors } = validateRow({ ...good, duration: '' }, 3);
    assert.equal(errors.length, 0);
    assert.equal(row.duration, 0);
  });
});
