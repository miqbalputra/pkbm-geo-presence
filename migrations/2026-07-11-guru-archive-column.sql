-- Migration: Soft-archive untuk guru
-- Menambahkan kolom archived_at & archive_reason pada tabel users.
-- Saat archived_at IS NULL  -> guru aktif (muncul di dashboard, dropdown, dll.)
-- Saat archived_at IS NOT NULL -> guru terarsip (keluar dari sekolah),
--   data guru + seluruh presensinya tetap tersimpan & dapat dilihat/dipulihkan.
--
-- Catatan: attendance_logs memiliki FK user_id -> users(id) ON DELETE CASCADE,
-- sehingga archive (bukan delete) menjaga data presensi tetap utuh.

ALTER TABLE `users`
  ADD COLUMN `archived_at` TIMESTAMP NULL DEFAULT NULL AFTER `tipe_guru`,
  ADD COLUMN `archive_reason` VARCHAR(255) NULL DEFAULT NULL AFTER `archived_at`;

-- Index untuk performa filter guru aktif/arsip
ALTER TABLE `users`
  ADD INDEX `idx_users_archived_at` (`archived_at`);