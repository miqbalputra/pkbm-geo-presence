INSERT INTO `settings` (`setting_key`, `setting_value`, `description`, `updated_by`)
VALUES (
  'weekend_workday_enabled',
  '0',
  'Fallback lama untuk presensi Sabtu/Minggu semua guru (digantikan setting per hari dan jenis kelamin)',
  'system'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

INSERT INTO `settings` (`setting_key`, `setting_value`, `description`, `updated_by`)
VALUES
  ('saturday_male_workday_enabled', '0', 'Aktifkan presensi Sabtu untuk Ustadz/guru laki-laki (1=aktif, 0=nonaktif)', 'system'),
  ('saturday_female_workday_enabled', '0', 'Aktifkan presensi Sabtu untuk Ustadzah/guru perempuan (1=aktif, 0=nonaktif)', 'system'),
  ('sunday_male_workday_enabled', '0', 'Aktifkan presensi Minggu untuk Ustadz/guru laki-laki (1=aktif, 0=nonaktif)', 'system'),
  ('sunday_female_workday_enabled', '0', 'Aktifkan presensi Minggu untuk Ustadzah/guru perempuan (1=aktif, 0=nonaktif)', 'system')
ON DUPLICATE KEY UPDATE
  description = VALUES(description);
