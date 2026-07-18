<?php
require_once 'config.php';

requireAuth(['admin', 'kepala_sekolah', 'guru']);

$method = $_SERVER['REQUEST_METHOD'];

function lt_get_settings($pdo)
{
    $keys = [
        'location_tracking_enabled',
        'location_tracking_interval_minutes',
        'location_tracking_accuracy_limit',
        'sekolah_latitude',
        'sekolah_longitude',
        'lokasi_laki_latitude',
        'lokasi_laki_longitude',
        'lokasi_perempuan_latitude',
        'lokasi_perempuan_longitude',
        'lokasi_apel_latitude',
        'lokasi_apel_longitude'
    ];
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $stmt = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ({$placeholders})");
    $stmt->execute($keys);

    $settings = [
        'location_tracking_enabled' => '0',
        'location_tracking_interval_minutes' => '15',
        'location_tracking_accuracy_limit' => '100'
    ];

    foreach ($stmt->fetchAll() as $row) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }

    return $settings;
}

function lt_normalize_date($date)
{
    $date = $date ?: date('Y-m-d');
    if (!validateDate($date)) {
        sendResponse(false, 'Format tanggal tidak valid');
    }
    return $date;
}

function lt_parse_coordinate($value)
{
    if ($value === null || $value === '') {
        return null;
    }

    $coordinate = filter_var(str_replace(',', '.', trim((string)$value)), FILTER_VALIDATE_FLOAT);
    return $coordinate === false ? null : (float)$coordinate;
}

function lt_calculate_distance_meters($lat1, $lon1, $lat2, $lon2)
{
    $earthRadius = 6371000;
    $toRad = function ($value) {
        return $value * M_PI / 180;
    };

    $dLat = $toRad($lat2 - $lat1);
    $dLon = $toRad($lon2 - $lon1);
    $a = sin($dLat / 2) * sin($dLat / 2)
        + cos($toRad($lat1)) * cos($toRad($lat2))
        * sin($dLon / 2) * sin($dLon / 2);

    return (int)round($earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a)));
}

function lt_get_geofence_pins($settings)
{
    $pinConfigs = [
        ['Lokasi Sekolah/Pusat', 'sekolah_latitude', 'sekolah_longitude'],
        ['Pos Guru Laki-laki', 'lokasi_laki_latitude', 'lokasi_laki_longitude'],
        ['Pos Guru Perempuan', 'lokasi_perempuan_latitude', 'lokasi_perempuan_longitude'],
        ['Lokasi Apel Senin', 'lokasi_apel_latitude', 'lokasi_apel_longitude']
    ];

    $pins = [];
    foreach ($pinConfigs as [$label, $latKey, $lonKey]) {
        $lat = lt_parse_coordinate($settings[$latKey] ?? null);
        $lon = lt_parse_coordinate($settings[$lonKey] ?? null);
        if ($lat === null || $lon === null) {
            continue;
        }

        $key = number_format($lat, 7, '.', '') . ',' . number_format($lon, 7, '.', '');
        if (isset($pins[$key])) {
            if (strpos($pins[$key]['label'], $label) === false) {
                $pins[$key]['label'] .= ' / ' . $label;
            }
            continue;
        }

        $pins[$key] = [
            'label' => $label,
            'latitude' => $lat,
            'longitude' => $lon
        ];
    }

    return array_values($pins);
}

function lt_attach_nearest_pin($row, $pins)
{
    $row['nearest_pin_label'] = null;
    $row['nearest_pin_distance'] = null;

    $lat = lt_parse_coordinate($row['latitude'] ?? null);
    $lon = lt_parse_coordinate($row['longitude'] ?? null);
    if ($lat === null || $lon === null || count($pins) === 0) {
        return $row;
    }

    $nearest = null;
    foreach ($pins as $pin) {
        $distance = lt_calculate_distance_meters($lat, $lon, $pin['latitude'], $pin['longitude']);
        if ($nearest === null || $distance < $nearest['distance']) {
            $nearest = [
                'label' => $pin['label'],
                'distance' => $distance
            ];
        }
    }

    if ($nearest !== null) {
        $row['nearest_pin_label'] = $nearest['label'];
        $row['nearest_pin_distance'] = $nearest['distance'];
    }

    return $row;
}

function lt_attach_nearest_pins($rows, $pins)
{
    return array_map(function ($row) use ($pins) {
        return lt_attach_nearest_pin($row, $pins);
    }, $rows);
}

