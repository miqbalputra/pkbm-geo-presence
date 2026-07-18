-- Tabel override hari kerja weekend per guru
-- Memungkinkan admin mengatur per guru, per tanggal (khusus Sabtu/Minggu)
-- apakah guru tersebut wajib kerja atau libur pada tanggal tersebut.
-- Jika ada override, override ini mengalahkan setting gender global.

CREATE TABLE IF NOT EXISTS `user_weekend_overrides` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `tanggal` date NOT NULL,
  `is_workday` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = wajib kerja, 0 = libur',
  `keterangan` varchar(255) DEFAULT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_weekend_overrides_user_date` (`user_id`, `tanggal`),
  KEY `idx_user_weekend_overrides_user` (`user_id`),
  KEY `idx_user_weekend_overrides_date` (`tanggal`),
  CONSTRAINT `user_weekend_overrides_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
