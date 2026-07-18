<?php
/**
 * API Endpoint khusus untuk n8n
 * Return guru yang belum presensi hari ini
 */

require_once 'config.php';
require_once 'workday_service.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

requireApiKey('N8N_API_KEY');

// GET GURU YANG BELUM PRESENSI HARI INI
try {
    $today = date('Y-m-d');
    $dayOfWeek = date('N'); // 1=Senin, 7=Minggu
    
    // CEK HARI LIBUR
    // 1. Cek weekend (Sabtu=6, Minggu=7)
    $isWeekend = ($dayOfWeek == 6 || $dayOfWeek == 7);
    
    // 2. Cek hari libur nasional dari database
    $holidayStmt = $pdo->prepare("
        SELECT tanggal, nama, jenis, is_workday
        FROM holidays
        WHERE tanggal = ?
        LIMIT 1
    ");
    $holidayStmt->execute([$today]);
    $holiday = $holidayStmt->fetch(PDO::FETCH_ASSOC);
    
    // LOGIKA BARU: Hanya holiday dengan is_workday=1 yang dianggap BUKAN LIBUR (event/rapat).
    // Libur sekolah tetap dianggap libur total.
    $isSpecialWorkday = $holiday && ($holiday['is_workday'] == 1);
    
    $dateStatus = gpw_get_date_status($pdo, $today);
    if (!$isSpecialWorkday && ($holiday || ($isWeekend && !$dateStatus['isWeekendWorkday']))) {
        echo json_encode([
            'success' => true,
            'message' => $holiday ? 'Hari ini adalah hari libur: ' . $holiday['nama'] : 'Hari ini adalah hari libur (Weekend)',
            'data' => [],
            'tanggal' => $today,
            'total' => 0,
            'isHoliday' => true,
            'holidayType' => $holiday ? $holiday['jenis'] : 'weekend',
            'holidayName' => $holiday ? $holiday['nama'] : ($dayOfWeek == 6 ? 'Sabtu' : 'Minggu')
        ]);
        exit();
    }
    
    // HARI KERJA - Query guru yang belum presensi hari ini
    $stmt = $pdo->prepare("
        SELECT u.id, u.nama, u.no_hp, u.role, u.jabatan, 
               u.id_guru, u.jenis_kelamin, u.tanggal_bertugas, u.alamat
        FROM users u
        LEFT JOIN attendance_logs a ON u.id = a.user_id AND a.tanggal = ?
        WHERE u.role = 'guru' 
        AND u.archived_at IS NULL
        AND a.id IS NULL
        AND u.no_hp IS NOT NULL 
        AND u.no_hp != ''
        ORDER BY u.nama ASC
    ");
    
    $stmt->execute([$today]);
    $users = array_values(array_filter($stmt->fetchAll(PDO::FETCH_ASSOC), function ($user) use ($pdo, $today) {
        return gpw_get_date_status($pdo, $today, $user['jenis_kelamin'])['isWorkday'];
    }));
    
    // Format response
    foreach ($users as &$user) {
        // Parse jabatan dari JSON
        if (!empty($user['jabatan'])) {
            $jabatan = json_decode($user['jabatan'], true);
            $user['jabatan'] = is_array($jabatan) ? $jabatan : [$user['jabatan']];
        } else {
            $user['jabatan'] = [];
        }
        
        // Convert snake_case to camelCase
        $user['idGuru'] = $user['id_guru'];
        $user['noHP'] = $user['no_hp'];
        $user['jenisKelamin'] = $user['jenis_kelamin'];
        $user['tanggalBertugas'] = $user['tanggal_bertugas'];
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Data guru yang belum presensi berhasil diambil',
        'data' => $users,
        'tanggal' => $today,
        'total' => count($users),
        'isHoliday' => false,
        'isWorkday' => true
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
