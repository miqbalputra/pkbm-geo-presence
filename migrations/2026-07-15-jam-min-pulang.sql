-- Migration: jam_min_pulang
-- Menambah setting batas minimal jam presensi pulang (tombol, tanpa QR).
-- Default 12:30 WIB. Admin dapat mengubahnya via menu Pengaturan.
-- Idempotent: tidak menimpa nilai jika sudah diatur admin sebelumnya.

INSERT INTO settings (setting_key, setting_value, updated_by, updated_at)
VALUES ('jam_min_pulang', '12:30', 'system', NOW())
ON DUPLICATE KEY UPDATE setting_key = setting_key;