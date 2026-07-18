<?php
require_once 'config.php';
require_once 'workday_service.php';

$method = $_SERVER['REQUEST_METHOD'];

// Semua endpoint memerlukan autentikasi admin
requireAuth(['admin', 'kepala_sekolah']);

function sendError($message, $code = 400)
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}

// GET: Ambil override untuk satu guru atau semua guru di rentang tanggal
if ($method === 'GET') {
    try {
        $userId = isset($_GET['user_id']) ? validateInt($_GET['user_id'], 1) : null;
        $startDate = $_GET['start_date'] ?? date('Y-m-01');
        $endDate = $_GET['end_date'] ?? date('Y-m-d');

        if (!validateDate($startDate) || !validateDate($endDate)) {
            sendError('Format tanggal tidak valid');
        }

        $params = [$startDate, $endDate];
        $where = "tanggal BETWEEN ? AND ?";

        if ($userId !== null && $userId !== false) {
            $where .= " AND user_id = ?";
            $params[] = $userId;
        }

        $stmt = $pdo->prepare("
            SELECT o.id, o.user_id, o.tanggal, o.is_workday, o.keterangan, o.created_by, o.created_at,
                   u.nama AS nama_guru, u.jenis_kelamin
            FROM user_weekend_overrides o
            JOIN users u ON u.id = o.user_id
            WHERE {$where}
            ORDER BY o.tanggal DESC, u.nama ASC
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        sendResponse(true, 'Data override weekend berhasil diambil', $rows);
    } catch (PDOException $e) {
        handleError($e, 'weekend_overrides.php - GET');
    }
}

// POST: Buat override baru (bisa massal untuk banyak user)
if ($method === 'POST') {
    $data = getRequestData();

    if (empty($data) || !is_array($data)) {
        sendError('Payload harus berupa array override');
    }

    // Bisa menerima satu objek atau array objek
    $items = isset($data[0]) ? $data : [$data];

    try {
        $createdBy = $_SESSION['username'] ?? 'admin';
        $inserted = 0;
        $updated = 0;

        $insertStmt = $pdo->prepare("
            INSERT INTO user_weekend_overrides (user_id, tanggal, is_workday, keterangan, created_by)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                is_workday = VALUES(is_workday),
                keterangan = VALUES(keterangan),
                created_by = VALUES(created_by),
                updated_at = NOW()
        ");

        $pdo->beginTransaction();

        foreach ($items as $item) {
            $userId = validateInt($item['user_id'] ?? null, 1);
            $tanggal = $item['tanggal'] ?? null;
            $isWorkday = isset($item['is_workday']) ? (int)$item['is_workday'] : 1;
            $keterangan = trim($item['keterangan'] ?? '');

            // Mode bulk by gender: jika ada apply_to_gender, expand ke semua guru gender tersebut
            $applyToGender = $item['apply_to_gender'] ?? null;
            if ($applyToGender) {
                $genderValues = is_array($applyToGender) ? $applyToGender : [$applyToGender];
                $normalizedGenders = [];
                foreach ($genderValues as $g) {
                    $g = strtolower(trim((string)$g));
                    if ($g === 'laki-laki' || $g === 'laki laki' || $g === 'male') {
                        $normalizedGenders[] = 'Laki-laki';
                    } elseif ($g === 'perempuan' || $g === 'female') {
                        $normalizedGenders[] = 'Perempuan';
                    }
                }
                if (empty($normalizedGenders) || !validateDate($tanggal)) {
                    $pdo->rollBack();
                    sendError('Data tidak valid: gender (Laki-laki/Perempuan) dan tanggal harus diisi dengan benar');
                }
                $placeholders = implode(',', array_fill(0, count($normalizedGenders), '?'));
                $userStmt = $pdo->prepare("
                    SELECT id FROM users
                    WHERE jenis_kelamin IN ({$placeholders}) AND (role = 'guru' OR role = 'kepala_sekolah')
                      AND archived_at IS NULL
                ");
                $userStmt->execute($normalizedGenders);
                foreach ($userStmt->fetchAll() as $u) {
                    $insertStmt->execute([(int)$u['id'], $tanggal, $isWorkday ? 1 : 0, $keterangan, $createdBy]);
                    if ($insertStmt->rowCount() > 0) {
                        if ($pdo->lastInsertId() > 0) {
                            $inserted++;
                        } else {
                            $updated++;
                        }
                    }
                }
                continue;
            }

            if ($userId === false || !validateDate($tanggal)) {
                $pdo->rollBack();
                sendError('Data tidak valid: user_id dan tanggal (YYYY-MM-DD) harus diisi dengan benar');
            }

            // Hanya boleh override untuk hari Sabtu (6) atau Minggu (0)
            $dayOfWeek = (int)date('w', strtotime($tanggal));
            if ($dayOfWeek !== 0 && $dayOfWeek !== 6) {
                $pdo->rollBack();
                sendError('Override hanya diperbolehkan untuk hari Sabtu atau Minggu');
            }

            $insertStmt->execute([$userId, $tanggal, $isWorkday ? 1 : 0, $keterangan, $createdBy]);

            if ($insertStmt->rowCount() > 0) {
                if ($pdo->lastInsertId() > 0) {
                    $inserted++;
                } else {
                    $updated++;
                }
            }
        }

        $pdo->commit();

        sendResponse(true, "Override berhasil disimpan ({$inserted} baru, {$updated} diperbarui)");
    } catch (PDOException $e) {
        $pdo->rollBack();
        handleError($e, 'weekend_overrides.php - POST');
    }
}

// PUT: Update satu override
if ($method === 'PUT') {
    $data = getRequestData();

    $id = validateInt($data['id'] ?? null, 1);
    if ($id === false) {
        sendError('ID override tidak valid');
    }

    try {
        $isWorkday = isset($data['is_workday']) ? ((int)$data['is_workday'] ? 1 : 0) : null;
        $keterangan = isset($data['keterangan']) ? trim($data['keterangan']) : null;

        $fields = [];
        $params = [];

        if ($isWorkday !== null) {
            $fields[] = "is_workday = ?";
            $params[] = $isWorkday;
        }
        if ($keterangan !== null) {
            $fields[] = "keterangan = ?";
            $params[] = $keterangan;
        }

        if (empty($fields)) {
            sendError('Tidak ada field yang diupdate');
        }

        $params[] = $id;
        $sql = "UPDATE user_weekend_overrides SET " . implode(', ', $fields) . ", updated_at = NOW() WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        sendResponse(true, 'Override berhasil diperbarui');
    } catch (PDOException $e) {
        handleError($e, 'weekend_overrides.php - PUT');
    }
}

// DELETE: Hapus override (bisa massal)
if ($method === 'DELETE') {
    $data = getRequestData();

    $id = isset($data['id']) ? validateInt($data['id'], 1) : null;
    $userId = isset($data['user_id']) ? validateInt($data['user_id'], 1) : null;
    $tanggal = $data['tanggal'] ?? null;

    try {
        if ($id !== null && $id !== false) {
            $stmt = $pdo->prepare("DELETE FROM user_weekend_overrides WHERE id = ?");
            $stmt->execute([$id]);
        } elseif ($userId !== null && $userId !== false && validateDate($tanggal)) {
            $stmt = $pdo->prepare("DELETE FROM user_weekend_overrides WHERE user_id = ? AND tanggal = ?");
            $stmt->execute([$userId, $tanggal]);
        } else {
            sendError('ID atau kombinasi user_id + tanggal harus diisi');
        }

        sendResponse(true, 'Override berhasil dihapus');
    } catch (PDOException $e) {
        handleError($e, 'weekend_overrides.php - DELETE');
    }
}

sendResponse(false, 'Invalid request method');
