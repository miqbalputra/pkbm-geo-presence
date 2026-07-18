CREATE TABLE IF NOT EXISTS `location_tracks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `attendance_id` int(11) DEFAULT NULL,
  `tanggal` date NOT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `accuracy_meters` decimal(8,2) DEFAULT NULL,
  `source` varchar(30) NOT NULL DEFAULT 'web',
  `user_agent` varchar(255) DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_location_tracks_user_date` (`user_id`, `tanggal`, `recorded_at`),
  KEY `idx_location_tracks_date_recorded` (`tanggal`, `recorded_at`),
  KEY `idx_location_tracks_attendance` (`attendance_id`),
  CONSTRAINT `location_tracks_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `location_tracks_attendance_fk`
    FOREIGN KEY (`attendance_id`) REFERENCES `attendance_logs` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `settings` (`setting_key`, `setting_value`, `description`, `updated_by`)
VALUES
  ('location_tracking_enabled', '0', 'Aktif/nonaktif tracking lokasi guru setelah presensi hadir', 'system'),
  ('location_tracking_interval_minutes', '15', 'Interval tracking lokasi guru dalam menit', 'system'),
  ('location_tracking_accuracy_limit', '100', 'Batas maksimum akurasi GPS untuk tracking lokasi dalam meter', 'system')
ON DUPLICATE KEY UPDATE
  `setting_value` = `setting_value`,
  `description` = VALUES(`description`);
