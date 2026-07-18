<?php
require_once 'config.php';

// Admin dan Guru bisa akses endpoint ini
requireAuth(['admin', 'guru']);

$method = $_SERVER['REQUEST_METHOD'];

// GET ALL ACTIVITY LOGS
if ($method === 'GET') {
    try {
        $stmt = $pdo->query("SELECT id, user, aktivitas, status, waktu FROM activity_logs ORDER BY waktu DESC LIMIT 500");
        $logs = $stmt->fetchAll();
        
        // Format kolom waktu (bisa berupa timestamp atau string)
        foreach ($logs as &$log) {
            if (!empty($log['waktu'])) {
                // Jika waktu adalah timestamp MySQL, format ulang
                $ts = strtotime($log['waktu']);
                if ($ts !== false) {
                    $log['waktu'] = date('d-m-Y H:i:s', $ts);
                }
            } else {
                $log['waktu'] = '-';
            }
        }
        
        sendResponse(true, 'Activity logs berhasil diambil', $logs);
    } catch (PDOException $e) {
        sendResponse(false, 'Error mengambil log: ' . $e->getMessage());
    }
}

// CREATE ACTIVITY LOG
if ($method === 'POST') {
    $data = getRequestData();
    
    try {
        if (empty($data['user']) || empty($data['aktivitas']) || empty($data['status'])) {
            sendResponse(false, 'Field user, aktivitas, dan status harus diisi');
        }
        
        $stmt = $pdo->prepare("
            INSERT INTO activity_logs (user, aktivitas, status, waktu)
            VALUES (?, ?, ?, NOW())
        ");
        
        $stmt->execute([
            $data['user'],
            $data['aktivitas'],
            $data['status']
        ]);
        
        sendResponse(true, 'Activity log berhasil disimpan', ['id' => $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

sendResponse(false, 'Invalid request');
?>
