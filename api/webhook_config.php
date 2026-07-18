<?php
/**
 * Webhook Config API - Manage webhook configuration
 * Hanya admin yang bisa akses
 */

require_once 'config.php';

requireAuth(['admin', 'kepala_sekolah']);

$method = $_SERVER['REQUEST_METHOD'];

// GET CONFIG
if ($method === 'GET') {
    try {
        $stmt = $pdo->query("SELECT * FROM webhook_config WHERE id = 1");
        $config = $stmt->fetch();
        
        if (!$config) {
            // Create default config if not exists
            $stmt = $pdo->prepare("
                INSERT INTO webhook_config (enabled, n8n_webhook_url, admin_phone)
                VALUES (0, '', '')
            ");
            $stmt->execute();
            
            $config = [
                'id' => 1,
                'enabled' => 0,
                'n8n_webhook_url' => '',
                'admin_phone' => '',
                'created_at' => date('Y-m-d H:i:s'),
                'updated_at' => date('Y-m-d H:i:s')
            ];
        }
        
        sendResponse(true, 'Config berhasil diambil', $config);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// UPDATE CONFIG
if ($method === 'PUT') {
    $data = getRequestData();
    
    try {
        // Validasi URL n8n
        if (!empty($data['n8nWebhookUrl'])) {
            if (!filter_var($data['n8nWebhookUrl'], FILTER_VALIDATE_URL)) {
                sendResponse(false, 'URL n8n tidak valid');
            }
        }
        
        // Validasi nomor HP admin
        if (!empty($data['adminPhone'])) {
            // Hapus karakter non-digit
            $phone = preg_replace('/[^0-9]/', '', $data['adminPhone']);
            if (strlen($phone) < 10 || strlen($phone) > 15) {
                sendResponse(false, 'Nomor HP admin tidak valid');
            }
            $data['adminPhone'] = $phone;
        }
        
        $stmt = $pdo->prepare("
            UPDATE webhook_config SET 
                enabled = ?,
                n8n_webhook_url = ?,
                admin_phone = ?,
                updated_at = NOW()
            WHERE id = 1
        ");
        
        $stmt->execute([
            $data['enabled'] ? 1 : 0,
            $data['n8nWebhookUrl'] ?? '',
            $data['adminPhone'] ?? ''
        ]);
        
        sendResponse(true, 'Config berhasil diupdate');
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// GET LOGS (untuk monitoring)
if ($method === 'GET' && isset($_GET['logs'])) {
    try {
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
        
        $stmt = $pdo->prepare("
            SELECT * FROM webhook_logs 
            ORDER BY created_at DESC 
            LIMIT ?
        ");
        $stmt->execute([$limit]);
        $logs = $stmt->fetchAll();
        
        // Format waktu
        foreach ($logs as &$log) {
            $log['created_at'] = date('d-m-Y H:i:s', strtotime($log['created_at']));
        }
        
        sendResponse(true, 'Logs berhasil diambil', $logs);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

sendResponse(false, 'Invalid request');
?>
