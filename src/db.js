const mysql = require('mysql2/promise');

const DB_CHARSET = 'utf8mb4';
const DB_COLLATION = 'utf8mb4_unicode_ci';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'agri_video',
  waitForConnections: true,
  connectionLimit: 10,
  // 显式声明排序规则；握手阶段即按 utf8mb4(224) 协商，避免被服务端默认字符集带偏
  charset: DB_COLLATION,
  dateStrings: true,
});

// 双保险：连接池每建立一条新物理连接，都先执行 SET NAMES。
// mysql2 会保证该语句在连接交付业务使用前完成（同一连接上排队执行）。
// 这样可彻底杜绝因 character_set_client 不是 utf8mb4 而导致的
// “Data truncated for column 'category'” 中文写入失败。
pool.on('connection', connection => {
  connection.query(`SET NAMES ${DB_CHARSET} COLLATE ${DB_COLLATION}`);
});

// 每个连接（含连接池复用/重连后新建）都强制锁定字符集。
// 否则在 MySQL 8 严格模式下，向中文 ENUM/字符串列写入时会因
// character_set_client 不是 utf8mb4 而报
// "Data truncated for column 'category' at row 1"。
async function ensureConnectionCharset(connection) {
  await connection.query(
    `SET NAMES ${DB_CHARSET} COLLATE ${DB_COLLATION}`
  );
}

// 应用启动时确保表结构存在（数据库需提前创建或本账号有建库权限）
async function ensureSchema() {
  // 建表连接同样强制 utf8mb4，保证表/列字符集与排序规则正确
  const conn = await pool.getConnection();
  try {
    await ensureConnectionCharset(conn);

    const videoSql = `
    CREATE TABLE IF NOT EXISTS videos (
      id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
      title            VARCHAR(200) NOT NULL,
      category         VARCHAR(32)  NOT NULL,
      crop             VARCHAR(100) NOT NULL,
      seasons          VARCHAR(20)  NOT NULL DEFAULT '',
      region           VARCHAR(300) NOT NULL DEFAULT '',
      url              VARCHAR(500) NOT NULL,
      duration         INT UNSIGNED NOT NULL DEFAULT 0,
      precautions      TEXT         NULL,
      description      TEXT         NULL,
      source           VARCHAR(200) NULL,
      is_expired       TINYINT(1)   NOT NULL DEFAULT 0,
      expire_reason    VARCHAR(300) NULL,
      expired_at       DATETIME     NULL,
      import_batch_id  INT UNSIGNED NULL,
      created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_crop (crop),
      KEY idx_category (category),
      KEY idx_expired (is_expired),
      FULLTEXT KEY ft_search (title, crop, region),
      CONSTRAINT chk_category CHECK (category IN ('种植','养殖','病虫害','农机操作'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
    const batchSql = `
    CREATE TABLE IF NOT EXISTS import_batches (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename      VARCHAR(255) NOT NULL,
      total_rows    INT UNSIGNED NOT NULL DEFAULT 0,
      success_count INT UNSIGNED NOT NULL DEFAULT 0,
      fail_count    INT UNSIGNED NOT NULL DEFAULT 0,
      report_path   VARCHAR(500) NULL,
      imported_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
    await conn.query(videoSql);
    await conn.query(batchSql);

    // 兼容旧库：早期版本 category 为中文 ENUM，在连接字符集异常时会触发
    // “Data truncated for column 'category'”。这里平滑迁移为 VARCHAR + CHECK。
    const [cols] = await conn.query(
      `SELECT DATA_TYPE, COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'videos' AND COLUMN_NAME = 'category'`
    );
    if (cols.length && cols[0].DATA_TYPE === 'enum') {
      await conn.query(
        `ALTER TABLE videos
         MODIFY category VARCHAR(32) NOT NULL
         COMMENT '类别：种植/养殖/病虫害/农机操作'`
      );
    }
    // 补齐 CHECK 约束（旧库/历史表可能没有）
    const [trows] = await conn.query(
      `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'videos'
         AND CONSTRAINT_NAME = 'chk_category' LIMIT 1`
    );
    if (!trows.length) {
      await conn.query(
        `ALTER TABLE videos
         ADD CONSTRAINT chk_category
         CHECK (category IN ('种植','养殖','病虫害','农机操作'))`
      );
    }
  } finally {
    conn.release();
  }
}

module.exports = { pool, ensureSchema, ensureConnectionCharset, DB_CHARSET, DB_COLLATION };
