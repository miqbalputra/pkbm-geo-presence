-- Migration: Penugasan Pokjar binaan pada guru (presensi sederhana)
-- Menambahkan kolom `pokjar` ENUM('Lentera Qalbu','Umar bin Khattab','Nashirus Sunnah') pada tabel users.
-- Guru yang ditandai pokjar (non-null) menggunakan mode presensi sederhana:
-- Hadir / Sakit (+ keterangan) / Izin (+ keterangan), tanpa perhitungan terlambat,
-- tanpa presensi pulang, dan tanpa piket. Hari kerja tetap Sabtu (engine sama).
-- Idempotent: aman dijalankan ulang.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'pokjar'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `pokjar` ENUM(''Lentera Qalbu'',''Umar bin Khattab'',''Nashirus Sunnah'') NULL DEFAULT NULL AFTER `piket_group` COMMENT ''penugasan Pokjar binaan; non-null = mode presensi sederhana (Hadir/Sakit/Izin, tanpa terlambat/pulang/piket)'', ADD INDEX `idx_users_pokjar` (`pokjar`)',
  'SELECT ''kolom pokjar sudah ada'' AS info');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;