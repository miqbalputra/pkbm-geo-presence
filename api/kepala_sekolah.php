<?php
/**
 * Kelola Akun Kepala Sekolah
 *
 * Endpoint khusus Admin untuk membuat/melihat/mengubah akun Kepala Sekolah.
 * Kepala Sekolah memiliki hak akses yang sama dengan Admin, jadi pembuatan akun
 * ini adalah tindakan setup berprivilege tinggi yang hanya boleh dilakukan Admin.
 *
 *   GET  -> ambil akun Kepala Sekolah saat ini (id, username, nama, email) atau null
 *   POST ?action=save -> buat (bila belum ada) atau perbarui (bila sudah ada):
 *        { passwordLama, username, nama, email, passwordBaru, konfirmasiBaru }
 *
 * Demi keamanan, setiap penyimpanan WAJIB menyertakan password Admin yang sedang
 * login sebagai konfirmasi.
 */

require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];

// Hanya Admin yang login boleh mengelola akun Kepala Sekolah.
requireAuth(['admin']);

/** @var int $currentUserId diambil dari session (Admin) */
$currentUserId = (int) ($_SESSION['user_id'] ?? 0);

if ($currentUserId <= 0) {
    sendResponse(false, 'Sesi tidak valid, silakan login kembali.');
}

/**
 * Ambil satu akun Kepala Sekolah (tanpa password). Bila tidak ada, kembalikan null.
 */
