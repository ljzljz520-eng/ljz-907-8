// 初始化演示数据：读取项目根目录 sample.csv 导入
const fs = require('fs');
const path = require('path');
const { ensureSchema } = require('./db');
const { importCsv } = require('./importService');

(async () => {
  try {
    await ensureSchema();
    const file = path.join(__dirname, '..', 'sample.csv');
    const result = await importCsv(fs.readFileSync(file), 'sample.csv', path.join(__dirname, '..', 'data'));
    console.log('演示数据导入完成：', result);
    process.exit(0);
  } catch (e) {
    console.error('导入失败：', e.message);
    process.exit(1);
  }
})();
