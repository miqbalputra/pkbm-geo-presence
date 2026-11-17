CREATE TABLE IF NOT EXISTS `attendance_corrections` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `created_by` bigint unsigned NOT NULL,
  `reason` text NOT NULL,
  `start_date` varchar(10) NOT NULL,
  `end_date` varchar(10) NOT NULL,
  `scope` varchar(10) NOT NULL,
  `normal_time` varchar(8) NOT NULL,
  `changed` int NOT NULL,
  `snapshot` longtext NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `undone_at` timestamp NULL DEFAULT NULL,
  `undone_by` bigint unsigned DEFAULT NULL,
  KEY `idx_attendance_corrections_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
