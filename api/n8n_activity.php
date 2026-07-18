<?php
/**
 * API Endpoint khusus untuk n8n (tanpa session auth)
 * Menggunakan API Key untuk security
 */

require_once 'config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

requireApiKey('N8N_API_KEY');

// POST - Log Activity
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid JSON data'
        ]);
        exit();
    }
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO activity_logs (user, aktivitas, status, waktu) 
            VALUES (?, ?, ?, NOW())
        ");
        
        $stmt->execute([
            $data['user'] ?? 'System',
            $data['aktivitas'] ?? 'N8N Activity',
            $data['status'] ?? ''
        ]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Activity logged successfully',
            'id' => $pdo->lastInsertId()
        ]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Database error: ' . $e->getMessage()
        ]);
    }
} else {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
}
?>
