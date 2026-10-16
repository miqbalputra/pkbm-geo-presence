CREATE TABLE IF NOT EXISTS `webhook_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `n8n_webhook_url` varchar(500) NOT NULL DEFAULT '',
  `admin_phone` varchar(20) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `webhook_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `reminder_type` varchar(30) NOT NULL,
  `total_guru` int NOT NULL DEFAULT 0,
  `status` varchar(20) NOT NULL,
  `response` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_webhook_log_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
