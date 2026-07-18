<?php
require_once 'config.php';
require_once 'workday_service.php';

requireAuth(['admin', 'kepala_sekolah']);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, 'Invalid request method');
}

function buildDateRange($start, $end)
{
    $dates = [];
    $current = strtotime($start);
    $last = strtotime($end);
    while ($current <= $last) {
        $dates[] = date('Y-m-d', $current);
        $current = strtotime('+1 day', $current);
    }
    return $dates;
}

function getWorkdayDates($pdo, $start, $end, $gender = null, $userId = null)
{
    // gpw_get_workday_dates() mengembalikan ['workdays' => [...], 'optional_workdays' => [...]].
    // Di sini kita hanya butuh daftar tanggal hari kerja (flat) agar bisa dipakai
    // untuk count(), array_flip(), dan in_array($today, ..., true).
    // $userId diteruskan agar hari kerja sebelum akun guru dibuat (created_at)
    // tidak dihitung sebagai alfa retroaktif.
    $result = gpw_get_workday_dates($pdo, $start, $end, $gender, $userId);
    return $result['workdays'] ?? [];
}

try {
    $period = $_GET['period'] ?? 'today';
    $today = date('Y-m-d');
    $startDate = $today;
    $endDate = $today;

    if ($period === 'yesterday') {
        $startDate = date('Y-m-d', strtotime('-1 day'));
        $endDate = $startDate;
    } elseif ($period === '7days') {
        $startDate = date('Y-m-d', strtotime('-6 days'));
    } elseif ($period === '14days') {
        $startDate = date('Y-m-d', strtotime('-13 days'));
    } elseif ($period === '30days') {
        $startDate = date('Y-m-d', strtotime('-29 days'));
    } elseif ($period !== 'today') {
        sendResponse(false, 'Invalid period');
    }

    $guruStmt = $pdo->prepare("SELECT id, jenis_kelamin FROM users WHERE role = 'guru' AND archived_at IS NULL");
    $guruStmt->execute();
    $guruRows = $guruStmt->fetchAll();
    $totalGuru = count($guruRows);

    $workdayDates = getWorkdayDates($pdo, $startDate, $endDate);
    $totalHariAktif = count($workdayDates);
    $workdayMapByUser = [];
    $totalExpected = 0;
    foreach ($guruRows as $guru) {
        $userWorkdays = getWorkdayDates($pdo, $startDate, $endDate, $guru['jenis_kelamin'], (int)$guru['id']);
        $workdayMapByUser[(int)$guru['id']] = array_flip($userWorkdays);
        $totalExpected += count($userWorkdays);
    }

    $statsStmt = $pdo->prepare("
        SELECT a.user_id, a.tanggal, a.status
        FROM attendance_logs a
        JOIN users u ON u.id = a.user_id
        WHERE a.tanggal BETWEEN ? AND ?
          AND u.role = 'guru'
          AND u.archived_at IS NULL
    ");
    $statsStmt->execute([$startDate, $endDate]);
    $statusCounts = [
        'hadir' => 0,
        'izin' => 0,
        'sakit' => 0,
        'alfa' => 0
    ];

    foreach ($statsStmt->fetchAll() as $row) {
        $userId = (int)$row['user_id'];
        if (!isset($workdayMapByUser[$userId][$row['tanggal']])) {
            continue;
        }

        $status = $row['status'];
        if (in_array($status, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true)) {
            $statusCounts['hadir']++;
        } elseif ($status === 'izin') {
            $statusCounts['izin']++;
        } elseif ($status === 'sakit') {
            $statusCounts['sakit']++;
        }
    }

    $totalTercatat = $statusCounts['hadir'] + $statusCounts['izin'] + $statusCounts['sakit'];
    $statusCounts['alfa'] = max($totalExpected - $totalTercatat, 0);

    $logsStmt = $pdo->prepare("
        SELECT id, user_id, nama, tanggal, status, jam_masuk, jam_pulang, jam_hadir,
               jam_izin, jam_sakit, keterangan
        FROM attendance_logs
        WHERE tanggal BETWEEN ? AND ?
        ORDER BY tanggal DESC, id DESC
    ");
    $logsStmt->execute([$startDate, $endDate]);
    $logs = $logsStmt->fetchAll();

    foreach ($logs as &$log) {
        $log['userId'] = $log['user_id'];
        $log['jamMasuk'] = $log['jam_masuk'];
        $log['jamPulang'] = $log['jam_pulang'];
        $log['jamHadir'] = $log['jam_hadir'];
        $log['jamIzin'] = $log['jam_izin'];
        $log['jamSakit'] = $log['jam_sakit'];
    }
    unset($log);

    $missingStmt = $pdo->prepare("
        SELECT u.id, u.nama, u.jabatan, u.jenis_kelamin
        FROM users u
        LEFT JOIN attendance_logs a ON a.user_id = u.id AND a.tanggal = ?
        WHERE u.role = 'guru'
          AND u.archived_at IS NULL
          AND a.id IS NULL
        ORDER BY u.nama ASC
    ");
    $missingStmt->execute([$today]);
    $missingGuru = array_values(array_filter($missingStmt->fetchAll(), function ($guru) use ($pdo, $today) {
        return in_array($today, getWorkdayDates($pdo, $today, $today, $guru['jenis_kelamin'], (int)$guru['id']), true);
    }));

    foreach ($missingGuru as &$guru) {
        if (!empty($guru['jabatan'])) {
            $jabatan = json_decode($guru['jabatan'], true);
            $guru['jabatan'] = is_array($jabatan) ? $jabatan : [$guru['jabatan']];
        } else {
            $guru['jabatan'] = [];
        }
    }
    unset($guru);

    sendResponse(true, 'Ringkasan dashboard berhasil diambil', [
        'period' => $period,
        'startDate' => $startDate,
        'endDate' => $endDate,
        'totalGuru' => $totalGuru,
        'totalHariAktif' => $totalHariAktif,
        'stats' => $statusCounts,
        'belumPresensiHariIni' => $missingGuru,
        'logs' => $logs
    ]);
} catch (PDOException $e) {
    handleError($e, 'admin_summary.php');
}
?>
