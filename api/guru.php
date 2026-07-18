<?php
require_once 'config.php';
require_once 'attendance_service.php';

$method = $_SERVER['REQUEST_METHOD'];

// Helper: map row users (snake_case) -> camelCase + parse jabatan + hapus password
function gp_map_guru(&$g, $includeSignature = false)
{
    if ($g['jabatan']) {
        $g['jabatan'] = json_decode($g['jabatan'], true);
    }
    // Convert snake_case to camelCase for frontend
    $g['idGuru'] = $g['id_guru'];
    $g['noHP'] = $g['no_hp'];
    $g['jenisKelamin'] = $g['jenis_kelamin'];
    $g['tanggalBertugas'] = $g['tanggal_bertugas'];
    $g['tanggalLahir'] = $g['tanggal_lahir'];
    $g['tipeGuru'] = $g['tipe_guru'];
    $g['piketGroup'] = $g['piket_group'] ?? null;
    $g['pokjar'] = $g['pokjar'] ?? null;
    $g['punyaTandaTangan'] = !empty($g['tanda_tangan']);
    // Tanda tangan base64 hanya dikirim saat GET by-id (payload besar);
    // daftar guru cukup flag punyaTandaTangan.
    if ($includeSignature && !empty($g['tanda_tangan'])) {
        $g['tandaTangan'] = $g['tanda_tangan'];
    }
    unset($g['tanda_tangan'], $g['password']); // Hapus field berat & password dari response
}

/**
 * Validasi & normalisasi penugasan Pokjar.
 * Nilai valid: '' (kosong/null), 'Lentera Qalbu', 'Umar bin Khattab', 'Nashirus Sunnah'.
 * Catatan: berbeda dari piket_group, nilai pokjar multi-kata jadi TIDAK pakai strtoupper.
 * Mengembalikan string pokjar atau null. Mengirim response error & exit bila invalid.
 */
function gp_normalize_pokjar($value)
{
    $pokjar = trim((string)($value ?? ''));
    if ($pokjar !== '' && !in_array($pokjar, ['Lentera Qalbu', 'Umar bin Khattab', 'Nashirus Sunnah'], true)) {
        sendResponse(false, 'Pokjar tidak valid. Pilih salah satu dari 3 Pokjar atau kosongkan.');
    }
    return $pokjar !== '' ? $pokjar : null;
}

