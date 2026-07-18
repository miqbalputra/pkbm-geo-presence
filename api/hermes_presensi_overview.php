<?php
/**
 * API endpoint khusus Hermes Agent untuk cek data presensi menyeluruh.
 * Auth menggunakan HERMES_API_KEY, fallback ke N8N_API_KEY jika belum dipisah.
 */

require_once 'config.php';
require_once 'attendance_service.php';
require_once 'workday_service.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, 'Invalid request method');
}

requireAnyApiKey(['HERMES_API_KEY', 'N8N_API_KEY']);

function hermes_build_date_range($start, $end)
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

function hermes_get_workday_dates($pdo, $start, $end, $gender = null, $userId = null)
{
    $stmt = $pdo->prepare("
        SELECT tanggal, jenis, is_workday, nama
        FROM holidays
        WHERE tanggal BETWEEN ? AND ?
    ");
    $stmt->execute([$start, $end]);

    $holidays = [];
    foreach ($stmt->fetchAll() as $holiday) {
        $holidays[$holiday['tanggal']] = $holiday;
    }

    // Optional workdays: bonus attendance days, not mandatory
    $optionalStmt = $pdo->prepare("
        SELECT tanggal, nama, keterangan
        FROM optional_workdays
        WHERE tanggal BETWEEN ? AND ?
    ");
    $optionalStmt->execute([$start, $end]);
    $optionalWorkdays = [];
    foreach ($optionalStmt->fetchAll() as $row) {
        $optionalWorkdays[$row['tanggal']] = $row;
    }

    $workdays = [];
    $excludedDates = [];

    // Guru tidak wajib presensi sebelum akunnya dibuat. Ambil created_at user
    // (jika ada) agar Sabtu sebelum akun ada tidak dihitung sebagai hari kerja
    // (menghindari alfa retroaktif bagi guru yang baru di-import).
    $createdAtDate = null;
    if ($userId !== null && $userId !== false) {
        $cs = $pdo->prepare("SELECT created_at FROM users WHERE id = ? LIMIT 1");
        $cs->execute([$userId]);
        $cu = $cs->fetch();
        if (!empty($cu['created_at'])) {
            $createdAtDate = substr($cu['created_at'], 0, 10);
        }
    }

    foreach (hermes_build_date_range($start, $end) as $date) {
        $holiday = $holidays[$date] ?? null;
        $dateStatus = gpw_get_date_status($pdo, $date, $gender, $userId);

        $isWorkday = $dateStatus['isWorkday'];
        if ($isWorkday && $createdAtDate !== null && $date < $createdAtDate) {
            $isWorkday = false;
        }

        if ($isWorkday) {
            $workdays[] = $date;
        } else {
            $excludedDates[] = [
                'tanggal' => $date,
                'reason' => $holiday ? $holiday['nama'] : ($dateStatus['isWeekend'] ? 'Weekend' : 'Non-workday')
            ];
        }
    }

    return [$workdays, $excludedDates, $optionalWorkdays];
}

function hermes_parse_jabatan($value)
{
    if (empty($value)) {
        return [];
    }

    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [$value];
}

function hermes_bool_param($key, $default = false)
{
    if (!isset($_GET[$key])) {
        return $default;
    }

    return in_array(strtolower((string)$_GET[$key]), ['1', 'true', 'yes', 'y'], true);
}

function hermes_resolve_date_range($pdo)
{
    $today = date('Y-m-d');
    $period = $_GET['period'] ?? null;

    if (isset($_GET['start_date']) || isset($_GET['end_date'])) {
        $startDate = $_GET['start_date'] ?? $today;
        $endDate = $_GET['end_date'] ?? $startDate;

        if (!validateDate($startDate) || !validateDate($endDate) || $startDate > $endDate) {
            sendResponse(false, 'Invalid date range');
        }

        return [$startDate, $endDate, 'custom'];
    }

    if ($period === null || $period === 'today') {
        return [$today, $today, 'today'];
    }

    if ($period === 'yesterday') {
        $date = date('Y-m-d', strtotime('-1 day'));
        return [$date, $date, 'yesterday'];
    }

    if ($period === '7days') {
        return [date('Y-m-d', strtotime('-6 days')), $today, '7days'];
    }

    if ($period === '14days') {
        return [date('Y-m-d', strtotime('-13 days')), $today, '14days'];
    }

    if ($period === '30days') {
        return [date('Y-m-d', strtotime('-29 days')), $today, '30days'];
    }

    if ($period === 'month') {
        return [date('Y-m-01'), $today, 'month'];
    }

    if ($period === 'all') {
        $stmt = $pdo->query("SELECT MIN(tanggal) AS start_date FROM attendance_logs");
        $startDate = $stmt->fetch()['start_date'] ?? $today;
        return [$startDate ?: $today, $today, 'all'];
    }

    sendResponse(false, 'Invalid period');
}

try {
    [$startDate, $endDate, $period] = hermes_resolve_date_range($pdo);
    $today = date('Y-m-d');

    $userId = isset($_GET['user_id']) ? validateInt($_GET['user_id'], 1) : null;
    if (isset($_GET['user_id']) && $userId === false) {
        sendResponse(false, 'Invalid user_id');
    }

    $guruParams = [];
    $guruWhere = "role = 'guru'";
    if ($userId !== null) {
        $guruWhere .= " AND id = ?";
        $guruParams[] = $userId;
    }

    $guruStmt = $pdo->prepare("
        SELECT id, id_guru, nama, no_hp, jabatan, jenis_kelamin, tipe_guru
        FROM users
        WHERE {$guruWhere}
        ORDER BY nama ASC
    ");
    $guruStmt->execute($guruParams);
    $guruRows = $guruStmt->fetchAll();

    $guruById = [];
    $globalExcludedDates = [];
    $globalWorkdays = [];

    foreach ($guruRows as $guru) {
        $guruId = (int)$guru['id'];
        [$userWorkdays, $userExcludedDates, $optionalWorkdays] = hermes_get_workday_dates($pdo, $startDate, $endDate, $guru['jenis_kelamin'], $guruId);

        $workdayMap = array_flip($userWorkdays);
        foreach ($userWorkdays as $date) {
            $globalWorkdays[$date] = true;
        }
        foreach ($userExcludedDates as $excluded) {
            $globalExcludedDates[$excluded['tanggal']] = $excluded;
        }

        $guruById[$guruId] = [
            'id' => $guruId,
            'idGuru' => $guru['id_guru'],
            'nama' => $guru['nama'],
            'noHP' => $guru['no_hp'],
            'jabatan' => hermes_parse_jabatan($guru['jabatan']),
            'jenisKelamin' => $guru['jenis_kelamin'],
            'tipeGuru' => $guru['tipe_guru'],
            'hadir' => 0,
            'tepatWaktu' => 0,
            'terlambat' => 0,
            'izin' => 0,
            'sakit' => 0,
            'alfa' => 0,
            'totalTercatat' => 0,
            'lupaPulang' => 0,
            'izinPulangAwal' => 0,
            'persentaseKehadiran' => 0,
            'totalHariAktif' => count($userWorkdays),
            '_workdayMap' => $workdayMap,
            '_optionalWorkdays' => $optionalWorkdays
        ];
    }

    $workdays = array_keys($globalWorkdays);
    sort($workdays);
    $excludedDates = array_values($globalExcludedDates);
    $totalHariAktif = count($workdays);

    $totalGuru = count($guruRows);
    $params = [$startDate, $endDate];
    $userFilter = '';
    if ($userId !== null) {
        $userFilter = 'AND user_id = ?';
        $params[] = $userId;
    }

    $logsStmt = $pdo->prepare("
        SELECT id, user_id, nama, tanggal, status, jam_masuk, jam_pulang, jam_hadir,
               jam_izin, jam_sakit, keterangan, latitude, longitude, metode, created_at, updated_at
        FROM attendance_logs
        WHERE tanggal BETWEEN ? AND ? {$userFilter}
        ORDER BY tanggal DESC, id DESC
    ");
    $logsStmt->execute($params);
    $logs = $logsStmt->fetchAll();

    $statusCounts = [
        'hadir' => 0,
        'hadirTerlambat' => 0,
        'hadirIzinTerlambat' => 0,
        'izin' => 0,
        'sakit' => 0,
        'alfa' => 0
    ];
    $presentKeys = [];
    $lupaPulang = [];
    $izinPulangAwal = [];

    foreach ($logs as &$log) {
        $mapped = gp_map_attendance_record($log);
        $log = $mapped;

        $uid = (int)$mapped['user_id'];
        $status = $mapped['status'];
        $date = $mapped['tanggal'];
        $isWorkday = isset($guruById[$uid]['_workdayMap'][$date]);
        $isOptional = isset($guruById[$uid]['_optionalWorkdays'][$date]);
        $isRelevant = $isWorkday || $isOptional;

        if ($isWorkday) {
            $presentKeys[$uid . '|' . $date] = true;
        }

        if ($isRelevant) {
            if ($status === 'hadir') {
                $statusCounts['hadir']++;
                if (isset($guruById[$uid])) {
                    $guruById[$uid]['hadir']++;
                    $guruById[$uid]['tepatWaktu']++;
                }
            } elseif ($status === 'hadir_terlambat') {
                $statusCounts['hadirTerlambat']++;
                if (isset($guruById[$uid])) {
                    $guruById[$uid]['hadir']++;
                    $guruById[$uid]['terlambat']++;
                }
            } elseif ($status === 'hadir_izin_terlambat') {
                $statusCounts['hadirIzinTerlambat']++;
                if (isset($guruById[$uid])) {
                    $guruById[$uid]['hadir']++;
                    $guruById[$uid]['terlambat']++;
                }
            } elseif ($status === 'izin') {
                // Optional day izin does not count as absence, only count if workday
                if ($isWorkday) {
                    $statusCounts['izin']++;
                    if (isset($guruById[$uid])) {
                        $guruById[$uid]['izin']++;
                    }
                }
            } elseif ($status === 'sakit') {
                // Optional day sakit does not count as absence, only count if workday
                if ($isWorkday) {
                    $statusCounts['sakit']++;
                    if (isset($guruById[$uid])) {
                        $guruById[$uid]['sakit']++;
                    }
                }
            }

            if (isset($guruById[$uid])) {
                $guruById[$uid]['totalTercatat']++;
            }
        }

        $jamPulang = $mapped['jam_pulang'] ?? null;
        $noCheckout = empty($jamPulang) || $jamPulang === '-' || $jamPulang === '00:00:00';
        if ($date < $today && strpos($status, 'hadir') === 0 && $noCheckout) {
            $item = [
                'id' => (int)$mapped['id'],
                'userId' => $uid,
                'nama' => $mapped['nama'],
                'tanggal' => $date,
                'jamMasuk' => $mapped['jamMasuk']
            ];
            $lupaPulang[] = $item;
            if (isset($guruById[$uid])) {
                $guruById[$uid]['lupaPulang']++;
            }
        }

        if (!empty($mapped['keterangan']) && strpos($mapped['keterangan'], 'Izin Pulang Awal Piket') !== false) {
            $item = [
                'id' => (int)$mapped['id'],
                'userId' => $uid,
                'nama' => $mapped['nama'],
                'tanggal' => $date,
                'jamPulang' => $mapped['jamPulang'],
                'keterangan' => $mapped['keterangan']
            ];
            $izinPulangAwal[] = $item;
            if (isset($guruById[$uid])) {
                $guruById[$uid]['izinPulangAwal']++;
            }
        }
    }
    unset($log);

    $missingToday = [];
    $missingByDate = [];

    foreach ($guruById as $guruId => &$guru) {
        foreach (array_keys($guru['_workdayMap']) as $workday) {
            if (!isset($presentKeys[$guruId . '|' . $workday])) {
                $guru['alfa']++;

                $missingItem = [
                    'userId' => $guruId,
                    'idGuru' => $guru['idGuru'],
                    'nama' => $guru['nama'],
                    'tanggal' => $workday,
                    'noHP' => $guru['noHP'],
                    'jabatan' => $guru['jabatan']
                ];

                $missingByDate[$workday][] = $missingItem;
                if ($workday === $today) {
                    $missingToday[] = $missingItem;
                }
            }
        }
    }
    unset($guru);

    foreach ($guruById as &$guru) {
        // Optional workdays attended add +1 to total workdays; absent optional days add nothing.
        $optionalHadir = 0;
        foreach ($guru['_optionalWorkdays'] as $optDate => $optRow) {
            if (isset($presentKeys[$guru['id'] . '|' . $optDate])) {
                $optionalHadir++;
            }
        }
        $guru['totalHariAktif'] += $optionalHadir;
        $guru['hadir'] += $optionalHadir;

        $guru['persentaseKehadiran'] = $guru['totalHariAktif'] > 0
            ? round(($guru['hadir'] / $guru['totalHariAktif']) * 100, 1)
            : 0;
        unset($guru['_workdayMap']);
        unset($guru['_optionalWorkdays']);
    }
    unset($guru);

    $statusCounts['alfa'] = array_sum(array_column($guruById, 'alfa'));
    $totalHadir = $statusCounts['hadir'] + $statusCounts['hadirTerlambat'] + $statusCounts['hadirIzinTerlambat'];
    $totalTercatat = $totalHadir + $statusCounts['izin'] + $statusCounts['sakit'];
    $totalExpected = array_sum(array_column($guruById, 'totalHariAktif'));

    $response = [
        'generatedAt' => date('c'),
        'period' => $period,
        'startDate' => $startDate,
        'endDate' => $endDate,
        'filter' => [
            'userId' => $userId
        ],
        'summary' => [
            'totalGuru' => $totalGuru,
            'totalHariAktif' => $totalHariAktif,
            'totalExpected' => $totalExpected,
            'totalTercatat' => $totalTercatat,
            'totalLogRecords' => count($logs),
            'totalHadir' => $totalHadir,
            'totalTidakHadir' => $statusCounts['izin'] + $statusCounts['sakit'] + $statusCounts['alfa'],
            'attendanceRate' => $totalExpected > 0 ? round(($totalTercatat / $totalExpected) * 100, 1) : 0,
            'presenceRate' => $totalExpected > 0 ? round(($totalHadir / $totalExpected) * 100, 1) : 0,
            'punctualityRate' => $totalHadir > 0 ? round(($statusCounts['hadir'] / $totalHadir) * 100, 1) : 0,
            'lupaPulang' => count($lupaPulang),
            'izinPulangAwal' => count($izinPulangAwal)
        ],
        'statusCounts' => $statusCounts,
        'belumPresensiHariIni' => $missingToday,
        'belumPresensiByDate' => $missingByDate,
        'lupaPulang' => $lupaPulang,
        'izinPulangAwal' => $izinPulangAwal,
        'perGuru' => array_values($guruById),
        'excludedDates' => $excludedDates
    ];

    if (hermes_bool_param('include_logs')) {
        $limit = validateInt($_GET['limit'] ?? 500, 1, 2000);
        if ($limit === false) {
            sendResponse(false, 'Invalid limit');
        }
        $response['logs'] = array_slice($logs, 0, $limit);
        $response['logsLimit'] = $limit;
        $response['logsReturned'] = count($response['logs']);
        $response['logsTotal'] = count($logs);
    }

    sendResponse(true, 'Overview presensi Hermes berhasil diambil', $response);
} catch (PDOException $e) {
    handleError($e, 'hermes_presensi_overview.php');
}
?>
