-- Migration: Add email column to users table
-- Memungkinkan setiap akun (guru/admin/kepala sekolah) menyimpan alamat email.

ALTER TABLE `users`
  ADD COLUMN `email` VARCHAR(255) DEFAULT NULL AFTER `username`;