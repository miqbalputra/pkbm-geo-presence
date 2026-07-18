<?php
/**
 * Webhook Reminder DIRECT - Kirim WhatsApp langsung ke Gowa (tanpa n8n)
 * Dipanggil oleh cron job setiap jam 08:00, 09:00, 10:00 WIB
 */

require_once 'config.php';
require_once 'workday_service.php';

// Fungsi untuk log error
function logError($message) {
    error_log(date('Y-m-d H:i:s') . " - Webhook Direct Error: " . $message . "\n", 3, __DIR__ . '/webhook_error.log');
}

// Fungsi untuk log success
function logSuccess($message) {
    error_log(date('Y-m-d H:i:s') . " - Webhook Direct Success: " . $message . "\n", 3, __DIR__ . '/webhook_success.log');
}

// Fungsi kirim WhatsApp ke Gowa
function sendWhatsApp($phone, $message, $gowaUrl, $gowaUsername, $gowaPassword) {
    // Format nomor (konversi 08xxx ke 628xxx)
    if (substr($phone, 0, 1) === '0') {
        $phone = '62' . substr($phone, 1);
    }
    
    $ch = curl_init($gowaUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'phone' => $phone,
        'message' => $message
    ]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_USERPWD, $gowaUsername . ':' . $gowaPassword); // Basic Auth
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    
    return [
        'success' => ($httpCode >= 200 && $httpCode < 300),
        'http_code' => $httpCode,
        'response' => $response,
        'error' => $curlError
    ];
}

