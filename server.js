const express = require('express');
const path = require('path');
const { ensureSchema } = require('./src/db');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// 模板与错误报告下载（报告同时也通过 /api/admin/reports/:name 下载）
app.use('/sample.csv', express.static(path.join(__dirname, 'sample.csv')));
app.use('/data', express.static(path.join(__dirname, 'data'), {
  setHeaders: res => res.setHeader('Content-Disposition', 'attachment'),
}));

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// 统一错误处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 3000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`农技视频库已启动: http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('数据库初始化失败：', err.message);
    process.exit(1);
  });
