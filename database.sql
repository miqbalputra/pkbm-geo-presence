-- =====================================================================
-- Database Schema + Seed — Geo Presensi PKBM Tunas Ilmu
-- =====================================================================
-- File ini siap import ke database MySQL 8 (kosong) lewat phpMyAdmin
-- atau CLI. Setelah import, aplikasi langsung bisa dipakai:
--   - Login admin  : username "admin"     password "admin123"
--   - Login kepsek : username "kepsek"    password "admin123"
--   - Login guru   : username "guru1"     password "admin123"  (contoh)
-- GANTI PASSWORD SEGERA setelah login pertama via menu Akun / Data Guru.
--
-- Catatan:
--   * Tabel `jadwal_piket` sengaja TIDAK dibuat — piket kini diatur lewat
--     rotasi dwi-pekanan (kolom users.piket_group + setting rotasi).
--   * Koordinat & qr_secret di bawah adalah nilai contoh, BUKAN produksi.
--     Sesuaikan sekolah_latitude/longitude, qr_secret, dll. via Pengaturan.
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Tabel Users (Admin, Kepala Sekolah, Guru)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_guru` varchar(20) DEFAULT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `google_id` varchar(255) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','kepala_sekolah','guru') NOT NULL,
  `nama` varchar(100) NOT NULL,
  `jenis_kelamin` enum('Laki-laki','Perempuan') DEFAULT NULL,
  `alamat` text,
  `no_hp` varchar(20) DEFAULT NULL,
  `jabatan` text,
  `tanggal_bertugas` date DEFAULT NULL,
  `tanggal_lahir` date DEFAULT NULL,
  `tipe_guru` enum('full_time','partime') DEFAULT 'full_time',
  `piket_group` enum('A','B') DEFAULT NULL COMMENT 'grup rotasi piket Sabtu (A/B)',
  `pokjar` enum('Lentera Qalbu','Umar bin Khattab','Nashirus Sunnah') DEFAULT NULL COMMENT 'penugasan Pokjar binaan; non-null = mode presensi sederhana (Hadir/Sakit/Izin, tanpa terlambat/pulang/piket)',
  `tanda_tangan` longtext DEFAULT NULL COMMENT 'base64 PNG tanda tangan guru (per akun)',
  `archived_at` timestamp NULL DEFAULT NULL,
  `archive_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `id_guru` (`id_guru`),
  KEY `idx_users_archived_at` (`archived_at`),
  KEY `idx_users_piket_group` (`piket_group`),
  KEY `idx_users_pokjar` (`pokjar`),
  KEY `idx_users_role_nama` (`role`,`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabel Attendance Logs (Presensi)
--   status (varchar) menerima: hadir, hadir_terlambat, hadir_izin_terlambat,
--   izin, sakit, opsional, libur, libur_override, alfa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `nama` varchar(100) NOT NULL,
  `tanggal` date NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'hadir',
  `jam_masuk` time DEFAULT NULL,
  `jam_pulang` time DEFAULT NULL,
  `jam_hadir` time DEFAULT NULL,
  `jam_izin` time DEFAULT NULL,
  `jam_sakit` time DEFAULT NULL,
  `keterangan` text,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `checkin_accuracy_meters` decimal(8,2) DEFAULT NULL,
  `checkout_latitude` decimal(10,8) DEFAULT NULL,
  `checkout_longitude` decimal(11,8) DEFAULT NULL,
  `checkout_accuracy_meters` decimal(8,2) DEFAULT NULL,
  `checkout_distance_meters` int DEFAULT NULL,
  `checkout_location_verdict` enum('inside','outside','testing') DEFAULT NULL,
  `metode` enum('button','qr_scan','manual') DEFAULT 'button',
  `lokasi_pulang` varchar(16) DEFAULT NULL COMMENT 'sekolah|luar — lokasi saat presensi pulang',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_date` (`user_id`,`tanggal`),
  KEY `user_id` (`user_id`),
  KEY `tanggal` (`tanggal`),
  KEY `idx_attendance_tanggal_id` (`tanggal`,`id`),
  KEY `idx_attendance_tanggal_status` (`tanggal`,`status`),
  KEY `idx_attendance_date_user_status` (`tanggal`,`user_id`,`status`),
  CONSTRAINT `attendance_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabel Activity Logs (Log Aktivitas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `waktu` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user` varchar(100) NOT NULL,
  `aktivitas` varchar(100) NOT NULL,
  `status` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `waktu` (`waktu`),
  KEY `idx_activity_waktu_id` (`waktu`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabel Settings (konfigurasi aplikasi)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text NOT NULL,
  `description` text,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabel Holidays (Hari Libur / Hari Kerja Khusus)
--   is_workday=1 -> hari kerja khusus (mis. apel/acara), bukan libur.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `holidays` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tanggal` date NOT NULL,
  `nama` varchar(255) NOT NULL,
  `jenis` enum('nasional','cuti_bersama','sekolah') NOT NULL DEFAULT 'nasional',
  `keterangan` text,
  `is_workday` tinyint(1) DEFAULT '0',
  `jam_masuk_khusus` time DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tanggal` (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabel Optional Workdays (Hari kerja opsional/insidental)
--   Guru hadir dapat bonus kehadiran; tidak hadir tidak kena alfa.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `optional_workdays` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tanggal` date NOT NULL,
  `nama` varchar(255) NOT NULL,
  `keterangan` text,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_tanggal` (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabel User Weekend Overrides (override hari kerja per guru per tanggal)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_weekend_overrides` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `tanggal` date NOT NULL,
  `is_workday` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1 = wajib kerja, 0 = libur',
  `keterangan` varchar(255) DEFAULT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_weekend_overrides_user_date` (`user_id`,`tanggal`),
  KEY `idx_user_weekend_overrides_user` (`user_id`),
  KEY `idx_user_weekend_overrides_date` (`tanggal`),
  CONSTRAINT `user_weekend_overrides_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabel Remember Tokens (remember-me guru, 30 hari)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `remember_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `last_used_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_remember_tokens_hash` (`token_hash`),
  KEY `idx_remember_tokens_user` (`user_id`),
  KEY `idx_remember_tokens_expires` (`expires_at`),
  CONSTRAINT `remember_tokens_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabel Location Tracks (tracking lokasi guru setelah presensi hadir)
-- ---------------------------------------------------------------------
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
  KEY `idx_location_tracks_user_date` (`user_id`,`tanggal`,`recorded_at`),
  KEY `idx_location_tracks_date_recorded` (`tanggal`,`recorded_at`),
  KEY `idx_location_tracks_attendance` (`attendance_id`),
  CONSTRAINT `location_tracks_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `location_tracks_attendance_fk` FOREIGN KEY (`attendance_id`) REFERENCES `attendance_logs` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabel Webhook Config & Logs (pengingat WhatsApp via n8n)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `webhook_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `enabled` tinyint(1) NOT NULL DEFAULT '0',
  `n8n_webhook_url` varchar(500) DEFAULT NULL,
  `admin_phone` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webhook_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reminder_type` enum('first','second','final','manual') NOT NULL,
  `total_guru` int NOT NULL DEFAULT '0',
  `status` enum('success','failed') NOT NULL,
  `response` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_webhook_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Event audit presensi. attendance_logs tetap menjadi ringkasan harian;
-- tabel ini tidak pernah diubah setelah event tercatat.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `attendance_id` int DEFAULT NULL,
  `user_id` int NOT NULL,
  `event_type` enum('check_in','check_out','izin','sakit','admin_adjustment') NOT NULL,
  `method` enum('button','qr_scan','manual') NOT NULL DEFAULT 'button',
  `request_id` char(36) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `accuracy_meters` decimal(8,2) DEFAULT NULL,
  `distance_meters` int DEFAULT NULL,
  `location_verdict` enum('inside','outside','not_required','testing') NOT NULL DEFAULT 'not_required',
  `reason` varchar(500) DEFAULT NULL,
  `actor_user_id` int DEFAULT NULL,
  `occurred_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_events_request` (`user_id`,`request_id`),
  KEY `idx_attendance_events_attendance` (`attendance_id`,`id`),
  KEY `idx_attendance_events_user_time` (`user_id`,`occurred_at`),
  CONSTRAINT `fk_attendance_events_attendance` FOREIGN KEY (`attendance_id`) REFERENCES `attendance_logs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_attendance_events_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- ---------------------------------------------------------------------
-- Akun default. Password SEMUA akun di bawah = "admin123" (bcrypt).
-- GANTI PASSWORD SEGERA setelah login pertama.
-- ---------------------------------------------------------------------
INSERT INTO `users` (`id`, `id_guru`, `username`, `email`, `password`, `role`, `nama`, `jenis_kelamin`, `tipe_guru`, `piket_group`, `pokjar`, `tanggal_bertugas`) VALUES
(1, NULL, 'admin',  NULL, '$2y$12$G2VobgYznXL/9Bs9DodoS.1uOUwh0ySb/eiNDAiHpQhcrj/S99HBq', 'admin',           'Administrator',     NULL,        'full_time', NULL, NULL, NULL),
(2, NULL, 'kepsek', NULL, '$2y$12$G2VobgYznXL/9Bs9DodoS.1uOUwh0ySb/eiNDAiHpQhcrj/S99HBq', 'kepala_sekolah',  'Kepala Sekolah',    NULL,        'full_time', NULL, NULL, NULL),
(3, 'PKBM001', 'guru1', NULL, '$2y$12$G2VobgYznXL/9Bs9DodoS.1uOUwh0ySb/eiNDAiHpQhcrj/S99HBq', 'guru', 'Budi Santoso',     'Laki-laki', 'full_time', 'A', NULL, '2024-07-01'),
(4, 'PKBM002', 'guru2', NULL, '$2y$12$G2VobgYznXL/9Bs9DodoS.1uOUwh0ySb/eiNDAiHpQhcrj/S99HBq', 'guru', 'Siti Nurhaliza',   'Perempuan', 'full_time', 'B', NULL, '2024-07-01'),
(5, 'PKBM003', 'guru3', NULL, '$2y$12$G2VobgYznXL/9Bs9DodoS.1uOUwh0ySb/eiNDAiHpQhcrj/S99HBq', 'guru', 'Ahmad Fauzi',      'Laki-laki', 'full_time', 'A', 'Lentera Qalbu', '2024-07-01');

-- ---------------------------------------------------------------------
-- Settings default PKBM Tunas Ilmu.
-- Koordinat & qr_secret = CONTOH. Sesuaikan via menu Pengaturan.
-- ---------------------------------------------------------------------
INSERT INTO `settings` (`setting_key`, `setting_value`, `description`, `updated_by`) VALUES
-- Jam & presensi
('jam_masuk_normal',          '07:20', 'Batas waktu masuk normal (HH:MM)', 'system'),
('toleransi_terlambat',       '10',    'Toleransi keterlambatan dalam menit', 'system'),
('jam_min_pulang',            '12:30', 'Batas minimal jam presensi pulang (HH:MM)', 'system'),
('radius_gps',                '50',    'Radius validasi GPS dalam meter', 'system'),
('mode_testing',              '1',     'Mode testing GPS (1=aktif/GPS non-valid, 0=nonaktif)', 'system'),
('button_enabled',            '1',     'Tampilkan tombol hadir manual (1=ya, 0=tidak)', 'system'),
-- QR Code
('qr_enabled',                '1',     'Aktifkan fitur QR Code Scan (1=aktif, 0=nonaktif)', 'system'),
('qr_secret',                 'QR_f5dfd8e704ea097f5aff403f', 'Secret key untuk validasi QR Code (CONTOH — ganti)', 'system'),
-- Lokasi sekolah (CONTOH — ganti dengan koordinat PKBM Tunas Ilmu)
('sekolah_nama',              'PKBM Tunas Ilmu', 'Nama sekolah/lembaga', 'system'),
('sekolah_latitude',          '-7.403244', 'Koordinat Latitude sekolah', 'system'),
('sekolah_longitude',         '109.324961', 'Koordinat Longitude sekolah', 'system'),
('lokasi_laki_latitude',      '-7.403289', 'Latitude Lokasi Khusus Laki-laki', 'system'),
('lokasi_laki_longitude',     '109.324004', 'Longitude Lokasi Khusus Laki-laki', 'system'),
('lokasi_perempuan_latitude', '-7.403244', 'Latitude Lokasi Khusus Perempuan', 'system'),
('lokasi_perempuan_longitude','109.324961', 'Longitude Lokasi Khusus Perempuan', 'system'),
('lokasi_apel_latitude',      '-7.403289', 'Latitude Lokasi Apel (dead-code, Senin bukan hari kerja)', 'system'),
('lokasi_apel_longitude',     '109.324004', 'Longitude Lokasi Apel (dead-code, Senin bukan hari kerja)', 'system'),
('apel_senin_enabled',        '0',     'Aktifkan Validasi Apel Hari Senin (1/0) — dead-code', 'system'),
-- Piket (legacy, digantikan rotasi dwi-pekanan)
('jam_piket_default',         '07:00', 'Jam piket default (legacy, digantikan piket_jam_masuk)', 'system'),
('piket_terlambat_adalah_terlambat', '1', 'Terlambat piket mengubah status jadi Hadir Terlambat (1=ya, 0=tidak)', 'system'),
-- Tracking lokasi
('location_tracking_enabled',          '0',  'Aktif/nonaktif tracking lokasi guru setelah presensi hadir', 'system'),
('location_tracking_interval_minutes', '15', 'Interval tracking lokasi guru dalam menit', 'system'),
('location_tracking_accuracy_limit',  '100','Batas maksimum akurasi GPS untuk tracking lokasi (meter)', 'system'),
-- Weekend legacy (tidak terpakai setelah aturan workday_days; dibiarkan agar rollback aman)
('weekend_workday_enabled',          '0', 'Fallback lama presensi Sabtu/Minggu (digantikan workday_days)', 'system'),
('saturday_male_workday_enabled',    '0', 'Legacy: presensi Sabtu guru laki-laki', 'system'),
('saturday_female_workday_enabled',  '0', 'Legacy: presensi Sabtu guru perempuan', 'system'),
('sunday_male_workday_enabled',      '0', 'Legacy: presensi Minggu guru laki-laki', 'system'),
('sunday_female_workday_enabled',    '0', 'Legacy: presensi Minggu guru perempuan', 'system'),
-- Aturan PKBM Tunas Ilmu — hari kerja & rotasi piket Sabtu
('workday_days',           '6',    'CSV angka hari kerja aktif (0=Minggu..6=Sabtu). Default Sabtu saja', 'system'),
('piket_rotation_enabled', '1',    'Aktifkan rotasi piket dwi-pekanan (1=aktif, 0=nonaktif)', 'system'),
('piket_group_a_weeks',    '1,3',  'Pekan piket Grup A (CSV 1-5)', 'system'),
('piket_group_b_weeks',    '2,4',  'Pekan piket Grup B (CSV 1-5)', 'system'),
('piket_week5_mode',       'all',  'Pekan ke-5: all|none|A|B', 'system'),
('piket_jam_masuk',        '07:00','Jam masuk target guru piket (HH:MM)', 'system'),
('piket_jam_pulang',       '13:00','Jam pulang piket / batas PIKET_RESTRICTION (HH:MM)', 'system')
ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`);

-- Webhook config default (nonaktif)
INSERT INTO `webhook_config` (`enabled`, `n8n_webhook_url`, `admin_phone`) VALUES (0, NULL, NULL);

SET FOREIGN_KEY_CHECKS = 1;

-- Go stack migrations: supplementary tables for auth, security, backup, and monthly confirmation.

-- Source: .\backend\internal\migrations\sql\001_auth_security.sql
CREATE TABLE IF NOT EXISTS `jwt_refresh_tokens` (
  `id` varchar(36) NOT NULL,
  `user_id` int NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_jwt_refresh_token_hash` (`token_hash`),
  KEY `idx_jwt_refresh_user` (`user_id`),
  KEY `idx_jwt_refresh_expiry` (`expires_at`),
  CONSTRAINT `fk_jwt_refresh_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `security_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event` varchar(100) NOT NULL,
  `user_id` int DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `request_id` varchar(100) DEFAULT NULL,
  `details` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_security_event` (`event`, `created_at`),
  KEY `idx_security_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Source: .\backend\internal\migrations\sql\002_operations.sql
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

-- Source: .\backend\internal\migrations\sql\003_webhooks.sql
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

-- Source: .\backend\internal\migrations\sql\004_qr_hardening.sql
-- QR nonce compatibility is applied by ensureLegacyUserColumns after the
-- versioned migrations. MySQL 8.4 does not support IF NOT EXISTS for
-- ALTER TABLE ... ADD COLUMN, and the compatibility path must also handle
-- legacy databases where this column may already exist.
SELECT 1;

-- Source: .\backend\internal\migrations\sql\005_backups.sql
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

-- Source: .\backend\internal\migrations\sql\006_monthly_attendance_confirmations.sql
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

-- Source: .\backend\internal\migrations\sql\007_monthly_confirmation_admin_actor.sql
-- Idempotent compatibility step. ensureLegacyUserColumns adds the optional
-- admin actor column, index, and foreign key only when they are missing.
SELECT 1;

-- Source: .\backend\internal\migrations\sql\008_pkbm_fields_and_attendance_integrity.sql
-- PKBM Tunas Ilmu compatibility fields and immutable attendance event ledger.
-- Existing IDs and rows are preserved; missing columns are added by the
-- idempotent ensureLegacyUserColumns() step after the numbered migrations.
CREATE TABLE IF NOT EXISTS `attendance_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `attendance_id` INT DEFAULT NULL,
  `user_id` INT NOT NULL,
  `event_type` VARCHAR(30) NOT NULL,
  `method` VARCHAR(30) NOT NULL DEFAULT 'button',
  `request_id` CHAR(36) DEFAULT NULL,
  `latitude` DECIMAL(10,8) DEFAULT NULL,
  `longitude` DECIMAL(11,8) DEFAULT NULL,
  `accuracy_meters` DECIMAL(8,2) DEFAULT NULL,
  `distance_meters` INT DEFAULT NULL,
  `location_verdict` VARCHAR(30) NOT NULL DEFAULT 'not_required',
  `reason` VARCHAR(500) DEFAULT NULL,
  `actor_user_id` INT DEFAULT NULL,
  `occurred_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_events_request` (`user_id`,`request_id`),
  KEY `idx_attendance_events_attendance` (`attendance_id`,`id`),
  KEY `idx_attendance_events_user_time` (`user_id`,`occurred_at`),
  CONSTRAINT `fk_attendance_events_attendance` FOREIGN KEY (`attendance_id`) REFERENCES `attendance_logs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_attendance_events_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
