-- Migration: Grup piket guru (rotasi dwi-pekanan PKBM Tunas Ilmu)
-- Menambahkan kolom `piket_group` ENUM('A','B') pada tabel users.
-- Guru grup A piket Sabtu pekan 1 & 3, grup B pekan 2 & 4, pekan ke-5 semua guru.
-- Aturan rotasi (pekan per grup & mode pekan-5) dikonfigurasi via tabel settings.
-- Idempotent: aman dijalankan ulang.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'piket_group'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `piket_group` ENUM(''A'',''B'') NULL DEFAULT NULL AFTER `tipe_guru` COMMENT ''grup rotasi piket Sabtu (A/B)'',
   ADD INDEX `idx_users_piket_group` (`piket_group`)',
  'SELECT ''kolom piket_group sudah ada'' AS info');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;