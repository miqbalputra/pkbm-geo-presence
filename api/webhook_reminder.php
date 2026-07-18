<?php
/**
 * Webhook Reminder - Cek guru yang belum presensi dan kirim ke n8n
 * Dipanggil oleh cron job setiap jam 08:00, 09:00, 10:00 WIB
 */

require_once 'config.php';
require_once 'workday_service.php';

// Fungsi untuk log error
function logError($message) {
    error_log(date('Y-m-d H:i:s') . " - Webhook Reminder Error: " . $message . "\n", 3, __DIR__ . '/webhook_error.log');
}

// Fungsi untuk log success
function logSuccess($message) {
    error_log(date('Y-m-d H:i:s') . " - Webhook Reminder Success: " . $message . "\n", 3, __DIR__ . '/webhook_success.log');
}

try {
    // 1. Ambil konfigurasi webhook dari database
    $stmt = $pdo->query("SELECT * FROM webhook_config WHERE id = 1");
    $config = $stmt->fetch();
    
    if (!$config || !$config['enabled']) {
        logError('Webhook disabled atau config tidak ditemukan');
        exit('Webhook disabled');
    }
    
    // 2. Cek apakah hari ini hari libur
    $today = date('Y-m-d');
    $stmt = $pdo->prepare("SELECT * FROM holidays WHERE tanggal = ?");
    $stmt->execute([$today]);
    $holiday = $stmt->fetch();
    
    // Cek apakah hari ini weekend (Sabtu/Minggu)
    $dayOfWeek = date('N'); // 1 (Senin) sampai 7 (Minggu)
    $isWeekend = ($dayOfWeek >= 6);
    
    // LOGIKA BARU: Hanya holiday dengan is_workday=1 yang dianggap BUKAN LIBUR (event/rapat).
    // Libur sekolah tetap dianggap libur total.
    $isSpecialWorkday = $holiday && ($holiday['is_workday'] == 1);
    
    $dateStatus = gpw_get_date_status($pdo, $today);
    if (!$isSpecialWorkday && ($holiday || ($isWeekend && !$dateStatus['isWeekendWorkday']))) {
        $reason = $holiday ? 'Hari libur: ' . $holiday['nama'] : 'Weekend';
        logSuccess($reason . '. Skip reminder.');
        exit($reason . ', skip reminder');
    }
    
    // 3. Ambil daftar guru yang belum presensi hari ini
    $stmt = $pdo->prepare("
        SELECT u.id, u.nama, u.no_hp, u.jenis_kelamin
        FROM users u
        WHERE u.role = 'guru' 
        AND u.archived_at IS NULL
        AND u.id NOT IN (
            SELECT user_id FROM attendance_logs 
            WHERE tanggal = ?
        )
        ORDER BY u.nama
    ");
    $stmt->execute([$today]);
    $guruBelumPresensi = array_values(array_filter($stmt->fetchAll(), function ($guru) use ($pdo, $today) {
        return gpw_get_date_status($pdo, $today, $guru['jenis_kelamin'])['isWorkday'];
    }));
    
    if (empty($guruBelumPresensi)) {
        logSuccess('Semua guru sudah presensi. Skip reminder.');
        exit('Semua guru sudah presensi');
    }
    
    // 4. Tentukan jam reminder (untuk pesan yang berbeda)
    $currentHour = (int)date('H');
    $reminderType = '';
    if ($currentHour == 8) {
        $reminderType = 'first'; // Pengingat pertama
    } elseif ($currentHour == 9) {
        $reminderType = 'second'; // Pengingat kedua
    } elseif ($currentHour == 10) {
        $reminderType = 'final'; // Pengingat terakhir + admin alert
    } else {
        $reminderType = 'manual'; // Jika dipanggil manual
    }
    
    // 5. Siapkan data untuk dikirim ke n8n
    $webhookData = [
        'timestamp' => date('Y-m-d H:i:s'),
        'reminder_type' => $reminderType,
        'total_belum_presensi' => count($guruBelumPresensi),
        'guru_list' => [],
        'admin_alert' => ($reminderType === 'final'), // True jika jam 10:00
        'admin_phone' => $config['admin_phone'] ?? null
    ];
    
    // Format data guru
    foreach ($guruBelumPresensi as $guru) {
        $webhookData['guru_list'][] = [
            'id' => $guru['id'],
            'nama' => $guru['nama'],
            'no_hp' => $guru['no_hp']
        ];
    }
    
    // 6. Kirim data ke n8n webhook
    $n8nUrl = $config['n8n_webhook_url'];
    
    // Debug: Cek URL
    if (empty($n8nUrl)) {
        logError('n8n webhook URL kosong di config');
        echo json_encode([
            'success' => false,
            'message' => 'n8n webhook URL tidak dikonfigurasi',
            'error' => 'URL kosong',
            'debug' => [
                'config_found' => !empty($config),
                'url' => $n8nUrl
            ]
        ]);
        exit;
    }
    
    logSuccess("Sending to n8n: $n8nUrl");
    
    $ch = curl_init($n8nUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($webhookData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Skip SSL verification (untuk testing)
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    $curlInfo = curl_getinfo($ch);
    curl_close($ch);
    
    // Debug log
    logSuccess("cURL Response - HTTP Code: $httpCode, Error: " . ($curlError ?: 'none'));
    
    // 7. Log hasil pengiriman
    if ($httpCode >= 200 && $httpCode < 300) {
        // Success
        $stmt = $pdo->prepare("
            INSERT INTO webhook_logs (reminder_type, total_guru, status, response)
            VALUES (?, ?, 'success', ?)
        ");
        $stmt->execute([
            $reminderType,
            count($guruBelumPresensi),
            $response
        ]);
        
        logSuccess("Reminder sent successfully. Type: $reminderType, Total guru: " . count($guruBelumPresensi));
        
        echo json_encode([
            'success' => true,
            'message' => 'Reminder sent successfully',
            'data' => $webhookData
        ]);
    } else {
        // Failed
        $errorMsg = $curlError ?: "HTTP $httpCode";
        
        $stmt = $pdo->prepare("
            INSERT INTO webhook_logs (reminder_type, total_guru, status, response)
            VALUES (?, ?, 'failed', ?)
        ");
        $stmt->execute([
            $reminderType,
            count($guruBelumPresensi),
            $errorMsg
        ]);
        
        logError("Failed to send reminder. Error: $errorMsg");
        
        echo json_encode([
            'success' => false,
            'message' => 'Failed to send reminder',
            'error' => $errorMsg,
            'debug' => [
                'url' => $n8nUrl,
                'http_code' => $httpCode,
                'curl_error' => $curlError,
                'curl_info' => $curlInfo,
                'data_sent' => $webhookData
            ]
        ]);
    }
    
} catch (Exception $e) {
    logError('Exception: ' . $e->getMessage());
    
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