// ARCHIVE / UNARCHIVE GURU - Hanya Admin (soft-archive, data presensi tetap utuh)
if ($method === 'POST' && isset($_GET['action']) && in_array($_GET['action'], ['archive', 'unarchive'], true)) {
    requireAuth(['admin', 'kepala_sekolah']);
    $action = $_GET['action'];
    $data = getRequestData();
    $id = isset($data['id']) ? validateInt($data['id'], 1) : null;

    if (!$id) {
        sendResponse(false, 'ID guru harus diisi');
    }

    try {
        // Pastikan target benar-benar guru
        $stmt = $pdo->prepare("SELECT id, nama, archived_at FROM users WHERE id = ? AND role = 'guru'");
        $stmt->execute([$id]);
        $guru = $stmt->fetch();

        if (!$guru) {
            sendResponse(false, 'Guru tidak ditemukan');
        }

        if ($action === 'archive') {
            if (!empty($guru['archived_at'])) {
                sendResponse(false, 'Guru sudah berada di arsip');
            }
            $reason = trim($data['reason'] ?? '');
            $upd = $pdo->prepare("UPDATE users SET archived_at = NOW(), archive_reason = ? WHERE id = ?");
            $upd->execute([$reason ?: null, $id]);
            gp_write_activity($pdo, $_SESSION['nama'] ?? 'Admin', 'Arsip Guru', $guru['nama']);
            sendResponse(true, 'Guru berhasil diarsipkan. Data presensi tetap tersimpan.');
        } else { // unarchive
            if (empty($guru['archived_at'])) {
                sendResponse(false, 'Guru tidak berada di arsip');
            }
            $upd = $pdo->prepare("UPDATE users SET archived_at = NULL, archive_reason = NULL WHERE id = ?");
            $upd->execute([$id]);
            gp_write_activity($pdo, $_SESSION['nama'] ?? 'Admin', 'Pulihkan Guru', $guru['nama']);
            sendResponse(true, 'Guru berhasil dipulihkan dari arsip');
        }
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// GET ALL GURU - Admin dan Guru bisa akses
if ($method === 'GET' && !isset($_GET['id'])) {
    requireAuth(['admin', 'guru']);
    try {
        $showArchivedOnly = isset($_GET['archived']) && $_GET['archived'] == '1';
        $includeArchived = isset($_GET['include_archived']) && $_GET['include_archived'] == '1';

        if ($showArchivedOnly) {
            $sql = "SELECT * FROM users WHERE role = 'guru' AND archived_at IS NOT NULL ORDER BY archived_at DESC, id";
            $stmt = $pdo->query($sql);
        } elseif ($includeArchived) {
            $stmt = $pdo->query("SELECT * FROM users WHERE role = 'guru' ORDER BY archived_at IS NOT NULL, id");
        } else {
            // Default: hanya guru aktif
            $stmt = $pdo->query("SELECT * FROM users WHERE role = 'guru' AND archived_at IS NULL ORDER BY id");
        }
        $guru = $stmt->fetchAll();
        
        foreach ($guru as &$g) {
            gp_map_guru($g);
        }
        unset($g);
        
        sendResponse(true, 'Data guru berhasil diambil', $guru);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// GET GURU BY ID - Admin dan Guru bisa akses
if ($method === 'GET' && isset($_GET['id'])) {
    requireAuth(['admin', 'guru']);
    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND role = 'guru'");
        $stmt->execute([$_GET['id']]);
        $guru = $stmt->fetch();
        
        if ($guru) {
            gp_map_guru($guru, true);
            sendResponse(true, 'Data guru ditemukan', $guru);
        } else {
            sendResponse(false, 'Guru tidak ditemukan');
        }
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// CREATE GURU - Hanya Admin
if ($method === 'POST') {
    requireAuth(['admin', 'kepala_sekolah']);
    $data = getRequestData();
    
    try {
        // Validasi data
        if (empty($data['idGuru']) || empty($data['username']) || empty($data['password'])) {
            sendResponse(false, 'ID Guru, Username, dan Password harus diisi');
        }
        
        // Validasi password strength
        $passwordValidation = validatePassword($data['password']);
        if ($passwordValidation !== true) {
            sendResponse(false, $passwordValidation);
        }
        
        // Cek apakah id_guru atau username sudah ada
        $stmt = $pdo->prepare("SELECT id FROM users WHERE id_guru = ? OR username = ?");
        $stmt->execute([$data['idGuru'], $data['username']]);
        if ($stmt->fetch()) {
            sendResponse(false, 'ID Guru atau Username sudah digunakan');
        }
        
        // Encode jabatan ke JSON
        $jabatan = json_encode($data['jabatan']);
        $hashedPassword = password_hash($data['password'], PASSWORD_DEFAULT);

        // Validasi & normalisasi grup piket (A / B / null)
        $piketGroup = strtoupper(trim($data['piketGroup'] ?? ''));
        if ($piketGroup !== '' && !in_array($piketGroup, ['A', 'B'], true)) {
            sendResponse(false, 'Grup piket harus A, B, atau kosong');
        }
        $piketGroup = $piketGroup !== '' ? $piketGroup : null;

        // Validasi & normalisasi penugasan Pokjar (3 pilihan atau null)
        $pokjar = gp_normalize_pokjar($data['pokjar'] ?? '');

        $stmt = $pdo->prepare("
            INSERT INTO users (id_guru, username, password, role, nama, tanggal_lahir, jenis_kelamin, alamat, no_hp, jabatan, tanggal_bertugas, tipe_guru, piket_group, pokjar)
            VALUES (?, ?, ?, 'guru', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            $data['idGuru'],
            $data['username'],
            $hashedPassword,
            $data['nama'],
            $data['tanggalLahir'] ?? null,
            $data['jenisKelamin'],
            $data['alamat'],
            $data['noHP'],
            $jabatan,
            $data['tanggalBertugas'],
            $data['tipeGuru'] ?? 'full_time',
            $piketGroup,
            $pokjar
        ]);
        
        sendResponse(true, 'Guru berhasil ditambahkan', ['id' => $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        // Handle duplicate entry error
        if ($e->getCode() == 23000) {
            sendResponse(false, 'ID Guru atau Username sudah digunakan');
        } else {
            sendResponse(false, 'Error: ' . $e->getMessage());
        }
    }
}

// UPDATE GURU - Hanya Admin
if ($method === 'PUT') {
    requireAuth(['admin', 'kepala_sekolah']);
    $data = getRequestData();
    
    try {
        // Validasi data
        if (empty($data['id'])) {
            sendResponse(false, 'ID guru harus diisi');
        }
        
        $jabatan = json_encode($data['jabatan']);

        // Validasi & normalisasi grup piket (A / B / null)
        $piketGroup = strtoupper(trim($data['piketGroup'] ?? ''));
        if ($piketGroup !== '' && !in_array($piketGroup, ['A', 'B'], true)) {
            sendResponse(false, 'Grup piket harus A, B, atau kosong');
        }
        $piketGroup = $piketGroup !== '' ? $piketGroup : null;

        // Validasi & normalisasi penugasan Pokjar (3 pilihan atau null)
        $pokjar = gp_normalize_pokjar($data['pokjar'] ?? '');

        // Cek apakah id_guru atau username sudah digunakan oleh guru lain
        $stmt = $pdo->prepare("SELECT id FROM users WHERE (id_guru = ? OR username = ?) AND id != ?");
        $stmt->execute([$data['idGuru'], $data['username'], $data['id']]);
        if ($stmt->fetch()) {
            sendResponse(false, 'ID Guru atau Username sudah digunakan oleh guru lain');
        }

        // Jika password diisi, update password
        if (!empty($data['password'])) {
            // Validasi password strength
            $passwordValidation = validatePassword($data['password']);
            if ($passwordValidation !== true) {
                sendResponse(false, $passwordValidation);
            }

            $hashedPassword = password_hash($data['password'], PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("
                UPDATE users SET
                    id_guru = ?, username = ?, password = ?, nama = ?,
                    tanggal_lahir = ?, jenis_kelamin = ?, alamat = ?, no_hp = ?,
                    jabatan = ?, tanggal_bertugas = ?, tipe_guru = ?, piket_group = ?, pokjar = ?
                WHERE id = ?
            ");
            $result = $stmt->execute([
                $data['idGuru'],
                $data['username'],
                $hashedPassword,
                $data['nama'],
                $data['tanggalLahir'] ?? null,
                $data['jenisKelamin'],
                $data['alamat'],
                $data['noHP'],
                $jabatan,
                $data['tanggalBertugas'],
                $data['tipeGuru'] ?? 'full_time',
                $piketGroup,
                $pokjar,
                $data['id']
            ]);
        } else {
            // Update tanpa password
            $stmt = $pdo->prepare("
                UPDATE users SET
                    id_guru = ?, username = ?, nama = ?,
                    tanggal_lahir = ?, jenis_kelamin = ?, alamat = ?, no_hp = ?,
                    jabatan = ?, tanggal_bertugas = ?, tipe_guru = ?, piket_group = ?, pokjar = ?
                WHERE id = ?
            ");
            $result = $stmt->execute([
                $data['idGuru'],
                $data['username'],
                $data['nama'],
                $data['tanggalLahir'] ?? null,
                $data['jenisKelamin'],
                $data['alamat'],
                $data['noHP'],
                $jabatan,
                $data['tanggalBertugas'],
                $data['tipeGuru'] ?? 'full_time',
                $piketGroup,
                $pokjar,
                $data['id']
            ]);
        }
        
        if ($result) {
            sendResponse(true, 'Guru berhasil diupdate');
        } else {
            sendResponse(false, 'Gagal update data guru');
        }
    } catch (PDOException $e) {
        // Handle duplicate entry error
        if ($e->getCode() == 23000) {
            sendResponse(false, 'ID Guru atau Username sudah digunakan');
        } else {
            sendResponse(false, 'Error: ' . $e->getMessage());
        }
    }
}

// DELETE GURU - Hanya Admin
if ($method === 'DELETE') {
    requireAuth(['admin', 'kepala_sekolah']);
    $id = $_GET['id'] ?? null;
    
    if (!$id) {
        sendResponse(false, 'ID guru harus diisi');
    }
    
    try {
        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ? AND role = 'guru'");
        $stmt->execute([$id]);
        
        sendResponse(true, 'Guru berhasil dihapus');
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

sendResponse(false, 'Invalid request');
?>
