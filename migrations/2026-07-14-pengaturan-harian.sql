-- Override jam pulang per-tanggal (kasus jarang: sekolah pulang lebih awal).
-- Satu baris per tanggal. Kedua field punya toggle aktif sendiri.
-- Aktif HANYA berlaku jika *_aktif = 1 dan jam terisi; jika tidak, fallback ke
-- jam_min_pulang global / jadwal_piket.jam_pulang_piket seperti biasa.
CREATE TABLE IF NOT EXISTS `pengaturan_harian` (
  `tanggal` date NOT NULL,
  `jam_pulang_khusus` time DEFAULT NULL,
  `jam_pulang_khusus_aktif` tinyint(1) NOT NULL DEFAULT 0,
  `jam_pulang_piket_khusus` time DEFAULT NULL,
  `jam_pulang_piket_khusus_aktif` tinyint(1) NOT NULL DEFAULT 0,
  `keterangan` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`tanggal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;