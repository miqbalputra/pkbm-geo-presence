<?php
/**
 * QR Scan Attendance API
 * Endpoint untuk presensi dengan scan QR Code + validasi GPS
 */
require_once 'config.php';
require_once 'attendance_service.php';

// Endpoint ini harus login sebagai guru
requireAuth(['guru']);

$method = $_SERVER['REQUEST_METHOD'];

// POST - Proses scan QR Code
if ($method === 'POST') {
    // Pastikan timezone server sesuai WIB
    date_default_timezone_set('Asia/Jakarta');
    $data = getRequestData();
    
    try {
        // Validasi input
        if (empty($data['qr_data'])) {
            sendResponse(false, 'Data QR Code tidak valid');
        }
        
        if (!isset($data['latitude']) || !isset($data['longitude'])) {
            sendResponse(false, 'Koordinat GPS diperlukan');
        }
        
        // Parse QR data
        $qrData = json_decode($data['qr_data'], true);
        if (!$qrData || !isset($qrData['secret']) || !isset($qrData['type'])) {
            sendResponse(false, 'Format QR Code tidak valid');
        }
        
        // Get settings untuk validasi QR, GPS, dan jam presensi dalam satu query.
        $stmt = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN (
            'qr_secret', 'qr_enabled',
            'sekolah_latitude', 'sekolah_longitude', 'radius_gps', 'mode_testing', 
            'jam_masuk_normal', 'toleransi_terlambat',
            'lokasi_laki_latitude', 'lokasi_laki_longitude',
            'lokasi_perempuan_latitude', 'lokasi_perempuan_longitude',
            'lokasi_apel_latitude', 'lokasi_apel_longitude',
            'apel_senin_enabled',
            'jam_min_pulang'
        )");
        $stmt->execute();
        $settingsArr = $stmt->fetchAll();
        
        $settings = [];
        foreach ($settingsArr as $s) {
            $settings[$s['setting_key']] = $s['setting_value'];
        }

        if (empty($settings['qr_secret']) || $qrData['secret'] !== $settings['qr_secret']) {
            sendResponse(false, 'QR Code tidak valid atau sudah kadaluarsa');
        }
        
        // Validasi tipe QR
        if ($qrData['type'] !== 'attendance') {
            sendResponse(false, 'QR Code bukan untuk presensi');
        }
        
        // Cek apakah fitur QR enabled
        if (($settings['qr_enabled'] ?? '0') !== '1') {
            sendResponse(false, 'Fitur QR Code Scan sedang tidak aktif');
        }
        
        // Get user info from session — dengan fallback DB jika sesi lama
        if (isset($_SESSION['user']) && is_array($_SESSION['user']) && isset($_SESSION['user']['jenis_kelamin'], $_SESSION['user']['tipe_guru'])) {
            $user = $_SESSION['user'];
        } else {
            // Fallback: ambil dari database pakai user_id
            $stmtUser = $pdo->prepare("
                SELECT id, nama, jenis_kelamin, tipe_guru, pokjar
                FROM users
                WHERE id = ?
                LIMIT 1
            ");
            $stmtUser->execute([$_SESSION['user_id']]);
            $user = $stmtUser->fetch();
            if (!$user) {
                sendResponse(false, 'Data user tidak ditemukan. Silakan login ulang.');
            }
            $_SESSION['user'] = $user; // cache ke session
        }
        $userId = $user['id'];
        $userName = $user['nama'];

        // Tanggal hari ini
        $today = date('Y-m-d');
        $currentTime = date('H:i:s');

        $stmt = $pdo->prepare("
            SELECT *
            FROM attendance_logs
            WHERE user_id = ? AND tanggal = ?
            LIMIT 1
        ");
        $stmt->execute([$userId, $today]);
        $existing = $stmt->fetch();

        if ($existing) {
            $isPulangFlag = isset($data['is_pulang']) && ($data['is_pulang'] === true || $data['is_pulang'] === 1 || $data['is_pulang'] === '1');
            $minPulangSetting = $settings['jam_min_pulang'] ?? '12:30';
            $minPulangFormatted = substr($minPulangSetting, 0, 5);
            $currentMinutes = (intval(date('H')) * 60) + intval(date('i'));
            $isPulangRequest = $isPulangFlag || ($currentMinutes >= gp_time_to_minutes($minPulangFormatted));

            if (!$isPulangRequest) {
                sendResponse(false, 'Anda sudah presensi masuk. Belum bisa presensi pulang sebelum pukul ' . $minPulangFormatted . ' WIB.');
            }

            gp_enforce_attendance_location($settings, $user, $data['latitude'], $data['longitude'], $today, true);

            $attendance = gp_checkout_attendance($pdo, [
                'record' => $existing,
                'time' => $currentTime,
                'izin_pulang_awal' => !empty($data['izin_pulang_awal']),
                'keterangan' => $data['keterangan'] ?? '',
                'method' => 'qr_scan'
            ]);

            sendResponse(true, 'Presensi pulang berhasil (Smart Scan)!', [
                'jam_pulang' => $attendance['jam_pulang'],
                'attendance' => $attendance,
                'message' => 'Hati-hati di jalan!'
            ]);
        }

        gp_enforce_attendance_location($settings, $user, $data['latitude'], $data['longitude'], $today, false);

        $attendance = gp_create_attendance($pdo, [
            'user' => $user,
            'date' => $today,
            'time' => $currentTime,
            'status' => 'hadir',
            'keterangan' => '',
            'latitude' => $data['latitude'],
            'longitude' => $data['longitude'],
            'method' => 'qr_scan'
        ]);

        $message = $attendance['status'] === 'hadir'
            ? 'Presensi berhasil! Selamat bekerja!'
            : 'Presensi berhasil! (' . $attendance['keterangan'] . ')';

        sendResponse(true, $message, [
            'id' => $attendance['id'],
            'status' => $attendance['status'],
            'jam_masuk' => $attendance['jam_masuk'],
            'keterangan' => $attendance['keterangan'],
            'metode' => 'qr_scan',
            'attendance' => $attendance
        ]);

    } catch (PDOException $e) {
        handleError($e, 'qr_scan.php - create');
    }
}

// GET - Cek status hari ini (untuk tampilan di halaman scan)
if ($method === 'GET') {
    // Gunakan user_id dari sesi
    $userId = $_SESSION['user_id'] ?? null;
    
    if (!$userId) {
        sendResponse(false, 'Sesi tidak valid. Silakan login ulang.');
    }

    $today = date('Y-m-d');
    
    try {
        $stmt = $pdo->prepare("
            SELECT id, user_id, nama, tanggal, status, jam_masuk, jam_pulang, jam_hadir,
                   jam_izin, jam_sakit, keterangan, latitude, longitude, metode,
                   created_at, updated_at
            FROM attendance_logs
            WHERE user_id = ? AND tanggal = ?
            LIMIT 1
        ");
        $stmt->execute([$userId, $today]);
        $attendance = gp_map_attendance_record($stmt->fetch());
        
        sendResponse(true, 'Status presensi', [
            'has_checked_in' => $attendance ? true : false,
            'has_checked_out' => $attendance && $attendance['jam_pulang'] ? true : false,
            'attendance' => $attendance
        ]);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function calculateDistance($lat1, $lon1, $lat2, $lon2) {
    $earthRadius = 6371000; // meters
    
    $latDiff = deg2rad($lat2 - $lat1);
    $lonDiff = deg2rad($lon2 - $lon1);
    
    $a = sin($latDiff / 2) * sin($latDiff / 2) +
         cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
         sin($lonDiff / 2) * sin($lonDiff / 2);
    
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    
    $distance = $earthRadius * $c;
    
    return round($distance);
}

sendResponse(false, 'Invalid request method');
?>
