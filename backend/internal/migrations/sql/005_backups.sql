CREATE TABLE IF NOT EXISTS `backup_jobs` (
  `id` CHAR(36) NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'queued',
  `source` VARCHAR(16) NOT NULL DEFAULT 'admin',
  `requested_by` BIGINT UNSIGNED NULL,
  `idempotency_key` VARCHAR(255) NULL,
  `file_name` VARCHAR(255) NULL,
  `file_path` VARCHAR(1024) NULL,
  `file_size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `sha256` CHAR(64) NULL,
  `manifest_json` JSON NULL,
  `error_code` VARCHAR(80) NULL,
  `error_message` TEXT NULL,
  `requested_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` TIMESTAMP NULL,
  `finished_at` TIMESTAMP NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_backup_idempotency` (`idempotency_key`),
  KEY `idx_backup_status_requested` (`status`, `requested_at`),
  KEY `idx_backup_expires` (`expires_at`),
  CONSTRAINT `chk_backup_kind` CHECK (`kind` IN ('sql', 'full')),
  CONSTRAINT `chk_backup_status` CHECK (`status` IN ('queued', 'running', 'succeeded', 'failed', 'expired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `backup_restore_jobs` (
  `id` CHAR(36) NOT NULL,
  `backup_job_id` CHAR(36) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'queued',
  `requested_by` BIGINT UNSIGNED NOT NULL,
  `pre_restore_backup_id` CHAR(36) NULL,
  `confirmation_phrase` VARCHAR(255) NOT NULL,
  `error_code` VARCHAR(80) NULL,
  `error_message` TEXT NULL,
  `started_at` TIMESTAMP NULL,
  `finished_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_restore_status_created` (`status`, `created_at`),
  KEY `idx_restore_backup` (`backup_job_id`),
  CONSTRAINT `chk_restore_status` CHECK (`status` IN ('queued', 'preparing', 'running', 'succeeded', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `maintenance_state` (
  `id` TINYINT UNSIGNED NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `reason` VARCHAR(255) NOT NULL DEFAULT '',
  `restore_job_id` CHAR(36) NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `maintenance_state` (`id`, `enabled`, `reason`)
VALUES (1, 0, '')
ON DUPLICATE KEY UPDATE `id` = `id`;

CREATE TABLE IF NOT EXISTS `backup_uploads` (
  `id` CHAR(36) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(1024) NOT NULL,
  `expected_size` BIGINT UNSIGNED NOT NULL,
  `received_size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `expected_sha256` CHAR(64) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'uploading',
  `requested_by` BIGINT UNSIGNED NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_backup_upload_expires` (`expires_at`),
  CONSTRAINT `chk_backup_upload_status` CHECK (`status` IN ('uploading', 'completed', 'failed', 'expired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
