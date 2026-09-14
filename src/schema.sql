-- 农技示范视频库 数据库结构
CREATE DATABASE IF NOT EXISTS agri_video
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agri_video;

-- 视频主表
CREATE TABLE IF NOT EXISTS videos (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title            VARCHAR(200) NOT NULL COMMENT '视频标题',
  category         ENUM('种植','养殖','病虫害','农机操作') NOT NULL COMMENT '类别',
  crop             VARCHAR(100) NOT NULL COMMENT '作物/养殖对象，如水稻、生猪',
  seasons          VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '适用季节，逗号分隔：春,夏,秋,冬',
  region           VARCHAR(300) NOT NULL DEFAULT '' COMMENT '适用地区',
  url              VARCHAR(500) NOT NULL COMMENT '视频地址',
  duration         INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '时长（秒）',
  precautions      TEXT         NULL COMMENT '注意事项',
  description      TEXT         NULL COMMENT '视频简介',
  source           VARCHAR(200) NULL COMMENT '来源/讲师',
  is_expired       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否已过期',
  expire_reason    VARCHAR(300) NULL COMMENT '过期原因/备注',
  expired_at       DATETIME     NULL COMMENT '标记过期时间',
  import_batch_id  INT UNSIGNED NULL COMMENT '导入批次',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crop (crop),
  KEY idx_category (category),
  KEY idx_expired (is_expired),
  FULLTEXT KEY ft_search (title, crop, region)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='农技视频';

-- CSV 导入批次表
CREATE TABLE IF NOT EXISTS import_batches (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename      VARCHAR(255) NOT NULL COMMENT '原始 CSV 文件名',
  total_rows    INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '数据行数',
  success_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '成功行数',
  fail_count    INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '失败行数',
  report_path   VARCHAR(500) NULL COMMENT '错误报告文件相对路径',
  imported_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CSV导入批次';