try {
    // 1. Ambil konfigurasi webhook dari database
    $stmt = $pdo->query("SELECT * FROM webhook_config WHERE id = 1");
    $config = $stmt->fetch();
    
    if (!$config || !$config['enabled']) {
        logError('Webhook disabled atau config tidak ditemukan');
        exit('Webhook disabled');
    }
    
    $gowaUrl = envValue('GOWA_WEBHOOK_URL', '');
    $gowaUsername = envValue('GOWA_USERNAME', '');
    $gowaPassword = envValue('GOWA_PASSWORD', '');

    if ($gowaUrl === '' || $gowaUsername === '' || $gowaPassword === '') {
        logError('Gowa credentials belum dikonfigurasi di environment variable');
        exit('Gowa credentials not configured');
    }
    
    // 2. Cek apakah hari ini hari libur
    $today = date('Y-m-d');
    $stmt = $pdo->prepare("SELECT * FROM holidays WHERE tanggal = ?");
    $stmt->execute([$today]);
    $holiday = $stmt->fetch();
    
    // Cek apakah hari ini weekend
    $dayOfWeek = date('N'); // 1 (Senin) - 7 (Minggu)
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
    
    // 3. Ambil daftar guru yang belum presensi
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

    // 4. Tentukan jam reminder
    $currentHour = (int)date('H');
    $reminderType = '';
    if ($currentHour == 8) {
        $reminderType = 'first';
    } elseif ($currentHour == 9) {
        $reminderType = 'second';
    } elseif ($currentHour == 10) {
        $reminderType = 'final';
    } else {
        $reminderType = 'manual';
    }
    
    // 5. Kirim WhatsApp ke setiap guru
    $successCount = 0;
    $failedCount = 0;
    
    // URL aplikasi untuk link presensi di pesan WhatsApp.
    // Dipakai dari env APP_URL (di-set di Coolify); fallback ke domain default.
    $appUrl = rtrim(envValue('APP_URL', 'https://geo.pkbmtunasilmu.web.id'), '/');
    if ($appUrl === '') {
        $appUrl = 'https://geo.pkbmtunasilmu.web.id';
    }

    foreach ($guruBelumPresensi as $guru) {
        // Template pesan berdasarkan jenis reminder
        $message = '';

        if ($reminderType === 'first') {
            $message = "🔔 *Pengingat Presensi*\n\nHalo *{$guru['nama']}*,\n\nAnda belum melakukan presensi hari ini.\nMohon segera isi presensi melalui:\n👉 {$appUrl}\n\nTerima kasih.\n_Sistem PKBM Tunas Ilmu_";
        } elseif ($reminderType === 'second') {
            $message = "⚠️ *Pengingat Presensi (Kedua)*\n\nHalo *{$guru['nama']}*,\n\nAnda masih belum melakukan presensi hari ini.\nMohon segera isi presensi:\n👉 {$appUrl}\n\nTerima kasih.\n_Sistem PKBM Tunas Ilmu_";
        } elseif ($reminderType === 'final') {
            $message = "🚨 *Pengingat Presensi (Terakhir)*\n\nHalo *{$guru['nama']}*,\n\nIni adalah pengingat terakhir.\nAnda belum melakukan presensi hari ini.\n\nMohon SEGERA isi presensi:\n👉 {$appUrl}\n\nJika ada kendala, hubungi admin.\n_Sistem PKBM Tunas Ilmu_";
        } else {
            $message = "🔔 *Pengingat Presensi*\n\nHalo *{$guru['nama']}*,\n\nAnda belum melakukan presensi hari ini.\nMohon segera isi presensi melalui:\n👉 {$appUrl}\n\nTerima kasih.\n_Sistem PKBM Tunas Ilmu_";
        }
        
        // Kirim WhatsApp
        $result = sendWhatsApp($guru['no_hp'], $message, $gowaUrl, $gowaUsername, $gowaPassword);
        
        if ($result['success']) {
            $successCount++;
            logSuccess("WhatsApp sent to {$guru['nama']} ({$guru['no_hp']})");
        } else {
            $failedCount++;
            logError("Failed to send WhatsApp to {$guru['nama']}: " . $result['error']);
        }
        
        // Delay 1 detik antar pengiriman (untuk avoid rate limit)
        sleep(1);
    }

    // 6. Kirim notifikasi ke admin (jika jam 10:00)
    if ($reminderType === 'final' && !empty($config['admin_phone'])) {
        $namaGuru = array_map(function($g, $i) {
            return ($i+1) . ". " . $g['nama'];
        }, $guruBelumPresensi, array_keys($guruBelumPresensi));
        
        $adminMessage = "📊 *Laporan Presensi - 10:00 WIB*\n\n⚠️ Total guru belum presensi: *" . count($guruBelumPresensi) . " orang*\n\nDaftar guru:\n" . implode("\n", $namaGuru) . "\n\nPengingat terakhir telah dikirim.\nMohon tindak lanjut.\n\n_Sistem PKBM Tunas Ilmu_\n_" . date('Y-m-d H:i:s') . "_";
        
        $adminResult = sendWhatsApp($config['admin_phone'], $adminMessage, $gowaUrl, $gowaUsername, $gowaPassword);
        
        if ($adminResult['success']) {
            logSuccess("Admin alert sent to {$config['admin_phone']}");
        } else {
            logError("Failed to send admin alert: " . $adminResult['error']);
        }
    }
    
    // 7. Log hasil ke database
    $stmt = $pdo->prepare("
        INSERT INTO webhook_logs (reminder_type, total_guru, status, response)
        VALUES (?, ?, 'success', ?)
    ");
    $stmt->execute([
        $reminderType,
        count($guruBelumPresensi),
        "Sent: $successCount, Failed: $failedCount"
    ]);
    
    logSuccess("Reminder completed. Type: $reminderType, Success: $successCount, Failed: $failedCount");
    
    echo json_encode([
        'success' => true,
        'message' => 'Reminder sent successfully',
        'data' => [
            'reminder_type' => $reminderType,
            'total_guru' => count($guruBelumPresensi),
            'success_count' => $successCount,
            'failed_count' => $failedCount
        ]
    ]);
    
} catch (Exception $e) {
    logError('Exception: ' . $e->getMessage());
    
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
