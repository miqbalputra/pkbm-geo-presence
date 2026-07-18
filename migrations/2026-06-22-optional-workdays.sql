-- Tabel untuk menyimpan hari kerja opsional/insidental
-- Contoh: hari remidial, kegiatan tambahan, dll.
-- Guru yang hadir di hari ini mendapat kehadiran bonus.
-- Guru yang tidak hadir tidak dikenai alfa.
CREATE TABLE IF NOT EXISTS optional_workdays (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tanggal DATE NOT NULL,
    nama VARCHAR(255) NOT NULL,
    keterangan TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_tanggal (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
