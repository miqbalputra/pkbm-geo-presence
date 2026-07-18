-- 2026-07-16: kolom lokasi_pulang
-- Mencatat lokasi guru saat presensi pulang, sebagai pembeda antara:
--   'sekolah' = presensi pulang di dalam radius sekolah (langsung berhasil)
--   'luar'    = presensi pulang di luar radius (lupa pulang, checkout dari rumah)
-- Nilai NULL untuk data lama / presensi pulang yang belum diberi penanda.
ALTER TABLE `attendance_logs`
  ADD COLUMN `lokasi_pulang` VARCHAR(16) NULL DEFAULT NULL
  COMMENT 'sekolah|luar — lokasi saat presensi pulang';