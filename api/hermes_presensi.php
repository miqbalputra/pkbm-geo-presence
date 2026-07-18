<?php
/**
 * API endpoint Hermes Agent untuk melihat, menambah, dan mengedit data presensi.
 * Auth menggunakan HERMES_API_KEY, fallback ke N8N_API_KEY jika belum dipisah.
 */

require_once 'config.php';
require_once 'attendance_service.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

requireAnyApiKey(['HERMES_API_KEY', 'N8N_API_KEY']);

function hermes_attendance_get_value($data, $camelKey, $snakeKey = null, $default = null)
{
    if (is_array($data) && array_key_exists($camelKey, $data)) {
        return $data[$camelKey];
    }

    if ($snakeKey !== null && is_array($data) && array_key_exists($snakeKey, $data)) {
        return $data[$snakeKey];
    }

    return $default;
}

function hermes_attendance_normalize_time($value, $allowNull = true)
{
    if ($value === null || $value === '') {
        return $allowNull ? null : false;
    }

    if ($value === '-') {
        return $allowNull ? null : false;
    }

    $value = trim((string)$value);
    if (preg_match('/^\d{2}:\d{2}$/', $value)) {
        $value .= ':00';
    }

    if (!preg_match('/^\d{2}:\d{2}:\d{2}$/', $value)) {
        return false;
    }

    [$hour, $minute, $second] = array_map('intval', explode(':', $value));
    if ($hour > 23 || $minute > 59 || $second > 59) {
        return false;
    }

    return $value;
}

