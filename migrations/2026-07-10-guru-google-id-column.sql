-- Migration: Add google_id column to users table
-- Menyimpan Google ID (sub) ketika guru melakukan login dengan Google,
-- sehingga akun ter-link dan login Google bisa langsung dikenali.

ALTER TABLE `users`
  ADD COLUMN `google_id` VARCHAR(255) DEFAULT NULL AFTER `email`;