<?php
/**
 * Manual Attendance Entry API
 * Endpoint untuk admin input presensi manual (darurat)
 */
require_once 'config.php';

// Hanya admin yang bisa mengakses
requireAuth(['admin', 'kepala_sekolah']);

$method = $_SERVER['REQUEST_METHOD'];

// POST - Create manual attendance
if ($method === 'POST') {
    $data = getRequestData();

    try {
        // Validasi input
        if (empty($data['user_id'])) {
            sendResponse(false, 'Guru harus dipilih');
        }

        if (empty($data['tanggal'])) {
            sendResponse(false, 'Tanggal harus diisi');
        }

        if (empty($data['status'])) {
            sendResponse(false, 'Status harus dipilih');
        }

        if (empty($data['reason'])) {
            sendResponse(false, 'Alasan presensi manual harus diisi');
        }

        // Validasi tanggal
        if (!validateDate($data['tanggal'])) {
            sendResponse(false, 'Format tanggal tidak valid');
        }

        // Get guru info (hanya guru aktif — yang diarsipkan tidak boleh diberi presensi baru)
        $stmt = $pdo->prepare("SELECT id, nama FROM users WHERE id = ? AND role = 'guru' AND archived_at IS NULL");
        $stmt->execute([$data['user_id']]);
        $guru = $stmt->fetch();

        if (!$guru) {
            sendResponse(false, 'Guru tidak ditemukan');
        }

        // Cek apakah sudah ada presensi untuk tanggal tersebut
        $stmt = $pdo->prepare("SELECT id FROM attendance_logs WHERE user_id = ? AND tanggal = ?");
        $stmt->execute([$data['user_id'], $data['tanggal']]);
        $existing = $stmt->fetch();

        if ($existing) {
            sendResponse(false, 'Guru sudah memiliki presensi untuk tanggal tersebut. Hapus dulu jika ingin mengganti.');
        }

        // Set waktu
        $jamMasuk = $data['jam_masuk'] ?? date('H:i:s');
        $jamPulang = $data['jam_pulang'] ?? null;

        // Keterangan sudah mencakup reason, tidak perlu kolom manual_reason terpisah
        $keterangan = "Manual Entry oleh " . ($_SESSION['username'] ?? 'admin') . ": " . $data['reason'];

        // Insert presensi manual (tanpa kolom manual_reason dan created_by yang tidak ada di tabel)
        $stmt = $pdo->prepare("
            INSERT INTO attendance_logs 
            (user_id, nama, tanggal, status, jam_masuk, jam_pulang, jam_hadir, jam_izin, jam_sakit, keterangan, metode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
        ");

        $stmt->execute([
            $data['user_id'],
            $guru['nama'],
            $data['tanggal'],
            $data['status'],
            in_array($data['status'], ['hadir', 'hadir_terlambat']) ? $jamMasuk : null,
            $jamPulang,
            in_array($data['status'], ['hadir', 'hadir_terlambat']) ? $jamMasuk : null,
            $data['status'] === 'izin' ? $jamMasuk : null,
            $data['status'] === 'sakit' ? $jamMasuk : null,
            $keterangan,
        ]);

        $insertId = $pdo->lastInsertId();

        // Log activity
        try {
            $stmtLog = $pdo->prepare("INSERT INTO activity_logs (user, aktivitas, status) VALUES (?, ?, ?)");
            $stmtLog->execute([
                $_SESSION['username'] ?? 'admin',
                "Manual Entry untuk {$guru['nama']}",
                ucfirst($data['status'])
            ]);
        } catch (Exception $e) {
            // Ignore
        }

        sendResponse(true, "Presensi manual untuk {$guru['nama']} berhasil disimpan", [
            'id' => $insertId,
            'guru_nama' => $guru['nama'],
            'tanggal' => $data['tanggal'],
            'status' => $data['status'],
            'metode' => 'manual'
        ]);

    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// GET - Get list of guru for dropdown
if ($method === 'GET') {
    try {
        $stmt = $pdo->prepare("SELECT id, nama, id_guru FROM users WHERE role = 'guru' AND archived_at IS NULL ORDER BY nama ASC");
        $stmt->execute();
        $gurus = $stmt->fetchAll();

        sendResponse(true, 'Daftar guru', $gurus);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

sendResponse(false, 'Invalid request method');
?>