function kepala_sekolah_fetch($pdo)
{
    $stmt = $pdo->prepare("
        SELECT id, username, nama, email, role
        FROM users
        WHERE role = 'kepala_sekolah'
        ORDER BY id ASC
        LIMIT 1
    ");
    $stmt->execute();
    $row = $stmt->fetch();

    if (!$row) {
        return null;
    }

    return [
        'id'       => (int) $row['id'],
        'username' => $row['username'],
        'nama'     => $row['nama'],
        'email'    => $row['email'],
        'role'     => $row['role'],
    ];
}

// -------------------------------------------------------------------------
// GET - Ambil akun Kepala Sekolah saat ini
// -------------------------------------------------------------------------
if ($method === 'GET') {
    try {
        $account = kepala_sekolah_fetch($pdo);
        sendResponse(true, 'Data akun Kepala Sekolah berhasil diambil', $account);
    } catch (PDOException $e) {
        handleError($e, 'kepala_sekolah.php - GET');
    }
}

// -------------------------------------------------------------------------
// POST - Buat / perbarui akun Kepala Sekolah
// -------------------------------------------------------------------------
if ($method === 'POST') {
    $data = getRequestData();
    $action = $_GET['action'] ?? ($data['action'] ?? '');

    if ($action !== 'save') {
        sendResponse(false, 'Aksi tidak valid.');
    }

    $passwordLama   = (string) ($data['passwordLama']   ?? $data['currentPassword'] ?? '');
    $username       = trim((string) ($data['username']  ?? ''));
    $nama           = trim((string) ($data['nama']      ?? ''));
    $email          = trim((string) ($data['email']     ?? ''));
    $passwordBaru   = (string) ($data['passwordBaru']   ?? $data['newPassword'] ?? '');
    $konfirmasiBaru = (string) ($data['konfirmasiBaru'] ?? $data['confirmPassword'] ?? '');

    // Password Admin saat ini WAJIB untuk mengonfirmasi tindakan ini.
    if ($passwordLama === '') {
        sendResponse(false, 'Password Admin saat ini harus diisi untuk mengonfirmasi.');
    }

    // Username & nama wajib diisi (dipakai baik untuk buat maupun update).
    if ($username === '') {
        sendResponse(false, 'Username Kepala Sekolah wajib diisi.');
    }
    if ($nama === '') {
        sendResponse(false, 'Nama Kepala Sekolah wajib diisi.');
    }

    // Validasi format username.
    if (mb_strlen($username) < 3) {
        sendResponse(false, 'Username minimal 3 karakter.');
    }
    if (mb_strlen($username) > 50) {
        sendResponse(false, 'Username maksimal 50 karakter.');
    }
    if (!preg_match('/^[A-Za-z0-9._-]+$/', $username)) {
        sendResponse(false, 'Username hanya boleh berisi huruf, angka, titik, underscore, dan tanda hubung.');
    }

    // Email opsional, tapi bila diisi harus valid.
    if ($email !== '' && !validateEmail($email)) {
        sendResponse(false, 'Format email tidak valid.');
    }

    try {
        // Verifikasi password Admin yang sedang login.
        $stmt = $pdo->prepare("SELECT id, password FROM users WHERE id = ? AND role = 'admin' LIMIT 1");
        $stmt->execute([$currentUserId]);
        $admin = $stmt->fetch();

        if (!$admin || !password_verify($passwordLama, $admin['password'])) {
            securityLog('kepala_sekolah_save_failed', [
                'user_id' => $currentUserId,
                'reason'  => 'wrong_admin_password',
                'ip'      => getClientIP(),
            ]);
            sendResponse(false, 'Password Admin saat ini tidak sesuai.');
        }

        $existing = kepala_sekolah_fetch($pdo);
        $isCreate = $existing === null;

        // Saat membuat akun baru, password WAJIB diisi.
        if ($isCreate && $passwordBaru === '') {
            sendResponse(false, 'Password awal Kepala Sekolah wajib diisi.');
        }

        // Validasi password baru bila diisi.
        if ($passwordBaru !== '') {
            if ($passwordBaru !== $konfirmasiBaru) {
                sendResponse(false, 'Konfirmasi password tidak cocok.');
            }
            $passwordValidation = validatePassword($passwordBaru);
            if ($passwordValidation !== true) {
                sendResponse(false, $passwordValidation);
            }
        }

        // Cek uniquness username terhadap akun lain (selain akun Kepala Sekolah ini).
        $excludeId = $existing ? (int) $existing['id'] : 0;
        $check = $pdo->prepare("SELECT COUNT(*) FROM users WHERE username = ? AND id <> ?");
        $check->execute([$username, $excludeId]);
        if ((int) $check->fetchColumn() > 0) {
            sendResponse(false, 'Username sudah digunakan. Pilih username lain.');
        }

        if ($isCreate) {
            // Buat akun Kepala Sekolah baru.
            $insert = $pdo->prepare("
                INSERT INTO users (username, email, password, role, nama, tipe_guru)
                VALUES (?, ?, ?, 'kepala_sekolah', ?, 'full_time')
            ");
            $insert->execute([
                $username,
                $email !== '' ? $email : null,
                password_hash($passwordBaru, PASSWORD_DEFAULT),
                $nama,
            ]);

            securityLog('kepala_sekolah_created', [
                'by_user_id' => $currentUserId,
                'username'   => $username,
                'ip'         => getClientIP(),
            ]);

            $account = kepala_sekolah_fetch($pdo);
            sendResponse(true, 'Akun Kepala Sekolah berhasil dibuat.', $account);
        } else {
            // Perbarui akun Kepala Sekolah yang sudah ada.
            $updates = [];
            $params  = [];

            $updates[] = 'username = ?';
            $params[]  = $username;

            $updates[] = 'nama = ?';
            $params[]  = $nama;

            $updates[] = 'email = ?';
            $params[]  = ($email !== '' ? $email : null);

            if ($passwordBaru !== '') {
                $updates[] = 'password = ?';
                $params[]  = password_hash($passwordBaru, PASSWORD_DEFAULT);
            }

            $params[] = (int) $existing['id'];
            $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ? AND role = 'kepala_sekolah'";
            $pdo->prepare($sql)->execute($params);

            securityLog('kepala_sekolah_updated', [
                'by_user_id'    => $currentUserId,
                'target_id'     => (int) $existing['id'],
                'changed_pass'  => $passwordBaru !== '',
                'ip'            => getClientIP(),
            ]);

            $account = kepala_sekolah_fetch($pdo);
            sendResponse(true, 'Akun Kepala Sekolah berhasil diperbarui.', $account);
        }
    } catch (PDOException $e) {
        handleError($e, 'kepala_sekolah.php - save');
    }
}

sendResponse(false, 'Invalid request');
?>