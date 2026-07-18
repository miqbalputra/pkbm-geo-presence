<?php
/**
 * Admin Account Self-Service Endpoint
 *
 * Mengizinkan admin yang sedang login untuk:
 *   - Melihat info akunnya sendiri           (GET)
 *   - Mengubah username dan/atau password     (POST ?action=change_credentials)
 *
 * Demi keamanan, setiap perubahan kredensial WAJIB menyertakan password lama
 * yang valid. Perubahan langsung tersimpan ke tabel `users`.
 */

require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

// Admin & Kepala Sekolah yang login boleh mengakses endpoint ini
// (Kepala Sekolah memiliki hak akses yang sama dengan Admin).
requireAuth(['admin', 'kepala_sekolah']);

/** @var int $currentUserId diambil dari session */
$currentUserId = (int) ($_SESSION['user_id'] ?? 0);

if ($currentUserId <= 0) {
    sendResponse(false, 'Sesi tidak valid, silakan login kembali.');
}

// -------------------------------------------------------------------------
// GET - Ambil info akun admin sendiri (tanpa password)
// -------------------------------------------------------------------------
if ($method === 'GET') {
    try {
        $stmt = $pdo->prepare("
            SELECT id, username, nama, email, role
            FROM users
            WHERE id = ? AND role IN ('admin', 'kepala_sekolah')
            LIMIT 1
        ");
        $stmt->execute([$currentUserId]);
        $admin = $stmt->fetch();

        if (!$admin) {
            sendResponse(false, 'Data akun tidak ditemukan.');
        }

        $account = [
            'id'       => (int) $admin['id'],
            'username' => $admin['username'],
            'nama'     => $admin['nama'],
            'email'    => $admin['email'],
            'role'     => $admin['role'],
        ];

        sendResponse(true, 'Data akun berhasil diambil', $account);
    } catch (PDOException $e) {
        handleError($e, 'admin_profile.php - GET');
    }
}

// -------------------------------------------------------------------------
// POST - Ubah username dan/atau password admin sendiri
// -------------------------------------------------------------------------
if ($method === 'POST') {
    $data = getRequestData();
    $action = $_GET['action'] ?? ($data['action'] ?? '');

    if ($action !== 'change_credentials') {
        sendResponse(false, 'Aksi tidak valid.');
    }

    $passwordLama   = (string) ($data['passwordLama']   ?? $data['currentPassword'] ?? '');
    $usernameBaru   = trim((string) ($data['usernameBaru'] ?? $data['newUsername'] ?? ''));
    $passwordBaru   = (string) ($data['passwordBaru']   ?? $data['newPassword'] ?? '');
    $konfirmasiBaru = (string) ($data['konfirmasiBaru'] ?? $data['confirmPassword'] ?? '');

    // Password lama WAJIB diisi untuk setiap perubahan kredensial.
    if ($passwordLama === '') {
        sendResponse(false, 'Password saat ini harus diisi untuk mengonfirmasi perubahan.');
    }

    // Minimal harus ada satu perubahan (username atau password).
    if ($usernameBaru === '' && $passwordBaru === '') {
        sendResponse(false, 'Tidak ada perubahan. Isi username baru atau password baru.');
    }

    try {
        // Ambil data admin saat ini (termasuk hash password) untuk verifikasi.
        $stmt = $pdo->prepare("SELECT id, username, password FROM users WHERE id = ? AND role IN ('admin', 'kepala_sekolah') LIMIT 1");
        $stmt->execute([$currentUserId]);
        $row = $stmt->fetch();

        if (!$row) {
            sendResponse(false, 'Data admin tidak ditemukan.');
        }

        // Verifikasi password lama.
        if (!password_verify($passwordLama, $row['password'])) {
            securityLog('admin_credential_change_failed', [
                'user_id' => $currentUserId,
                'reason'  => 'wrong_current_password',
                'ip'      => getClientIP(),
            ]);
            sendResponse(false, 'Password saat ini tidak sesuai.');
        }

        $updates = [];
        $params  = [];
        $changed = [];

        // --- Ubah username (jika diisi dan berbeda) ---
        if ($usernameBaru !== '' && $usernameBaru !== $row['username']) {
            // Validasi panjang & karakter username
            if (mb_strlen($usernameBaru) < 3) {
                sendResponse(false, 'Username baru minimal 3 karakter.');
            }
            if (mb_strlen($usernameBaru) > 50) {
                sendResponse(false, 'Username baru maksimal 50 karakter.');
            }
            if (!preg_match('/^[A-Za-z0-9._-]+$/', $usernameBaru)) {
                sendResponse(false, 'Username hanya boleh berisi huruf, angka, titik, underscore, dan tanda hubung.');
            }

            // Cek apakah username sudah dipakai akun lain.
            $check = $pdo->prepare("SELECT COUNT(*) FROM users WHERE username = ? AND id <> ?");
            $check->execute([$usernameBaru, $currentUserId]);
            if ((int) $check->fetchColumn() > 0) {
                sendResponse(false, 'Username sudah digunakan. Pilih username lain.');
            }

            $updates[] = 'username = ?';
            $params[]  = $usernameBaru;
            $changed[] = 'username';
        }

        // --- Ubah password (jika diisi) ---
        if ($passwordBaru !== '') {
            if ($passwordBaru !== $konfirmasiBaru) {
                sendResponse(false, 'Konfirmasi password baru tidak cocok.');
            }

            // Validasi kekuatan password (reuse helper security.php)
            $passwordValidation = validatePassword($passwordBaru);
            if ($passwordValidation !== true) {
                sendResponse(false, $passwordValidation);
            }

            // Password baru tidak boleh sama dengan password lama.
            if (password_verify($passwordBaru, $row['password'])) {
                sendResponse(false, 'Password baru tidak boleh sama dengan password saat ini.');
            }

            $updates[] = 'password = ?';
            $params[]  = password_hash($passwordBaru, PASSWORD_DEFAULT);
            $changed[] = 'password';
        }

        // Jika tidak ada perubahan efektif (username sama persis & password kosong).
        if (empty($updates)) {
            sendResponse(false, 'Tidak ada perubahan yang berbeda dari data saat ini.');
        }

        $params[] = $currentUserId;
        $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ? AND role IN ('admin', 'kepala_sekolah')";
        $update = $pdo->prepare($sql);
        $update->execute($params);

        // Sinkronkan session jika username berubah.
        if (in_array('username', $changed, true)) {
            $_SESSION['username'] = $usernameBaru;
            if (isset($_SESSION['user']) && is_array($_SESSION['user'])) {
                $_SESSION['user']['username'] = $usernameBaru;
            }
        }

        securityLog('admin_credential_change_success', [
            'user_id' => $currentUserId,
            'changed' => $changed,
            'ip'      => getClientIP(),
        ]);

        // Ambil data terbaru untuk dikirim balik.
        $fresh = $pdo->prepare("SELECT id, username, nama, email, role FROM users WHERE id = ? LIMIT 1");
        $fresh->execute([$currentUserId]);
        $admin = $fresh->fetch();

        $account = [
            'id'       => (int) $admin['id'],
            'username' => $admin['username'],
            'nama'     => $admin['nama'],
            'email'    => $admin['email'],
            'role'     => $admin['role'],
        ];

        $msgParts = [];
        if (in_array('username', $changed, true)) $msgParts[] = 'username';
        if (in_array('password', $changed, true)) $msgParts[] = 'password';
        $message = ucfirst(implode(' dan ', $msgParts)) . ' berhasil diubah.';

        sendResponse(true, $message, $account);
    } catch (PDOException $e) {
        handleError($e, 'admin_profile.php - change_credentials');
    }
}

sendResponse(false, 'Invalid request');
?>