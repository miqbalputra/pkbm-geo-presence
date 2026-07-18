<?php
date_default_timezone_set(getenv('APP_TIMEZONE') ?: 'Asia/Jakarta');

function envValue($key, $default = null)
{
    $value = getenv($key);
    return ($value === false || $value === '') ? $default : $value;
}

$httpHost = $_SERVER['HTTP_HOST'] ?? '';
$isLocalhost = in_array($httpHost, ['localhost', '127.0.0.1', 'geopresensi.test']) ||
    strpos($httpHost, 'localhost:') === 0 ||
    strpos($httpHost, '127.0.0.1:') === 0 ||
    strpos($httpHost, '.test') !== false ||
    ($_SERVER['SERVER_NAME'] ?? '') === 'localhost';

define('APP_ENV', envValue('APP_ENV', $isLocalhost ? 'local' : 'production'));
// Default produksi mengikuti konfigurasi deploy PKBM (lihat env_deploy.md).
// PENTING: env DB_HOST/DB_NAME/DB_USER/DB_PASS wajib di-set di Coolify; default
// di sini hanya mencegah fallback ke nilai legacy lama (geogqpresence/geopresensi).
define('DB_HOST', envValue('DB_HOST', $isLocalhost ? 'localhost' : 'mariadb'));
define('DB_NAME', envValue('DB_NAME', $isLocalhost ? 'geopresensi' : 'pkbm_presence'));
define('DB_USER', envValue('DB_USER', $isLocalhost ? 'root' : 'pkbm_user'));
define('DB_PASS', envValue('DB_PASS', $isLocalhost ? '' : ''));
define('DB_PORT', envValue('DB_PORT', '3306'));
define('DB_TIMEZONE', envValue('DB_TIMEZONE', '+07:00'));

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_filter(array_map('trim', explode(',', envValue('CORS_ALLOWED_ORIGINS', ''))));
$appUrl = rtrim(envValue('APP_URL', ''), '/');

if ($origin && (strpos($origin, 'http://localhost') === 0 || strpos($origin, 'https://localhost') === 0)) {
    $corsOrigin = $origin;
} elseif ($origin && in_array($origin, $allowedOrigins, true)) {
    $corsOrigin = $origin;
} elseif ($appUrl !== '') {
    $corsOrigin = $appUrl;
} else {
    $corsOrigin = $isLocalhost ? 'http://localhost:5173' : 'https://' . $httpHost;
}

// Load security functions
require_once __DIR__ . '/security.php';

// Setup secure session
setupSecureSession();

// Setup CORS
setupCORS($corsOrigin);

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database Connection
try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4",
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
    $pdo->exec("SET time_zone = " . $pdo->quote(DB_TIMEZONE));
} catch (PDOException $e) {
    http_response_code(500);
    $isProduction = APP_ENV === 'production';
    echo json_encode([
        'success' => false,
        'message' => $isProduction ? 'Database connection failed' : 'Database connection failed: ' . $e->getMessage()
    ]);
    exit();
}

// Helper Functions
function sendResponse($success, $message, $data = null)
{
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit();
}

function getRequestData()
{
    $data = json_decode(file_get_contents('php://input'), true);
    return $data;
}

function requireApiKey($envKey = 'N8N_API_KEY')
{
    $expectedKey = envValue($envKey, '');
    $requestKey = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? '';

    if ($expectedKey === '' || !hash_equals($expectedKey, $requestKey)) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Unauthorized: Invalid API Key'
        ]);
        exit();
    }
}

function requireAnyApiKey($envKeys = ['N8N_API_KEY'])
{
    $requestKey = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? '';

    foreach ($envKeys as $envKey) {
        $expectedKey = envValue($envKey, '');
        if ($expectedKey !== '' && hash_equals($expectedKey, $requestKey)) {
            return;
        }
    }

    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Unauthorized: Invalid API Key'
    ]);
    exit();
}
?>
