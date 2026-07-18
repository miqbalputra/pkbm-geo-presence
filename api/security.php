<?php
/**
 * Security Helper Functions
 * File ini berisi fungsi-fungsi keamanan untuk API
 */

// ============================================
// AUTHENTICATION & AUTHORIZATION
// ============================================

/**
 * Cek apakah user sudah login dan punya role yang sesuai
 */
function requireAuth($allowedRoles = [])
{
    if (!isset($_SESSION['user_id'])) {
        sendResponse(false, 'Unauthorized: Silakan login terlebih dahulu');
    }

    if (!empty($allowedRoles) && !in_array($_SESSION['role'], $allowedRoles)) {
        securityLog('unauthorized_access', [
            'user_id' => $_SESSION['user_id'],
            'role' => $_SESSION['role'],
            'required_roles' => $allowedRoles,
            'endpoint' => $_SERVER['REQUEST_URI']
        ]);
        sendResponse(false, 'Forbidden: Anda tidak memiliki akses ke resource ini');
    }

    return true;
}

// ============================================
// INPUT VALIDATION & SANITIZATION
// ============================================

/**
 * Sanitasi input untuk mencegah XSS
 */
function sanitizeInput($data)
{
    if (is_array($data)) {
        return array_map('sanitizeInput', $data);
    }
    return htmlspecialchars(strip_tags(trim($data)), ENT_QUOTES, 'UTF-8');
}

/**
 * Validasi email
 */
