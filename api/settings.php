<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

// GET settings - bisa diakses tanpa auth (untuk cek jam masuk)
if ($method === 'GET' && !isset($_GET['id'])) {
    // Public endpoint untuk get settings
} else if (in_array($method, ['POST', 'PUT'])) {
    // Write operations - hanya admin
    requireAuth(['admin', 'kepala_sekolah']);
} else {
    // Read operations - semua role
    requireAuth(['admin', 'guru']);
}

// GET ALL SETTINGS
if ($method === 'GET' && !isset($_GET['id'])) {
    try {
        $query = "SELECT * FROM settings ORDER BY setting_key ASC";
        $stmt = $pdo->prepare($query);
        $stmt->execute();
        $settings = $stmt->fetchAll();
        
        // Convert to key-value object
        $settingsObj = [];
        foreach ($settings as $setting) {
            $settingsObj[$setting['setting_key']] = $setting['setting_value'];
        }
        
        sendResponse(true, 'Settings berhasil diambil', $settingsObj);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// UPDATE SETTING (Admin only)
if ($method === 'PUT') {
    $data = getRequestData();
    
    try {
        if (empty($data['setting_key']) || !isset($data['setting_value'])) {
            sendResponse(false, 'Setting key dan value harus diisi');
        }
        
        // Validasi setting_key yang diizinkan sesuai fitur LENGKAP 2026
        $allowedKeys = [
            'jam_masuk_normal', 'toleransi_terlambat', 'radius_gps', 'sekolah_latitude', 'sekolah_longitude', 'sekolah_nama', 'mode_testing',
            'lokasi_laki_latitude', 'lokasi_laki_longitude', 'lokasi_perempuan_latitude', 'lokasi_perempuan_longitude',
            'lokasi_apel_latitude', 'lokasi_apel_longitude', 'apel_senin_enabled',
            'location_tracking_enabled', 'location_tracking_interval_minutes', 'location_tracking_accuracy_limit',
            'qr_secret', 'qr_enabled', 'piket_terlambat_adalah_terlambat', 'jam_piket_default', 'button_enabled',
            'jam_min_pulang',
            'weekend_workday_enabled',
            'saturday_male_workday_enabled', 'saturday_female_workday_enabled',
            'sunday_male_workday_enabled', 'sunday_female_workday_enabled',
            // Aturan PKBM Tunas Ilmu — hari kerja & rotasi piket Sabtu
            'workday_days',
            'piket_rotation_enabled',
            'piket_group_a_weeks', 'piket_group_b_weeks',
            'piket_week5_mode',
            'piket_jam_masuk', 'piket_jam_pulang'
        ];
        if (!in_array($data['setting_key'], $allowedKeys)) {
            sendResponse(false, 'Setting key tidak valid: ' . $data['setting_key']);
        }

        if ($data['setting_key'] === 'location_tracking_enabled' && !in_array((string)$data['setting_value'], ['0', '1'], true)) {
            sendResponse(false, 'Nilai tracking lokasi harus 0 atau 1');
        }

        $weekendWorkdayKeys = [
            'weekend_workday_enabled',
            'saturday_male_workday_enabled',
            'saturday_female_workday_enabled',
            'sunday_male_workday_enabled',
            'sunday_female_workday_enabled'
        ];

        if (in_array($data['setting_key'], $weekendWorkdayKeys, true) && !in_array((string)$data['setting_value'], ['0', '1'], true)) {
            sendResponse(false, 'Nilai presensi Sabtu/Minggu harus 0 atau 1');
        }

        if ($data['setting_key'] === 'location_tracking_interval_minutes') {
            $interval = validateInt($data['setting_value'], 5, 60);
            if ($interval === false) {
                sendResponse(false, 'Interval tracking harus 5 sampai 60 menit');
            }
            $data['setting_value'] = (string)$interval;
        }

        if ($data['setting_key'] === 'location_tracking_accuracy_limit') {
            $accuracyLimit = validateInt($data['setting_value'], 20, 1000);
            if ($accuracyLimit === false) {
                sendResponse(false, 'Batas akurasi GPS harus 20 sampai 1000 meter');
            }
            $data['setting_value'] = (string)$accuracyLimit;
        }

        if ($data['setting_key'] === 'jam_min_pulang') {
            $value = trim((string)$data['setting_value']);
            if (strlen($value) === 5) {
                $value .= ':00'; // HH:MM -> HH:MM:SS
            }
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $value)) {
                sendResponse(false, 'Format jam minimal pulang tidak valid. Contoh: 12:30');
            }
            $data['setting_value'] = substr($value, 0, 5);
        }

        // workday_days — CSV angka 0-6 (0=Minggu..6=Sabtu). Normalisasi: urut,
        // unik, tanpa spasi. Contoh valid: "6" atau "1,3,5".
        if ($data['setting_key'] === 'workday_days') {
            $parts = preg_split('/[\s,]+/', trim((string)$data['setting_value']));
            $days = [];
            foreach ($parts as $p) {
                if ($p === '') continue;
                $n = (int)$p;
                if ($n < 0 || $n > 6) {
                    sendResponse(false, 'Hari kerja harus angka 0-6 (0=Minggu, 6=Sabtu)');
                }
                if (!in_array($n, $days, true)) $days[] = $n;
            }
            if (empty($days)) {
                sendResponse(false, 'Pilih minimal satu hari kerja aktif');
            }
            sort($days);
            $data['setting_value'] = implode(',', $days);
        }

        // piket_rotation_enabled — 0 atau 1
        if ($data['setting_key'] === 'piket_rotation_enabled' && !in_array((string)$data['setting_value'], ['0', '1'], true)) {
            sendResponse(false, 'Nilai rotasi piket harus 0 atau 1');
        }

        // piket_group_a_weeks / piket_group_b_weeks — CSV angka 1-4, normalisasi unik & urut.
        // Pekan ke-5 TIDAK diatur di sini — sepenuhnya dikontrol oleh piket_week5_mode.
        if (in_array($data['setting_key'], ['piket_group_a_weeks', 'piket_group_b_weeks'], true)) {
            $parts = preg_split('/[\s,]+/', trim((string)$data['setting_value']));
            $weeks = [];
            foreach ($parts as $p) {
                if ($p === '') continue;
                $n = (int)$p;
                if ($n < 1 || $n > 4) {
                    sendResponse(false, 'Pekan harus angka 1-4 (pekan ke-5 diatur oleh Mode Pekan ke-5)');
                }
                if (!in_array($n, $weeks, true)) $weeks[] = $n;
            }
            $data['setting_value'] = implode(',', $weeks);
        }

        // piket_week5_mode — all / none / A / B
        if ($data['setting_key'] === 'piket_week5_mode' && !in_array((string)$data['setting_value'], ['all', 'none', 'A', 'B'], true)) {
            sendResponse(false, 'Mode pekan ke-5 harus: all, none, A, atau B');
        }

        // piket_jam_masuk / piket_jam_pulang — format HH:MM
        if (in_array($data['setting_key'], ['piket_jam_masuk', 'piket_jam_pulang'], true)) {
            $value = trim((string)$data['setting_value']);
            if (strlen($value) === 5) $value .= ':00';
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $value)) {
                sendResponse(false, 'Format jam piket tidak valid. Contoh: 07:00');
            }
            $data['setting_value'] = substr($value, 0, 5);
        }
        // ... validasi format jam, angka, dll tetap berjalan ...

        // Get user info from session - SESUAIKAN DENGAN auth.php
        $updatedBy = $_SESSION['username'] ?? 'admin';
        
        // Gunakan UPSERT: insert jika belum ada, update jika sudah ada
        $stmt = $pdo->prepare("
            INSERT INTO settings (setting_key, setting_value, updated_by, updated_at)
            VALUES (?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                updated_by = VALUES(updated_by),
                updated_at = NOW()
        ");
        
        $stmt->execute([
            $data['setting_key'],
            $data['setting_value'],
            $updatedBy,
        ]);
        
        sendResponse(true, 'Setting berhasil disimpan');
    } catch (PDOException $e) {
        sendResponse(false, 'Error Database: ' . $e->getMessage());
    }
}

sendResponse(false, 'Invalid request');
?>