function hermes_attendance_validate_status($status)
{
    return in_array($status, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat', 'izin', 'sakit'], true);
}

function hermes_attendance_get_guru($pdo, $userId)
{
    $stmt = $pdo->prepare("
        SELECT id, nama
        FROM users
        WHERE id = ? AND role = 'guru'
        LIMIT 1
    ");
    $stmt->execute([$userId]);
    return $stmt->fetch();
}

function hermes_attendance_build_payload($data, $existing = null)
{
    $status = hermes_attendance_get_value($data, 'status', 'status', $existing['status'] ?? 'hadir');
    if (!hermes_attendance_validate_status($status)) {
        sendResponse(false, 'Status presensi tidak valid');
    }

    $tanggal = hermes_attendance_get_value($data, 'tanggal', 'tanggal', $existing['tanggal'] ?? date('Y-m-d'));
    if (!validateDate($tanggal)) {
        sendResponse(false, 'Format tanggal tidak valid');
    }

    $jamMasuk = hermes_attendance_normalize_time(
        hermes_attendance_get_value($data, 'jamMasuk', 'jam_masuk', $existing['jam_masuk'] ?? null)
    );
    $jamPulang = hermes_attendance_normalize_time(
        hermes_attendance_get_value($data, 'jamPulang', 'jam_pulang', $existing['jam_pulang'] ?? null)
    );
    $jamHadir = hermes_attendance_normalize_time(
        hermes_attendance_get_value($data, 'jamHadir', 'jam_hadir', $existing['jam_hadir'] ?? null)
    );
    $jamIzin = hermes_attendance_normalize_time(
        hermes_attendance_get_value($data, 'jamIzin', 'jam_izin', $existing['jam_izin'] ?? null)
    );
    $jamSakit = hermes_attendance_normalize_time(
        hermes_attendance_get_value($data, 'jamSakit', 'jam_sakit', $existing['jam_sakit'] ?? null)
    );

    foreach ([
        'jamMasuk' => $jamMasuk,
        'jamPulang' => $jamPulang,
        'jamHadir' => $jamHadir,
        'jamIzin' => $jamIzin,
        'jamSakit' => $jamSakit
    ] as $label => $time) {
        if ($time === false) {
            sendResponse(false, "Format {$label} tidak valid");
        }
    }

    $isHadir = in_array($status, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true);

    if (!$isHadir) {
        $jamMasuk = null;
        $jamHadir = null;
        $jamPulang = null;
    } else {
        $jamMasuk = $jamMasuk ?: date('H:i:s');
        $jamHadir = $jamHadir ?: $jamMasuk;
        $jamIzin = null;
        $jamSakit = null;
    }

    if ($status === 'izin') {
        $jamIzin = $jamIzin ?: date('H:i:s');
        $jamSakit = null;
    } elseif ($status === 'sakit') {
        $jamSakit = $jamSakit ?: date('H:i:s');
        $jamIzin = null;
    }

    $latitude = hermes_attendance_get_value($data, 'latitude', 'latitude', $existing['latitude'] ?? null);
    $longitude = hermes_attendance_get_value($data, 'longitude', 'longitude', $existing['longitude'] ?? null);

    if (($latitude !== null && $latitude !== '') || ($longitude !== null && $longitude !== '')) {
        if (!validateCoordinates($latitude, $longitude)) {
            sendResponse(false, 'Koordinat GPS tidak valid');
        }
    } else {
        $latitude = null;
        $longitude = null;
    }

    $metode = hermes_attendance_get_value($data, 'metode', 'metode', $existing['metode'] ?? 'manual');
    if (!in_array($metode, ['button', 'qr_scan', 'manual'], true)) {
        sendResponse(false, 'Metode presensi tidak valid');
    }

    return [
        'tanggal' => $tanggal,
        'status' => $status,
        'jam_masuk' => $jamMasuk,
        'jam_pulang' => $jamPulang,
        'jam_hadir' => $jamHadir,
        'jam_izin' => $jamIzin,
        'jam_sakit' => $jamSakit,
        'keterangan' => hermes_attendance_get_value($data, 'keterangan', 'keterangan', $existing['keterangan'] ?? ''),
        'latitude' => $latitude,
        'longitude' => $longitude,
        'metode' => $metode
    ];
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    try {
        $query = "
            SELECT id, user_id, nama, tanggal, status, jam_masuk, jam_pulang, jam_hadir,
                   jam_izin, jam_sakit, keterangan, latitude, longitude, metode, created_at, updated_at
            FROM attendance_logs
            WHERE 1=1
        ";
        $params = [];

        if (isset($_GET['id'])) {
            $id = validateInt($_GET['id'], 1);
            if ($id === false) {
                sendResponse(false, 'Invalid id');
            }
            $query .= " AND id = ?";
            $params[] = $id;
        }

        if (isset($_GET['user_id'])) {
            $userId = validateInt($_GET['user_id'], 1);
            if ($userId === false) {
                sendResponse(false, 'Invalid user_id');
            }
            $query .= " AND user_id = ?";
            $params[] = $userId;
        }

        if (isset($_GET['tanggal'])) {
            if (!validateDate($_GET['tanggal'])) {
                sendResponse(false, 'Invalid date format');
            }
            $query .= " AND tanggal = ?";
            $params[] = $_GET['tanggal'];
        }

        if (isset($_GET['start_date']) || isset($_GET['end_date'])) {
            $startDate = $_GET['start_date'] ?? $_GET['end_date'];
            $endDate = $_GET['end_date'] ?? $startDate;
            if (!validateDate($startDate) || !validateDate($endDate) || $startDate > $endDate) {
                sendResponse(false, 'Invalid date range');
            }
            $query .= " AND tanggal BETWEEN ? AND ?";
            $params[] = $startDate;
            $params[] = $endDate;
        }

        if (isset($_GET['status'])) {
            if (!hermes_attendance_validate_status($_GET['status'])) {
                sendResponse(false, 'Invalid status');
            }
            $query .= " AND status = ?";
            $params[] = $_GET['status'];
        }

        $query .= " ORDER BY tanggal DESC, id DESC";

        $limit = $_GET['limit'] ?? null;
        if ($limit !== null && strtolower((string)$limit) !== 'all') {
            $limitValue = validateInt($limit, 1, 10000);
            if ($limitValue === false) {
                sendResponse(false, 'Invalid limit');
            }
            $offset = validateInt($_GET['offset'] ?? 0, 0);
            if ($offset === false) {
                sendResponse(false, 'Invalid offset');
            }
            $query .= " LIMIT {$limitValue} OFFSET {$offset}";
        }

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $logs = $stmt->fetchAll();

        foreach ($logs as &$log) {
            $log = gp_map_attendance_record($log);
        }
        unset($log);

        sendResponse(true, 'Data presensi Hermes berhasil diambil', [
            'total' => count($logs),
            'items' => $logs
        ]);
    } catch (PDOException $e) {
        handleError($e, 'hermes_presensi.php - get');
    }
}

if ($method === 'POST') {
    $data = getRequestData();

    try {
        $userId = hermes_attendance_get_value($data, 'userId', 'user_id');
        $userId = validateInt($userId, 1);
        if ($userId === false) {
            sendResponse(false, 'userId harus diisi dan valid');
        }

        $guru = hermes_attendance_get_guru($pdo, $userId);
        if (!$guru) {
            sendResponse(false, 'Guru tidak ditemukan');
        }

        $payload = hermes_attendance_build_payload($data);

        $checkStmt = $pdo->prepare("SELECT id FROM attendance_logs WHERE user_id = ? AND tanggal = ? LIMIT 1");
        $checkStmt->execute([$userId, $payload['tanggal']]);
        if ($checkStmt->fetch()) {
            sendResponse(false, 'Guru sudah memiliki presensi pada tanggal tersebut');
        }

        $stmt = $pdo->prepare("
            INSERT INTO attendance_logs
            (user_id, nama, tanggal, status, jam_masuk, jam_pulang, jam_hadir,
             jam_izin, jam_sakit, keterangan, latitude, longitude, metode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $userId,
            $guru['nama'],
            $payload['tanggal'],
            $payload['status'],
            $payload['jam_masuk'],
            $payload['jam_pulang'],
            $payload['jam_hadir'],
            $payload['jam_izin'],
            $payload['jam_sakit'],
            $payload['keterangan'],
            $payload['latitude'],
            $payload['longitude'],
            $payload['metode'] ?: 'manual'
        ]);

        $newId = (int)$pdo->lastInsertId();
        gp_write_activity($pdo, 'Hermes Agent', 'Tambah Presensi Hermes', $guru['nama'] . ' - ' . $payload['status']);

        sendResponse(true, 'Presensi berhasil ditambahkan oleh Hermes', [
            'attendance' => gp_get_attendance_by_id($pdo, $newId)
        ]);
    } catch (PDOException $e) {
        handleError($e, 'hermes_presensi.php - post');
    }
}

if ($method === 'PUT') {
    $data = getRequestData();

    try {
        $id = hermes_attendance_get_value($data, 'id', 'id');
        $id = validateInt($id, 1);
        if ($id === false) {
            sendResponse(false, 'ID presensi harus diisi dan valid');
        }

        $stmt = $pdo->prepare("SELECT * FROM attendance_logs WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            sendResponse(false, 'Data presensi tidak ditemukan');
        }

        $newUserId = hermes_attendance_get_value($data, 'userId', 'user_id', $existing['user_id']);
        $newUserId = validateInt($newUserId, 1);
        if ($newUserId === false) {
            sendResponse(false, 'userId tidak valid');
        }

        $guru = hermes_attendance_get_guru($pdo, $newUserId);
        if (!$guru) {
            sendResponse(false, 'Guru tidak ditemukan');
        }

        $payload = hermes_attendance_build_payload($data, $existing);

        $checkStmt = $pdo->prepare("
            SELECT id
            FROM attendance_logs
            WHERE user_id = ? AND tanggal = ? AND id != ?
            LIMIT 1
        ");
        $checkStmt->execute([$newUserId, $payload['tanggal'], $id]);
        if ($checkStmt->fetch()) {
            sendResponse(false, 'Guru sudah memiliki presensi lain pada tanggal tersebut');
        }

        $stmt = $pdo->prepare("
            UPDATE attendance_logs
            SET user_id = ?,
                nama = ?,
                tanggal = ?,
                status = ?,
                jam_masuk = ?,
                jam_pulang = ?,
                jam_hadir = ?,
                jam_izin = ?,
                jam_sakit = ?,
                keterangan = ?,
                latitude = ?,
                longitude = ?,
                metode = ?,
                updated_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([
            $newUserId,
            $guru['nama'],
            $payload['tanggal'],
            $payload['status'],
            $payload['jam_masuk'],
            $payload['jam_pulang'],
            $payload['jam_hadir'],
            $payload['jam_izin'],
            $payload['jam_sakit'],
            $payload['keterangan'],
            $payload['latitude'],
            $payload['longitude'],
            $payload['metode'] ?: 'manual',
            $id
        ]);

        gp_write_activity($pdo, 'Hermes Agent', 'Edit Presensi Hermes', $guru['nama'] . ' - ' . $payload['status']);

        sendResponse(true, 'Presensi berhasil diedit oleh Hermes', [
            'attendance' => gp_get_attendance_by_id($pdo, $id)
        ]);
    } catch (PDOException $e) {
        handleError($e, 'hermes_presensi.php - put');
    }
}

sendResponse(false, 'Invalid request method');
?>
