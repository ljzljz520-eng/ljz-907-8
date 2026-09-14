# 农技示范视频库

面向县/乡农技站的示范视频管理系统：

- **农户前台**：按「类别（种植/养殖/病虫害/农机操作）」「作物/养殖对象」「季节（春/夏/秋/冬）」筛选，关键字搜索；详情页展示**适用地区**、**注意事项**、内容简介、来源等。
- **管理后台**：CSV 批量导入视频；查看导入批次统计；失败行可**下载错误报告 CSV**；一键**标记过期/下架**（过期后前台自动隐藏），也可恢复上架。
- **数据库**：MySQL 8.0（兼容 MariaDB 10.5+），utf8mb4。

## 目录结构

```
server.js              Express 入口（启动时自动建表）
src/
  db.js                MySQL 连接池
  schema.sql           完整建库建表脚本（Docker 初始化用）
  importService.js     CSV 解析、编码识别、逐行校验、重复检测、错误报告生成
  seed.js              用 sample.csv 初始化演示数据
  routes/
    public.js          农户端 API
    admin.js           后台 API（导入/批次/报告下载/过期标记）
public/                前台与后台页面（原生 HTML/CSS/JS，无构建步骤）
sample.csv             导入模板（含 2 行错误示例，可直接测错误报告）
data/                  导入错误报告输出目录
docker-compose.yml     一键启动 MySQL + 应用
```

## 方式一：Docker 启动（推荐）

```bash
cp .env.example .env        # 按需修改口令（同时改 docker-compose.yml）
docker compose up -d --build
# 初始化演示数据（可选）
docker compose exec app npm run seed
```

访问 <http://localhost:3000>（农户端），后台入口在顶栏或 <http://localhost:3000/admin.html>。

## 方式二：已有 MySQL，本地运行

```bash
mysql -uroot -p < src/schema.sql      # 建库建表（或给账号授权后由应用自动建表）
cp .env.example .env                  # 修改 DB_* 配置
npm install
npm run seed                          # 可选：导入演示数据
npm start
```

环境变量：`DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / PORT`。

## 测试

使用 Node 内置测试运行器，**无需安装额外依赖**：

```bash
npm test               # 运行 test/ 下全部测试
npm run test:unit      # 仅单元测试（CSV 解析、编码识别、逐行校验；无需数据库）
```

- 纯单元测试在任何环境都能运行（无数据库时集成测试会自动跳过）。
- 需要数据库的集成测试（覆盖中文“类别”写入、GBK 导入、判重、错误报告、CHECK 约束、连接字符集）：

```bash
TEST_DB=1 DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= \
  DB_NAME=agri_video_test npm run test:integration
# 测试库不存在会自动创建（需建库权限）；也可直接 npm test，同样会读取上述 DB_* 环境变量
```

> 说明：历史版本 `category` 列使用中文 `ENUM`，在连接字符集不是 utf8mb4
> 时会于 MySQL 8 严格模式下报 `Data truncated for column 'category'`。
> 现改为 `VARCHAR(32)` + `CHECK` 约束，并在连接池握手及每条新连接上强制
> `SET NAMES utf8mb4`；应用启动时还会把存量 ENUM 表**自动、幂等**迁移为
> VARCHAR + CHECK（中文标签原样保留），无需手工处理旧数据卷。

## CSV 格式

首行必须为表头（支持中英文字段名）：

| 表头 | 必填 | 说明 |
|---|---|---|
| 标题 | 是 | ≤200 字 |
| 类别 | 是 | 仅限：种植 / 养殖 / 病虫害 / 农机操作 |
| 作物 | 是 | 作物或养殖对象，如：水稻、生猪 |
| 季节 | 否 | 春/夏/秋/冬（支持“春季”“spring”），多个用英文逗号分隔，如 `春,夏` |
| 适用地区 | 否 | 如：长江中下游稻区（湖南、湖北） |
| 视频地址 | 是 | http(s):// 开头；与标题组合判重 |
| 时长 | 否 | 整数秒 |
| 注意事项 | 否 | 详情页重点展示 |
| 简介 | 否 | |
| 来源 | 否 | 机构/讲师 |

- 支持 UTF-8（含 BOM）和 **GBK**（Excel 默认）编码自动识别。
- 字段内含逗号请按 CSV 规范加双引号。
- 整批导入在一个事务中完成：逐行校验，**错误行跳过，正确行入库**；只要有失败行即生成
  `data/import-error-<批次>-<时间>.csv`，后台可下载，报告含**行号、原始内容、错误原因**，修正后可直接重导。

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/filters` | 作物下拉（只统计未过期）+ 季节 |
| GET | `/api/videos?category=&crop=&season=&q=` | 前台列表（自动排除过期） |
| GET | `/api/videos/:id` | 视频详情（过期返回 404） |
| POST | `/api/admin/import` | multipart 上传 `file` 字段导入 CSV |
| GET | `/api/admin/batches` | 导入批次列表 |
| GET | `/api/admin/reports/:name` | 下载错误报告 |
| GET | `/api/admin/videos?status=&category=` | 后台视频列表（含已过期） |
| POST | `/api/admin/videos/:id/expire` | body：`{expired:true/false, reason:"..."}` |

## 生产部署提示

- 当前后台页面未做登录鉴权，生产环境请在反向代理（Nginx）层加 Basic Auth 或接入统一 SSO，并仅对内网开放 `/api/admin/*`。
- 建议定期用 `mysqldump` 备份；`data/` 目录持久化保存错误报告。
