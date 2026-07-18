<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

function auth_map_user($user)
{
    if (!$user) {
        return null;
    }

    if (!empty($user['jabatan']) && is_string($user['jabatan'])) {
        $decoded = json_decode($user['jabatan'], true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $user['jabatan'] = $decoded;
        }
    }

    unset($user['password']);
    return $user;
}

function auth_set_session($user)
{
    session_regenerate_id(true);

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['role'] = $user['role'];
    $_SESSION['login_time'] = time();
    $_SESSION['last_activity'] = time();
    $_SESSION['user'] = $user;
}

/**
 * Cek apakah guru sudah diarsipkan. Jika ya, tolak login/pulihkan sesi
 * dan cabut semua remember token yang masih aktif.
 */
function auth_reject_if_archived($pdo, $user)
{
    if ($user && ($user['role'] ?? '') === 'guru' && !empty($user['archived_at'])) {
        // Cabut token 30-hari agar tidak bisa dipakai lagi
        try {
            $pdo->prepare("UPDATE remember_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL")
                ->execute([$user['id']]);
        } catch (PDOException $e) { /* abaikan */ }

        securityLog('archived_guru_login_blocked', [
            'user_id'  => $user['id'],
            'username' => $user['username'],
            'role'     => $user['role'],
        ]);
        sendResponse(false, 'Akun Anda sudah diarsipkan. Silakan hubungi admin sekolah.');
    }
}

function auth_create_remember_token($pdo, $userId)
{
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);

    try {
        $pdo->prepare("DELETE FROM remember_tokens WHERE expires_at < NOW() OR revoked_at IS NOT NULL")->execute();
        $stmt = $pdo->prepare("
            INSERT INTO remember_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), ?, ?)
        ");
        $stmt->execute([
            $userId,
            $hash,
            substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
            substr(getClientIP(), 0, 45)
        ]);
    } catch (PDOException $e) {
        handleError($e, 'auth.php - remember token');
    }

    return $token;
}

// LOGIN
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'login') {
    // Rate limiting: 5 attempts per 5 minutes
    checkRateLimit('login', 5, 300);
    
    $data = getRequestData();
    $username = $data['username'] ?? '';
    $password = $data['password'] ?? '';

    if (empty($username) || empty($password)) {
        sendResponse(false, 'Username dan password harus diisi');
    }

    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password'])) {
            // Tolak guru yang sudah diarsipkan
            auth_reject_if_archived($pdo, $user);

            auth_set_session($user);

            // Log successful login
            securityLog('login_success', [
                'user_id' => $user['id'],
                'username' => $user['username'],
                'role' => $user['role']
            ]);

            $responseUser = auth_map_user($user);
            if ($user['role'] === 'guru') {
                $responseUser['rememberToken'] = auth_create_remember_token($pdo, $user['id']);
                $responseUser['rememberExpiresAt'] = date('Y-m-d H:i:s', time() + (30 * 24 * 60 * 60));
            }

            sendResponse(true, 'Login berhasil', $responseUser);
        } else {
            // Log failed login
            securityLog('login_failed', [
                'username' => $username,
                'ip' => getClientIP()
            ]);
            
            sendResponse(false, 'Username atau password salah');
        }
    } catch (PDOException $e) {
        handleError($e, 'auth.php - login');
    }
}

