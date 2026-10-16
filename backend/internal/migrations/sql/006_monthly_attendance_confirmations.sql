CREATE TABLE IF NOT EXISTS `monthly_attendance_confirmations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `status` varchar(32) NOT NULL,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `correction_requested_at` timestamp NULL DEFAULT NULL,
  `snapshot` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_monthly_confirmation_user_period` (`user_id`, `period_start`),
  KEY `idx_monthly_confirmation_period_status` (`period_start`, `status`),
  CONSTRAINT `fk_monthly_confirmation_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
