<?php
/**
 * API endpoint koneksi Hermes Agent.
 * Dipakai untuk memastikan API key valid, database tersambung, dan endpoint Hermes siap digunakan.
 */

require_once 'config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, 'Invalid request method');
}

requireAnyApiKey(['HERMES_API_KEY', 'N8N_API_KEY']);

function hermes_connect_base_url()
{
    $appUrl = rtrim(envValue('APP_URL', ''), '/');
    if ($appUrl !== '') {
        return $appUrl;
    }

    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['SERVER_PORT'] ?? null) == 443
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

    $scheme = $isHttps ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';

    return $scheme . '://' . $host;
}

try {
    $started = microtime(true);
    $stmt = $pdo->query('SELECT 1 AS ok');
    $dbOk = (int)($stmt->fetch()['ok'] ?? 0) === 1;
    $latencyMs = round((microtime(true) - $started) * 1000, 2);

    $baseUrl = hermes_connect_base_url();
    $apiBase = $baseUrl . '/api';

    sendResponse(true, 'Koneksi Hermes berhasil', [
        'service' => 'PKBM Tunas Ilmu Hermes API',
        'status' => 'ready',
        'generatedAt' => date('c'),
        'timezone' => date_default_timezone_get(),
        'database' => [
            'connected' => $dbOk,
            'latencyMs' => $latencyMs
        ],
        'auth' => [
            'type' => 'api_key',
            'header' => 'X-API-Key',
            'acceptedEnvKeys' => ['HERMES_API_KEY', 'N8N_API_KEY']
        ],
        'capabilities' => [
            'read_all_attendance' => true,
            'create_attendance' => true,
            'update_attendance' => true,
            'delete_attendance' => false,
            'overview_summary' => true
        ],
        'endpoints' => [
            'connection' => [
                'method' => 'GET',
                'url' => $apiBase . '/hermes_connect.php'
            ],
            'overview' => [
                'method' => 'GET',
                'url' => $apiBase . '/hermes_presensi_overview.php',
                'params' => ['period', 'start_date', 'end_date', 'user_id', 'include_logs', 'limit']
            ],
            'attendance_list' => [
                'method' => 'GET',
                'url' => $apiBase . '/hermes_presensi.php',
                'params' => ['id', 'user_id', 'tanggal', 'start_date', 'end_date', 'status', 'limit', 'offset']
            ],
            'attendance_create' => [
                'method' => 'POST',
                'url' => $apiBase . '/hermes_presensi.php'
            ],
            'attendance_update' => [
                'method' => 'PUT',
                'url' => $apiBase . '/hermes_presensi.php'
            ]
        ],
        'payloadFields' => [
            'id',
            'userId',
            'user_id',
            'tanggal',
            'status',
            'jamMasuk',
            'jam_masuk',
            'jamPulang',
            'jam_pulang',
            'jamHadir',
            'jam_hadir',
            'jamIzin',
            'jam_izin',
            'jamSakit',
            'jam_sakit',
            'keterangan',
            'latitude',
            'longitude',
            'metode'
        ],
        'validStatus' => ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat', 'izin', 'sakit'],
        'validMetode' => ['button', 'qr_scan', 'manual']
    ]);
} catch (PDOException $e) {
    handleError($e, 'hermes_connect.php');
}
?>
