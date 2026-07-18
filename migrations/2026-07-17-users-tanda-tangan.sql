-- Migration: Tanda tangan digital per akun guru (PKBM Tunas Ilmu)
-- Menambahkan kolom `tanda_tangan` (base64 PNG) pada tabel users.
-- Guru menyimpan/memperbarui tanda tangannya sekali di halaman Akun;
-- admin dapat melihatnya sebagai bukti kehadiran (audit).
-- Idempotent: aman dijalankan ulang.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'tanda_tangan'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `tanda_tangan` LONGTEXT NULL DEFAULT NULL AFTER `tipe_guru` COMMENT ''base64 PNG tanda tangan guru (per akun)''',
  'SELECT ''kolom tanda_tangan sudah ada'' AS info');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;