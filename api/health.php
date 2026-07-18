<?php
date_default_timezone_set(getenv('APP_TIMEZONE') ?: 'Asia/Jakarta');
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

function healthEnv($key, $default = null)
{
    $value = getenv($key);
    return ($value === false || $value === '') ? $default : $value;
}

function healthResponse($success, $message, $data = null, $statusCode = 200)
{
    http_response_code($statusCode);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    healthResponse(false, 'Invalid request method', null, 405);
}

try {
    $host = healthEnv('DB_HOST', 'mysql');
    $port = healthEnv('DB_PORT', '3306');
    $name = healthEnv('DB_NAME', 'geogqpresence');
    $user = healthEnv('DB_USER', 'geopresensi');
    $pass = healthEnv('DB_PASS', '');
    $dbTz = healthEnv('DB_TIMEZONE', '+07:00');

    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 3
        ]
    );
    $pdo->exec("SET time_zone = " . $pdo->quote($dbTz));

    $stmt = $pdo->query('SELECT 1 AS ok');
    $db = $stmt && (int)($stmt->fetch()['ok'] ?? 0) === 1;

    healthResponse(true, 'OK', [
        'app' => 'geopresensi',
        'runtime' => 'frankenphp',
        'status' => 'healthy',
        'database' => $db ? 'connected' : 'unknown',
        'timezone' => date_default_timezone_get(),
        'time' => date('c')
    ]);
} catch (Throwable $e) {
    $isProduction = healthEnv('APP_ENV', 'production') === 'production';
    healthResponse(false, $isProduction ? 'Healthcheck failed' : $e->getMessage(), [
        'app' => 'geopresensi',
        'runtime' => 'frankenphp',
        'status' => 'unhealthy',
        'database' => 'disconnected',
        'time' => date('c')
    ], 500);
}
?>
