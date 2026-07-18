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

// GET ALL GURU
try {
    $stmt = $pdo->query("
        SELECT id, nama, no_hp, role, jabatan, 
               id_guru, jenis_kelamin, tanggal_bertugas, tanggal_lahir, alamat
        FROM users 
        WHERE role = 'guru' 
          AND archived_at IS NULL
        ORDER BY nama ASC
    ");
    
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
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
        $user['tanggalLahir'] = $user['tanggal_lahir'];
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Data guru berhasil diambil',
        'data' => $users
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
