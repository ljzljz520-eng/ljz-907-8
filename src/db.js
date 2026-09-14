const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'agri_video',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,
});

// 应用启动时确保表结构存在（数据库需提前创建或本账号有建库权限）
async function ensureSchema() {
  const videoSql = `
  CREATE TABLE IF NOT EXISTS videos (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    title            VARCHAR(200) NOT NULL,
    category         ENUM('种植','养殖','病虫害','农机操作') NOT NULL,
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
    FULLTEXT KEY ft_search (title, crop, region)
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
  await pool.query(videoSql);
  await pool.query(batchSql);
}

module.exports = { pool, ensureSchema };