// LOGIN WITH GOOGLE (Sign in with Google - One Tap / button credential)
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'google_login') {
    $data = getRequestData();
    $credential = $data['credential'] ?? '';

    if (!is_string($credential) || $credential === '') {
        sendResponse(false, 'Token Google tidak ditemukan.');
    }

    $clientId = envValue('GOOGLE_CLIENT_ID', '');
    if ($clientId === '') {
        sendResponse(false, 'Login Google belum dikonfigurasi di server.');
    }

    // Verifikasi ID Token Google melalui endpoint tokeninfo Google
    $verifyUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential);
    $ch = curl_init($verifyUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    curl_close($ch);

    if ($errno !== 0 || $raw === false) {
        sendResponse(false, 'Gagal memverifikasi token Google. Coba lagi.');
    }

    $payload = json_decode($raw, true);
    if (!is_array($payload) || empty($payload['sub']) || empty($payload['email'])) {
        sendResponse(false, 'Token Google tidak valid.');
    }

    // Pastikan token benar-benar untuk Client ID kita
    $aud = $payload['aud'] ?? '';
    if (!is_string($aud) || !hash_equals($clientId, $aud)) {
        securityLog('google_aud_mismatch', [
            'expected' => $clientId,
            'got'      => $aud,
            'ip'       => getClientIP(),
        ]);
        sendResponse(false, 'Token Google tidak cocok dengan aplikasi ini.');
    }

    // Hanya terima email yang sudah diverifikasi Google
    if (empty($payload['email_verified'])) {
        sendResponse(false, 'Email Google belum terverifikasi.');
    }

    $googleId = $payload['sub'];
    $email    = strtolower(trim($payload['email']));

    try {
        // 1. Cari user berdasarkan google_id (sudah pernah ter-link)
        $stmt = $pdo->prepare("SELECT * FROM users WHERE google_id = ? LIMIT 1");
        $stmt->execute([$googleId]);
        $user = $stmt->fetch();

        // 2. Bila belum, cari berdasarkan email yang sama
        if (!$user) {
            $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1");
            $stmt->execute([$email]);
            $user = $stmt->fetch();

            // Link google_id ke akun yang ditemukan
            if ($user) {
                $link = $pdo->prepare("UPDATE users SET google_id = ? WHERE id = ?");
                $link->execute([$googleId, $user['id']]);
            }
        }

        if (!$user) {
            // Akun belum terdaftar. Tolak agar admin membuat akun + isi email dulu.
            securityLog('google_no_account', ['email' => $email, 'ip' => getClientIP()]);
            sendResponse(false, 'Akun dengan email ' . $email . ' belum terdaftar. Hubungi admin.');
        }

        // Hanya izinkan guru & kepala_sekolah login via Google
        if (!in_array($user['role'], ['guru', 'kepala_sekolah'], true)) {
            sendResponse(false, 'Login Google tidak didukung untuk role ini.');
        }

        // Tolak guru yang sudah diarsipkan
        auth_reject_if_archived($pdo, $user);

        auth_set_session($user);

        securityLog('google_login_success', [
            'user_id'  => $user['id'],
            'username' => $user['username'],
            'role'     => $user['role'],
            'email'    => $email,
        ]);

        $responseUser = auth_map_user($user);
        if ($user['role'] === 'guru') {
            $responseUser['rememberToken'] = auth_create_remember_token($pdo, $user['id']);
            $responseUser['rememberExpiresAt'] = date('Y-m-d H:i:s', time() + (30 * 24 * 60 * 60));
        }
        $responseUser['loginProvider'] = 'google';

        sendResponse(true, 'Login Google berhasil', $responseUser);
    } catch (PDOException $e) {
        handleError($e, 'auth.php - google_login');
    }
}

// RESTORE GURU SESSION FROM 30-DAY TOKEN
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'restore') {
    $data = getRequestData();
    $token = $data['rememberToken'] ?? '';

    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        sendResponse(false, 'Token login tidak valid');
    }

    try {
        $stmt = $pdo->prepare("
            SELECT u.*
            FROM remember_tokens rt
            JOIN users u ON u.id = rt.user_id
            WHERE rt.token_hash = ?
              AND rt.expires_at > NOW()
              AND rt.revoked_at IS NULL
              AND u.role = 'guru'
            LIMIT 1
        ");
        $stmt->execute([hash('sha256', $token)]);
        $user = $stmt->fetch();

        if (!$user) {
            sendResponse(false, 'Token login sudah tidak berlaku');
        }

        // Tolak guru yang sudah diarsipkan (token lama sebelum diarsipkan)
        auth_reject_if_archived($pdo, $user);

        auth_set_session($user);

        $update = $pdo->prepare("UPDATE remember_tokens SET last_used_at = NOW() WHERE token_hash = ?");
        $update->execute([hash('sha256', $token)]);

        $responseUser = auth_map_user($user);
        $responseUser['rememberToken'] = $token;

        sendResponse(true, 'Session guru dipulihkan', $responseUser);
    } catch (PDOException $e) {
        handleError($e, 'auth.php - restore');
    }
}

// LOGOUT
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'logout') {
    // Log logout
    if (isset($_SESSION['user_id'])) {
        securityLog('logout', [
            'user_id' => $_SESSION['user_id'],
            'username' => $_SESSION['username']
        ]);
    }
    
    session_unset();
    session_destroy();
    sendResponse(true, 'Logout berhasil');
}

// CHECK SESSION
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'check') {
    if (isset($_SESSION['user_id'])) {
        sendResponse(true, 'Session active', [
            'id' => $_SESSION['user_id'],
            'user_id' => $_SESSION['user_id'],
            'username' => $_SESSION['username'],
            'role' => $_SESSION['role'],
            'nama' => $_SESSION['user']['nama'] ?? ($_SESSION['nama'] ?? null)
        ]);
    } else {
        sendResponse(false, 'No active session');
    }
}

sendResponse(false, 'Invalid request');
?>