if ($method === 'POST') {
    if (($_SESSION['role'] ?? '') !== 'guru') {
        sendResponse(false, 'Hanya guru yang dapat mengirim tracking lokasi');
    }

    $data = getRequestData();
    $settings = lt_get_settings($pdo);

    if (($settings['location_tracking_enabled'] ?? '0') !== '1') {
        sendResponse(false, 'Tracking lokasi sedang tidak aktif');
    }

    if (!isset($data['latitude'], $data['longitude']) || !validateCoordinates($data['latitude'], $data['longitude'])) {
        sendResponse(false, 'Koordinat GPS tidak valid');
    }

    $accuracy = isset($data['accuracy']) && $data['accuracy'] !== null
        ? filter_var($data['accuracy'], FILTER_VALIDATE_FLOAT)
        : null;
    if ($accuracy !== null && ($accuracy === false || $accuracy < 0)) {
        sendResponse(false, 'Akurasi GPS tidak valid');
    }

    $accuracyLimit = (float)($settings['location_tracking_accuracy_limit'] ?? 100);
    if ($accuracyLimit > 0 && $accuracy !== null && $accuracy > $accuracyLimit) {
        sendResponse(false, "Akurasi GPS {$accuracy}m melebihi batas {$accuracyLimit}m");
    }

    $userId = $_SESSION['user_id'];
    $today = date('Y-m-d');

    $stmt = $pdo->prepare("
        SELECT id, status, jam_pulang
        FROM attendance_logs
        WHERE user_id = ? AND tanggal = ?
        LIMIT 1
    ");
    $stmt->execute([$userId, $today]);
    $attendance = $stmt->fetch();

    $activeStatuses = ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'];
    if (!$attendance || !in_array($attendance['status'], $activeStatuses, true)) {
        sendResponse(false, 'Tracking hanya aktif setelah presensi hadir');
    }

    if (!empty($attendance['jam_pulang']) && $attendance['jam_pulang'] !== '00:00:00' && $attendance['jam_pulang'] !== '-') {
        sendResponse(false, 'Tracking sudah berhenti karena guru sudah presensi pulang');
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO location_tracks
                (user_id, attendance_id, tanggal, latitude, longitude, accuracy_meters, source, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $userId,
            $attendance['id'],
            $today,
            (float)$data['latitude'],
            (float)$data['longitude'],
            $accuracy,
            'web',
            substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255)
        ]);

        sendResponse(true, 'Lokasi tracking tersimpan', [
            'id' => $pdo->lastInsertId(),
            'recorded_at' => date('Y-m-d H:i:s')
        ]);
    } catch (PDOException $e) {
        handleError($e, 'location_tracking.php - create');
    }
}

if ($method === 'GET') {
    $role = $_SESSION['role'] ?? '';
    $action = $_GET['action'] ?? 'latest';
    $date = lt_normalize_date($_GET['date'] ?? null);
    $settings = lt_get_settings($pdo);
    $pins = lt_get_geofence_pins($settings);

    if ($action === 'history') {
        $userId = validateInt($_GET['user_id'] ?? null, 1);
        if ($userId === false) {
            sendResponse(false, 'user_id tidak valid');
        }

        if ($role === 'guru' && (int)$userId !== (int)$_SESSION['user_id']) {
            sendResponse(false, 'Forbidden: Anda hanya dapat melihat tracking sendiri');
        }

        $limit = validateInt($_GET['limit'] ?? 300, 1, 1000);
        if ($limit === false) {
            $limit = 300;
        }

        try {
            $stmt = $pdo->prepare("
                SELECT
                    lt.id, lt.user_id, u.nama, lt.tanggal, lt.latitude, lt.longitude,
                    lt.accuracy_meters, lt.source, lt.recorded_at
                FROM location_tracks lt
                JOIN users u ON u.id = lt.user_id
                WHERE lt.user_id = ? AND lt.tanggal = ?
                ORDER BY lt.recorded_at DESC, lt.id DESC
                LIMIT {$limit}
            ");
            $stmt->execute([$userId, $date]);
            sendResponse(true, 'Riwayat tracking lokasi', lt_attach_nearest_pins($stmt->fetchAll(), $pins));
        } catch (PDOException $e) {
            handleError($e, 'location_tracking.php - history');
        }
    }

    if (!in_array($role, ['admin', 'kepala_sekolah'], true)) {
        sendResponse(false, 'Forbidden: Hanya admin/kepala sekolah yang dapat melihat semua tracking');
    }

    try {
        $stmt = $pdo->prepare("
            SELECT
                u.id AS user_id,
                u.id_guru,
                u.nama,
                u.jenis_kelamin,
                a.id AS attendance_id,
                a.status AS attendance_status,
                a.jam_masuk,
                a.jam_pulang,
                lt.id AS track_id,
                lt.latitude,
                lt.longitude,
                lt.accuracy_meters,
                lt.source,
                lt.recorded_at
            FROM users u
            LEFT JOIN attendance_logs a
                ON a.user_id = u.id AND a.tanggal = ?
            LEFT JOIN (
                SELECT t1.*
                FROM location_tracks t1
                JOIN (
                    SELECT user_id, MAX(id) AS max_id
                    FROM location_tracks
                    WHERE tanggal = ?
                    GROUP BY user_id
                ) latest ON latest.max_id = t1.id
            ) lt ON lt.user_id = u.id
            WHERE u.role = 'guru'
              AND u.archived_at IS NULL
            ORDER BY
                CASE WHEN lt.recorded_at IS NULL THEN 1 ELSE 0 END,
                lt.recorded_at DESC,
                u.nama ASC
        ");
        $stmt->execute([$date, $date]);
        sendResponse(true, 'Tracking lokasi terbaru', [
            'date' => $date,
            'settings' => $settings,
            'pins' => $pins,
            'items' => lt_attach_nearest_pins($stmt->fetchAll(), $pins)
        ]);
    } catch (PDOException $e) {
        handleError($e, 'location_tracking.php - latest');
    }
}

sendResponse(false, 'Invalid request method');
?>
