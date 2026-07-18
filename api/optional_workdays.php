<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
requireAuth(['admin', 'kepala_sekolah', 'guru']);

function sendError($message, $code = 400)
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

if ($method === 'GET') {
    try {
        $tanggal = $_GET['tanggal'] ?? null;
        $startDate = $_GET['start_date'] ?? null;
        $endDate = $_GET['end_date'] ?? null;
        $conditions = [];
        $params = [];

        if ($tanggal) {
            if (!validateDate($tanggal)) {
                sendError('Format tanggal tidak valid');
            }
            $conditions[] = 'tanggal = ?';
            $params[] = $tanggal;
        }

        if ($startDate && $endDate) {
            if (!validateDate($startDate) || !validateDate($endDate)) {
                sendError('Format rentang tanggal tidak valid');
            }
            $conditions[] = 'tanggal BETWEEN ? AND ?';
            $params[] = $startDate;
            $params[] = $endDate;
        }

        $where = $conditions ? ('WHERE ' . implode(' AND ', $conditions)) : '';
        $stmt = $pdo->prepare("SELECT id, tanggal, nama, keterangan, created_by, created_at, updated_at FROM optional_workdays {$where} ORDER BY tanggal DESC");
        $stmt->execute($params);
        sendResponse(true, 'Data hari kerja opsional berhasil diambil', $stmt->fetchAll());
    } catch (PDOException $e) {
        handleError($e, 'optional_workdays.php - GET');
    }
}

if ($method === 'POST') {
    $data = getRequestData();
    $tanggal = $data['tanggal'] ?? null;
    $nama = trim($data['nama'] ?? '');
    $keterangan = trim($data['keterangan'] ?? '');

    if (!validateDate($tanggal) || $nama === '') {
        sendError('Tanggal dan nama hari kerja opsional harus diisi');
    }

    try {
        $createdBy = $_SESSION['username'] ?? 'admin';
        $stmt = $pdo->prepare("
            INSERT INTO optional_workdays (tanggal, nama, keterangan, created_by)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                nama = VALUES(nama),
                keterangan = VALUES(keterangan),
                created_by = VALUES(created_by),
                updated_at = NOW()
        ");
        $stmt->execute([$tanggal, $nama, $keterangan, $createdBy]);
        sendResponse(true, 'Hari kerja opsional berhasil disimpan');
    } catch (PDOException $e) {
        handleError($e, 'optional_workdays.php - POST');
    }
}

if ($method === 'PUT') {
    $data = getRequestData();
    $id = validateInt($data['id'] ?? null, 1);
    if ($id === false) {
        sendError('ID tidak valid');
    }
    $nama = isset($data['nama']) ? trim($data['nama']) : null;
    $keterangan = isset($data['keterangan']) ? trim($data['keterangan']) : null;

    try {
        $fields = [];
        $params = [];
        if ($nama !== null && $nama !== '') {
            $fields[] = 'nama = ?';
            $params[] = $nama;
        }
        if ($keterangan !== null) {
            $fields[] = 'keterangan = ?';
            $params[] = $keterangan;
        }
        if (empty($fields)) {
            sendError('Tidak ada field yang diupdate');
        }
        $params[] = $id;
        $sql = "UPDATE optional_workdays SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        sendResponse(true, 'Hari kerja opsional berhasil diperbarui');
    } catch (PDOException $e) {
        handleError($e, 'optional_workdays.php - PUT');
    }
}

if ($method === 'DELETE') {
    $data = getRequestData();
    $id = validateInt($data['id'] ?? null, 1);
    if ($id === false) {
        sendError('ID tidak valid');
    }
    try {
        $stmt = $pdo->prepare("DELETE FROM optional_workdays WHERE id = ?");
        $stmt->execute([$id]);
        sendResponse(true, 'Hari kerja opsional berhasil dihapus');
    } catch (PDOException $e) {
        handleError($e, 'optional_workdays.php - DELETE');
    }
}

sendResponse(false, 'Invalid request method');
