CREATE TABLE IF NOT EXISTS `optional_workdays` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tanggal` date NOT NULL,
  `nama` varchar(255) NOT NULL,
  `keterangan` text,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_optional_workday_date` (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_weekend_overrides` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `tanggal` date NOT NULL,
  `is_workday` tinyint(1) NOT NULL DEFAULT 1,
  `keterangan` varchar(255) DEFAULT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weekend_override_user_date` (`user_id`, `tanggal`),
  KEY `idx_weekend_override_date` (`tanggal`),
  CONSTRAINT `fk_weekend_override_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pengaturan_harian` (
  `tanggal` date NOT NULL,
  `jam_pulang_khusus` time DEFAULT NULL,
  `jam_pulang_khusus_aktif` tinyint(1) NOT NULL DEFAULT 0,
  `jam_pulang_piket_khusus` time DEFAULT NULL,
  `jam_pulang_piket_khusus_aktif` tinyint(1) NOT NULL DEFAULT 0,
  `keterangan` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `location_tracks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `attendance_id` int DEFAULT NULL,
  `tanggal` date NOT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `accuracy_meters` decimal(8,2) DEFAULT NULL,
  `source` varchar(30) NOT NULL DEFAULT 'web',
  `user_agent` varchar(255) DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_location_user_date` (`user_id`, `tanggal`, `recorded_at`),
  KEY `idx_location_date` (`tanggal`, `recorded_at`),
  CONSTRAINT `fk_location_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
