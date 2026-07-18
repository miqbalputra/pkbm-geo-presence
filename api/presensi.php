<?php
require_once 'config.php';
require_once 'attendance_service.php';

// Semua role yang valid bisa akses endpoint ini (filtering per-role dilakukan di dalam)
requireAuth(['admin', 'kepala_sekolah', 'guru']);

$method = $_SERVER['REQUEST_METHOD'];

// Kontrol akses per method:
// - GET     : semua role (admin, kepala_sekolah, guru)
// - PUT     : admin dan guru (guru hanya untuk presensi pulang milik sendiri)
// - POST    : hanya admin dan guru
// - DELETE  : hanya admin
$role = $_SESSION['role'] ?? '';
if ($method === 'POST' && !in_array($role, ['admin', 'guru'])) {
    sendResponse(false, 'Forbidden: Anda tidak memiliki akses untuk menambah data presensi');
}
if ($method === 'DELETE' && $role !== 'admin') {
    sendResponse(false, 'Forbidden: Hanya admin yang dapat menghapus data presensi');
}
if ($method === 'PUT' && !in_array($role, ['admin', 'guru'])) {
    sendResponse(false, 'Forbidden: Anda tidak memiliki akses untuk mengubah data presensi');
}

// GET ALL PRESENSI (dengan filter optional)
if ($method === 'GET' && !isset($_GET['id'])) {
    try {
        $query = "SELECT * FROM attendance_logs WHERE 1=1";
        $params = [];

        // SECURITY: Guru hanya bisa lihat data sendiri
        // KECUALI: jika status_rekan=1 → boleh lihat semua presensi HARI INI saja (untuk fitur Status Rekan)
        $currentRole   = $_SESSION['role'] ?? '';
        $currentUserId = $_SESSION['user_id'] ?? null;

        if ($currentRole === 'guru') {
            $isStatusRekan = isset($_GET['status_rekan']) && $_GET['status_rekan'] == '1';
            if ($isStatusRekan) {
                $today    = date('Y-m-d');
                $query   .= " AND tanggal = ?";
                $params[] = $today;
            } else {
                $query   .= " AND user_id = ?";
                $params[] = $currentUserId;
            }
        } elseif (isset($_GET['user_id'])) {
            $user_id = validateInt($_GET['user_id'], 1);
            if ($user_id === false) {
                sendResponse(false, 'Invalid user_id');
            }
            $query   .= " AND user_id = ?";
            $params[] = $user_id;
        }

        // Filter by tanggal
        if (isset($_GET['tanggal'])) {
            if (!validateDate($_GET['tanggal'])) {
                sendResponse(false, 'Invalid date format');
            }
            $query   .= " AND tanggal = ?";
            $params[] = $_GET['tanggal'];
        }

        // Filter by date range
        if (isset($_GET['start_date']) && isset($_GET['end_date'])) {
            if (!validateDate($_GET['start_date']) || !validateDate($_GET['end_date'])) {
                sendResponse(false, 'Invalid date format');
            }
            $query   .= " AND tanggal BETWEEN ? AND ?";
            $params[] = $_GET['start_date'];
            $params[] = $_GET['end_date'];
        }

        $query .= " ORDER BY tanggal DESC, id DESC";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $logs = $stmt->fetchAll();

        // Convert snake_case to camelCase for frontend
        foreach ($logs as &$log) {
            $log = gp_map_attendance_record($log);
        }

        sendResponse(true, 'Data presensi berhasil diambil', $logs);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// CREATE PRESENSI
if ($method === 'POST') {
    $data = getRequestData();

    if ($_SESSION['role'] === 'guru') {
        $data['userId'] = $_SESSION['user_id'];
    }

    try {
        if (empty($data['userId'])) {
            sendResponse(false, 'User presensi harus diisi');
        }

        $user = gp_get_guru($pdo, $data['userId']);
        if (!$user) {
            sendResponse(false, 'Data guru tidak ditemukan');
        }

        $status = $data['status'] ?? 'hadir';
        if (!in_array($status, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat', 'izin', 'sakit'], true)) {
            sendResponse(false, 'Status presensi tidak valid');
        }

        $requiresLocation = in_array($status, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true);
        if ($requiresLocation
            && isset($data['latitude']) && isset($data['longitude'])
            && !validateCoordinates($data['latitude'], $data['longitude'])) {
            sendResponse(false, 'Koordinat GPS tidak valid');
        }

        $attendance = gp_create_attendance($pdo, [
            'user' => $user,
            'date' => $data['tanggal'] ?? date('Y-m-d'),
            'time' => !empty($data['jamMasuk']) ? $data['jamMasuk'] : date('H:i:s'),
            'status' => $status,
            'keterangan' => $data['keterangan'] ?? '',
            'jam_izin' => $data['jamIzin'] ?? null,
            'jam_sakit' => $data['jamSakit'] ?? null,
            'latitude' => $requiresLocation ? ($data['latitude'] ?? null) : null,
            'longitude' => $requiresLocation ? ($data['longitude'] ?? null) : null,
            'method' => 'manual',
            'preserve_status' => ($_SESSION['role'] ?? '') === 'admin'
        ]);

        sendResponse(true, 'Presensi berhasil disimpan', [
            'id' => $attendance['id'],
            'attendance' => $attendance
        ]);
    } catch (PDOException $e) {
        handleError($e, 'presensi.php - create');
    }
}

// UPDATE PRESENSI
if ($method === 'PUT') {
    $data = getRequestData();

    if (empty($data['id'])) {
        sendResponse(false, 'ID presensi harus diisi');
    }

    // Pastikan kolom status bisa menerima semua nilai (expand ENUM jika perlu)
    try {
        $pdo->exec("ALTER TABLE attendance_logs MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'hadir'");
    } catch (Exception $e) { /* abaikan jika sudah VARCHAR */ }

    // Ambil record yang sudah ada
    try {
        $stmt_ex = $pdo->prepare("SELECT * FROM attendance_logs WHERE id = ?");
        $stmt_ex->execute([intval($data['id'])]);
        $rec = $stmt_ex->fetch();
        if (!$rec) {
            sendResponse(false, 'Data presensi tidak ditemukan (id=' . intval($data['id']) . ')');
        }
    } catch (PDOException $e) {
        sendResponse(false, 'Error DB: ' . $e->getMessage());
    }

    // SECURITY: Guru hanya bisa update data sendiri
    if ($_SESSION['role'] === 'guru') {
        if ($rec['user_id'] != $_SESSION['user_id']) {
            sendResponse(false, 'Forbidden: Anda hanya dapat mengubah data presensi Anda sendiri');
        }

        if (!empty($data['jamPulang'])) {
            $jp = trim($data['jamPulang']);
            if (strlen($jp) === 5) {
                $jp .= ':00';
            }

            $attendance = gp_checkout_attendance($pdo, [
                'record' => $rec,
                'time' => $jp,
                'izin_pulang_awal' => !empty($data['izin_pulang_awal']),
                'keterangan' => $data['keterangan'] ?? '',
                'method' => 'manual',
                'latitude' => $data['latitude'] ?? null,
                'longitude' => $data['longitude'] ?? null,
                'lokasi_pulang' => $data['lokasi_pulang'] ?? null,
                'validate_location' => true
            ]);

            sendResponse(true, 'Presensi berhasil diupdate', [
                'attendance' => $attendance
            ]);
        }
    }

    $isAdmin     = ($_SESSION['role'] === 'admin');
    $isGuru      = ($_SESSION['role'] === 'guru');
    $status      = !empty($data['status']) ? $data['status'] : $rec['status'];
    $isHadir     = in_array($status, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat']);
    $todayDate   = date('Y-m-d');
    $isPastDate  = ($rec['tanggal'] < $todayDate);
    $isTodayDate = ($rec['tanggal'] === $todayDate);

    try {
        // --- JAM MASUK ---
        if ($isHadir) {
            if (!empty($data['jamMasuk'])) {
                $jm = trim($data['jamMasuk']);
                if (strlen($jm) === 5) $jm .= ':00'; // HH:MM -> HH:MM:SS
                $jamMasukToSave = $jm;
            } else {
                // Pertahankan jam masuk yang sudah ada, atau pakai waktu sekarang jika kosong
                $jamMasukToSave = !empty($rec['jam_masuk']) && $rec['jam_masuk'] !== '-'
                    ? $rec['jam_masuk']
                    : date('H:i:s');
            }
        } else {
            $jamMasukToSave = '-';
        }

        // --- JAM PULANG ---
        // Aturan dasar: pertahankan jam pulang yang sudah ada
        $jamPulangToSave = $rec['jam_pulang'];

        if (!$isHadir) {
            // Non-hadir status → hapus jam pulang
            $jamPulangToSave = null;
        } elseif ($isPastDate) {
            // Tanggal lampau: admin bebas ubah jam pulang
            if (!empty($data['jamPulang'])) {
                $jp = trim($data['jamPulang']);
                if (strlen($jp) === 5) $jp .= ':00';
                $jamPulangToSave = $jp;
            }
            // Jika payload jamPulang kosong → pertahankan yang ada (tidak diubah)
        } elseif ($isTodayDate) {
            // Hari ini: cek jam pulang berdasarkan rotasi piket (gp_get_piket).
            // Bila guru piket hari ini, pakai jam_pulang_piket dari setting rotasi;
            // selain itu pakai default 13:00.
            $jamPulangTarget = '13:00:00';
            $piket = gp_get_piket($pdo, (int)$rec['user_id'], date('Y-m-d'));
            if ($piket && !empty($piket['jam_pulang_piket'])) {
                $jp = substr($piket['jam_pulang_piket'], 0, 5);
                $jamPulangTarget = strlen($jp) === 5 ? $jp . ':00' : $jp;
            }

            $nowTime       = date('H:i:s');
            $belumWaktunya = ($nowTime < $jamPulangTarget);

            if ($belumWaktunya) {
                // Belum waktunya pulang
                // Pertahankan jam pulang yang sudah ada; jika belum ada → tetap null
                $existing = $rec['jam_pulang'];
                if (empty($existing) || $existing === '00:00:00' || $existing === '-') {
                    $jamPulangToSave = null;
                } else {
                    $jamPulangToSave = $existing;
                }
            } else {
                // Sudah waktunya pulang
                if ($isGuru && !empty($data['jamPulang'])) {
                    // Validasi guru: batas minimal jam pulang dari setting (default 12:30)
                    $minPulangFormatted = '12:30';
                    $minPulangMinutes = gp_get_min_pulang_minutes($pdo, $minPulangFormatted);
                    if (((intval(date('H')) * 60) + intval(date('i'))) < $minPulangMinutes) {
                        sendResponse(false, 'Presensi pulang hanya bisa dilakukan mulai pukul ' . $minPulangFormatted . ' WIB');
                    }
                    // Cek special workday
                    $stmt_h = $pdo->prepare("SELECT is_workday FROM holidays WHERE tanggal = ?");
                    $stmt_h->execute([$todayDate]);
                    $hRow = $stmt_h->fetch();
                    $isSpecialWorkday = $hRow && $hRow['is_workday'] == 1;

                    if (!$isSpecialWorkday && $piket && !empty($piket['jam_pulang_piket'])) {
                        $nowMin    = (intval(date('H')) * 60) + intval(date('i'));
                        list($pH, $pM) = explode(':', $piket['jam_pulang_piket']);
                        $piketMin  = (intval($pH) * 60) + intval($pM);
                        if ($nowMin < $piketMin && empty($data['izin_pulang_awal'])) {
                            sendResponse(false, "PIKET_RESTRICTION|" . substr($piket['jam_pulang_piket'], 0, 5));
                        }
                        if (!empty($data['izin_pulang_awal'])) {
                            $ket = $data['keterangan'] ?? '';
                            if (strpos($ket, '(Izin Pulang Awal Piket)') === false) {
                                $data['keterangan'] = ($ket ? $ket . ' ' : '') . '(Izin Pulang Awal Piket)';
                            }
                        }
                    }
                    $jp = trim($data['jamPulang']);
                    if (strlen($jp) === 5) $jp .= ':00';
                    $jamPulangToSave = $jp;

                } elseif ($isAdmin && !empty($data['jamPulang'])) {
                    $jp = trim($data['jamPulang']);
                    if (strlen($jp) === 5) $jp .= ':00';
                    $jamPulangToSave = $jp;
                }
                // Payload jamPulang kosong → pertahankan yang ada
            }
        }

        // --- JAM HADIR / IZIN / SAKIT ---
        $jamHadirToSave = $isHadir ? $jamMasukToSave : null;
        $jamIzinToSave  = ($status === 'izin')
            ? (!empty($rec['jam_izin']) ? $rec['jam_izin'] : date('H:i:s'))
            : null;
        $jamSakitToSave = ($status === 'sakit')
            ? (!empty($rec['jam_sakit']) ? $rec['jam_sakit'] : date('H:i:s'))
            : null;

        $keteranganToSave = array_key_exists('keterangan', $data)
            ? ($data['keterangan'] ?? '')
            : ($rec['keterangan'] ?? '');

        // UPDATE
        $stmt = $pdo->prepare("
            UPDATE attendance_logs SET
                status     = ?,
                jam_masuk  = ?,
                jam_pulang = ?,
                jam_hadir  = ?,
                jam_izin   = ?,
                jam_sakit  = ?,
                keterangan = ?,
                latitude   = ?,
                longitude  = ?
            WHERE id = ?
        ");

        $stmt->execute([
            $status,
            $jamMasukToSave,
            $jamPulangToSave,
            $jamHadirToSave,
            $jamIzinToSave,
            $jamSakitToSave,
            $keteranganToSave,
            $data['latitude']  ?? $rec['latitude'],
            $data['longitude'] ?? $rec['longitude'],
            intval($data['id'])
        ]);

        $attendance = gp_get_attendance_by_id($pdo, intval($data['id']));
        if ($isGuru && !empty($data['jamPulang'])) {
            $logStatus = 'Pulang' . (!empty($data['izin_pulang_awal']) ? ' (Izin Awal)' : '');
            gp_write_activity($pdo, $rec['nama'], 'Presensi Pulang', $logStatus);
        } elseif ($isAdmin) {
            gp_write_activity($pdo, $_SESSION['nama'] ?? 'Admin', 'Update Presensi', ucfirst(str_replace('_', ' ', $status)));
        }

        sendResponse(true, 'Presensi berhasil diupdate', [
            'attendance' => $attendance
        ]);
    } catch (PDOException $e) {
        sendResponse(false, 'Error update: ' . $e->getMessage());
    }
}

// DELETE PRESENSI
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;

    if (!$id) {
        sendResponse(false, 'ID presensi harus diisi');
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM attendance_logs WHERE id = ?");
        $stmt->execute([$id]);

        sendResponse(true, 'Presensi berhasil dihapus');
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

sendResponse(false, 'Invalid request');
?>