function validateEmail($email)
{
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * Validasi integer
 */
function validateInt($value, $min = null, $max = null)
{
    $int = filter_var($value, FILTER_VALIDATE_INT);
    if ($int === false) {
        return false;
    }
    if ($min !== null && $int < $min) {
        return false;
    }
    if ($max !== null && $int > $max) {
        return false;
    }
    return $int;
}

/**
 * Validasi tanggal (format: YYYY-MM-DD)
 */
function validateDate($date)
{
    $d = DateTime::createFromFormat('Y-m-d', $date);
    return $d && $d->format('Y-m-d') === $date;
}

/**
 * Validasi koordinat GPS
 */
function validateCoordinates($lat, $lon)
{
    $lat = filter_var($lat, FILTER_VALIDATE_FLOAT);
    $lon = filter_var($lon, FILTER_VALIDATE_FLOAT);

    if ($lat === false || $lon === false) {
        return false;
    }

    if ($lat < -90 || $lat > 90) {
        return false;
    }

    if ($lon < -180 || $lon > 180) {
        return false;
    }

    return true;
}

/**
 * Validasi kekuatan password
 */
function validatePassword($password)
{
    if (strlen($password) < 6) {
        return 'Password minimal 6 karakter';
    }

    // Untuk kemudahan user, tidak enforce huruf besar/kecil/angka
    // Tapi minimal 6 karakter

    return true;
}

// ============================================
// RATE LIMITING
// ============================================

/**
 * Rate limiting untuk mencegah brute force
 */
function checkRateLimit($action, $limit = 5, $window = 300)
{
    $ip = $_SERVER['REMOTE_ADDR'];
    $key = "rate_limit_{$action}_{$ip}";

    if (!isset($_SESSION[$key])) {
        $_SESSION[$key] = ['count' => 0, 'start' => time()];
    }

    $data = $_SESSION[$key];

    // Reset jika window sudah lewat
    if (time() - $data['start'] > $window) {
        $_SESSION[$key] = ['count' => 1, 'start' => time()];
        return true;
    }

    // Cek apakah sudah melebihi limit
    if ($data['count'] >= $limit) {
        $remaining = $window - (time() - $data['start']);
        $minutes = ceil($remaining / 60);

        securityLog('rate_limit_exceeded', [
            'action' => $action,
            'ip' => $ip,
            'attempts' => $data['count']
        ]);

        sendResponse(false, "Terlalu banyak percobaan. Silakan coba lagi dalam {$minutes} menit.");
    }

    $_SESSION[$key]['count']++;
    return true;
}

// ============================================
// CSRF PROTECTION
// ============================================

/**
 * Generate CSRF token
 */
function generateCSRFToken()
{
    if (!isset($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Verify CSRF token
 */
function verifyCSRFToken($token)
{
    if (!isset($_SESSION['csrf_token']) || empty($token)) {
        securityLog('csrf_token_missing', [
            'endpoint' => $_SERVER['REQUEST_URI']
        ]);
        sendResponse(false, 'Invalid security token');
    }

    if (!hash_equals($_SESSION['csrf_token'], $token)) {
        securityLog('csrf_token_invalid', [
            'endpoint' => $_SERVER['REQUEST_URI']
        ]);
        sendResponse(false, 'Invalid security token');
    }

    return true;
}

// ============================================
// SECURITY LOGGING
// ============================================

/**
 * Log security events
 */
function securityLog($event, $details = [])
{
    $log = [
        'timestamp' => date('Y-m-d H:i:s'),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
        'user_id' => $_SESSION['user_id'] ?? null,
        'username' => $_SESSION['username'] ?? null,
        'event' => $event,
        'details' => $details
    ];

    // Log ke file
    $logDir = dirname(__DIR__) . '/logs';
    if (!file_exists($logDir)) {
        @mkdir($logDir, 0755, true);
    }

    $logFile = $logDir . '/security_' . date('Y-m-d') . '.log';
    @file_put_contents($logFile, json_encode($log) . PHP_EOL, FILE_APPEND);

    // Untuk event kritis, bisa kirim email/notifikasi
    $criticalEvents = ['unauthorized_access', 'rate_limit_exceeded', 'sql_injection_attempt'];
    if (in_array($event, $criticalEvents)) {
        // TODO: Kirim notifikasi ke admin
        // mail('admin@sistemflow.biz.id', 'Security Alert', json_encode($log));
    }
}

// ============================================
// CORS CONFIGURATION
// ============================================

/**
 * Setup CORS dengan domain spesifik
 */
function setupCORS($custom_origin = null)
{
    $allowed_origins = [
        'https://geo.pkbmtunasilmu.web.id',   // Domain utama PKBM Tunas Ilmu
        'http://localhost:5173', // Untuk development
        'http://localhost:3000'  // Untuk development
    ];

    // Jika ada custom origin (dari config.php berdasarkan env APP_URL/CORS_ALLOWED_ORIGINS), gunakan itu
    if ($custom_origin) {
        $allowed_origins[] = $custom_origin;
    }

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if (in_array($origin, $allowed_origins)) {
        header("Access-Control-Allow-Origin: $origin");
    } elseif ($custom_origin) {
        // Default ke origin dari env (bukan domain hardcode)
        header("Access-Control-Allow-Origin: $custom_origin");
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
    header('Access-Control-Allow-Credentials: true');
    header('Content-Type: application/json; charset=UTF-8');
}

// ============================================
// ERROR HANDLING
// ============================================

/**
 * Handle error dengan aman (tidak expose detail di production)
 */
function handleError($e, $context = '')
{
    // Log error
    error_log("Error in {$context}: " . $e->getMessage());

    securityLog('error', [
        'context' => $context,
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);

    // Di production, jangan expose detail error (ditentukan oleh env APP_ENV, bukan host hardcode)
    $isProduction = defined('APP_ENV') && APP_ENV === 'production';

    if ($isProduction) {
        sendResponse(false, 'Terjadi kesalahan. Silakan coba lagi atau hubungi administrator.');
    } else {
        // Di development, tampilkan detail error
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// ============================================
// SESSION SECURITY
// ============================================

/**
 * Setup secure session
 */
function setupSecureSession()
{
    // Cek apakah menggunakan HTTPS
    $isHTTPS = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || $_SERVER['SERVER_PORT'] == 443
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

    // Create a dedicated session directory to prevent GC from other apps
    $sessionPath = dirname(__DIR__) . '/sessions';
    if (!file_exists($sessionPath)) {
        @mkdir($sessionPath, 0755, true);
    }
    if (is_writable($sessionPath)) {
        session_save_path($sessionPath);
    }

    // Set session lifetime (30 hari)
    $oneMonth = 30 * 24 * 60 * 60;
    
    // Session configuration
    ini_set('session.gc_maxlifetime', $oneMonth);
    ini_set('session.cookie_lifetime', $oneMonth);
    ini_set('session.cookie_httponly', 1);
    ini_set('session.use_only_cookies', 1);
    ini_set('session.cookie_samesite', 'Lax');

    // Hanya set secure flag jika menggunakan HTTPS
    if ($isHTTPS) {
        ini_set('session.cookie_secure', 1);
    }

    // Session name yang unik
    session_name('GEOPRESENSI_SESSION');

    // Start session jika belum
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    // Regenerate session ID untuk mencegah session fixation (hanya sekali)
    if (!isset($_SESSION['initiated'])) {
        session_regenerate_id(true);
        $_SESSION['initiated'] = true;
        $_SESSION['created_at'] = time();
    }

    // Cek session timeout berbasis ROLE
    // Admin/Kepala Sekolah: 2 jam inaktivitas
    // Guru: 30 hari
    if (isset($_SESSION['role'])) {
        $role = $_SESSION['role'];
        $timeout = ($role === 'admin' || $role === 'kepala_sekolah') ? 7200 : (30 * 24 * 60 * 60);

        if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity'] > $timeout)) {
            $isRestoreRequest = strpos($_SERVER['REQUEST_URI'] ?? '', 'auth.php?action=restore') !== false;
            session_unset();
            @session_destroy();
            @session_start();
            if (!$isRestoreRequest) {
                sendResponse(false, 'Sesi berakhir karena inaktivitas. Silakan login kembali.');
            }
        }
    }

    $_SESSION['last_activity'] = time();
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get client IP address
 */
function getClientIP()
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    // Cek jika ada proxy
    if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
        $ip = $_SERVER['HTTP_CLIENT_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ip = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0];
    }

    return $ip;
}

/**
 * Check if request is from localhost
 */
function isLocalhost()
{
    $ip = getClientIP();
    return in_array($ip, ['127.0.0.1', '::1', 'localhost']);
}

?>
