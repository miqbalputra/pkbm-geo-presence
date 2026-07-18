-- Migration: Settings aturan PKBM Tunas Ilmu
-- 1) workday_days          -> CSV angka hari kerja (0=Minggu..6=Sabtu). Default '6' (Sabtu saja).
-- 2) piket_rotation_enabled-> '1' aktifkan rotasi piket dwi-pekanan.
-- 3) piket_group_a_weeks   -> CSV pekan grup A. Default '1,3'.
-- 4) piket_group_b_weeks   -> CSV pekan grup B. Default '2,4'.
-- 5) piket_week5_mode      -> all|none|A|B. Pekan ke-5: semua guru / tidak ada / grup A / grup B. Default 'all'.
-- 6) piket_jam_masuk       -> jam masuk target guru piket. Default '07:00'.
-- 7) piket_jam_pulang      -> jam pulang (batas PIKET_RESTRICTION). Default '13:00'.
-- Idempotent: tidak menimpa nilai jika sudah diatur admin sebelumnya.

INSERT INTO settings (setting_key, setting_value, updated_by, updated_at)
VALUES
  ('workday_days',          '6',    'system', NOW()),
  ('piket_rotation_enabled','1',    'system', NOW()),
  ('piket_group_a_weeks',   '1,3',  'system', NOW()),
  ('piket_group_b_weeks',   '2,4',  'system', NOW()),
  ('piket_week5_mode',      'all',  'system', NOW()),
  ('piket_jam_masuk',       '07:00','system', NOW()),
  ('piket_jam_pulang',      '13:00','system', NOW())
ON DUPLICATE KEY UPDATE setting_key = setting_key;