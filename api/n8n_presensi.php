<?php
/**
 * API Endpoint khusus untuk n8n (tanpa session auth)
 * Menggunakan API Key untuk security
 */

require_once 'config.php';

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

// GET ALL PRESENSI
try {
    $query = "SELECT * FROM attendance_logs WHERE 1=1";
    $params = [];
    
    // Filter by tanggal (default: hari ini)
    if (isset($_GET['tanggal'])) {
        $query .= " AND tanggal = ?";
        $params[] = $_GET['tanggal'];
    } else {
        // Default: hari ini
        $query .= " AND tanggal = ?";
        $params[] = date('Y-m-d');
    }
    
    // Filter by user_id
    if (isset($_GET['user_id'])) {
        $query .= " AND user_id = ?";
        $params[] = $_GET['user_id'];
    }
    
    $query .= " ORDER BY tanggal DESC, id DESC";
    
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Convert snake_case to camelCase
    foreach ($logs as &$log) {
        $log['userId'] = $log['user_id'];
        $log['jamMasuk'] = $log['jam_masuk'];
        $log['jamPulang'] = $log['jam_pulang'];
        $log['jamHadir'] = $log['jam_hadir'];
        $log['jamIzin'] = $log['jam_izin'];
        $log['jamSakit'] = $log['jam_sakit'];
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Data presensi berhasil diambil',
        'data' => $logs
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
