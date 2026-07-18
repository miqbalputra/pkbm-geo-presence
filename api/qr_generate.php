<?php
/**
 * QR Code Generator API
 * Endpoint untuk admin generate QR Code
 */
require_once 'config.php';

// Hanya admin yang bisa mengakses
requireAuth(['admin', 'kepala_sekolah']);

$method = $_SERVER['REQUEST_METHOD'];

// GET - Generate QR Code data
if ($method === 'GET') {
    try {
        // Get QR secret dari settings
        $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'qr_secret'");
        $stmt->execute();
        $result = $stmt->fetch();

        $qrSecret = $result ? $result['setting_value'] : 'GEOPRESENSI_DEFAULT_KEY';

        // Get nama sekolah
        $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'sekolah_nama'");
        $stmt->execute();
        $namaResult = $stmt->fetch();
        $sekolahNama = $namaResult ? $namaResult['setting_value'] : 'Sekolah';

        // Generate QR data
        $qrData = json_encode([
            'type' => 'attendance',
            'school' => $sekolahNama,
            'secret' => $qrSecret,
            'generated' => date('Y-m-d H:i:s')
        ]);

        sendResponse(true, 'QR Code data generated', [
            'qr_data' => $qrData,
            'school_name' => $sekolahNama,
            'instructions' => [
                '1. Gunakan aplikasi QR Code Generator online atau offline',
                '2. Copy teks QR Data di atas',
                '3. Generate QR Code',
                '4. Cetak dan pasang di lokasi strategis sekolah',
                '5. Guru dapat scan QR ini untuk presensi'
            ]
        ]);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// PUT - Update QR Secret (regenerate)
if ($method === 'PUT') {
    $data = getRequestData();

    try {
        // Generate new secret atau gunakan yang diberikan
        $newSecret = $data['new_secret'] ?? 'GEOPRESENSI_' . strtoupper(bin2hex(random_bytes(8)));

        $adminName = $_SESSION['username'] ?? 'admin';
        $stmt = $pdo->prepare("UPDATE settings SET setting_value = ?, updated_by = ?, updated_at = NOW() WHERE setting_key = 'qr_secret'");
        $stmt->execute([$newSecret, $adminName]);

        if ($stmt->rowCount() === 0) {
            // Insert jika belum ada (tanpa kolom setting_description yang tidak ada di skema)
            $stmt = $pdo->prepare("INSERT INTO settings (setting_key, setting_value, updated_by) VALUES ('qr_secret', ?, ?)");
            $stmt->execute([$newSecret, $adminName]);
        }

        // Log activity
        try {
            $stmtLog = $pdo->prepare("INSERT INTO activity_logs (user, aktivitas, status) VALUES (?, ?, ?)");
            $stmtLog->execute([$_SESSION['username'] ?? 'admin', 'Regenerate QR Secret', 'Sukses']);
        } catch (Exception $e) {
            // Ignore
        }

        sendResponse(true, 'QR Secret berhasil diperbarui. QR Code lama tidak akan berfungsi lagi.', [
            'new_secret' => $newSecret
        ]);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

sendResponse(false, 'Invalid request method');
?>