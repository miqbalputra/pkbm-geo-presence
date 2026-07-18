<?php
require_once 'config.php';
require_once 'workday_service.php';
require_once 'attendance_service.php';

requireAuth(['admin', 'kepala_sekolah']);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, 'Invalid request method');
}

function dayLabel($dateStr)
{
    $days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    $time = strtotime($dateStr);
    return $days[(int)date('w', $time)] . ' ' . date('j/n', $time);
}

function parseJabatan($value)
{
    if (empty($value)) {
        return [];
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [$value];
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

function getWorkdayDates($pdo, $start, $end, $gender = null)
{
    // gpw_get_workday_dates() mengembalikan ['workdays' => [...], 'optional_workdays' => [...]].
    // Di sini kita hanya butuh daftar tanggal hari kerja (flat) agar bisa dipakai
    // untuk count(), array_flip(), dan in_array($date, ..., true).
    $result = gpw_get_workday_dates($pdo, $start, $end, $gender);
    return $result['workdays'] ?? [];
}

function timeToMinutesValue($time)
{
    if (empty($time) || $time === '-' || $time === '00:00:00') {
        return null;
    }
    $parts = explode(':', $time);
    return ((int)$parts[0] * 60) + (int)$parts[1];
}

function summarizeCheckoutRows($logs, $start, $end, $today)
{
    $byDate = [];
    foreach (buildDateRange($start, $end) as $date) {
        $byDate[$date] = [
            'normal' => 0,
            'early' => 0,
            'forgotten' => 0,
            'totalMins' => 0,
            'countMins' => 0,
            'tanggal' => $date
        ];
    }

    $reasons = [];
    foreach ($logs as $log) {
        $date = $log['tanggal'];
        if (!isset($byDate[$date])) {
            continue;
        }

        $status = $log['status'] ?? '';
        $jamPulang = $log['jam_pulang'] ?? null;
        $noCheckout = empty($jamPulang) || $jamPulang === '-' || $jamPulang === '00:00:00';

        if ($date < $today && strpos($status, 'hadir') === 0 && $noCheckout) {
            $byDate[$date]['forgotten']++;
            continue;
        }

        if (!$noCheckout) {
            $minutes = timeToMinutesValue($jamPulang);
            if ($minutes !== null) {
                $byDate[$date]['totalMins'] += $minutes;
                $byDate[$date]['countMins']++;
            }

            $keterangan = $log['keterangan'] ?? '';
            if (strpos($keterangan, 'Izin Pulang Awal Piket') !== false) {
                $byDate[$date]['early']++;
                $reasons[] = [
                    'nama' => $log['nama'],
                    'tanggal' => $date,
                    'jam' => $jamPulang,
                    'alasan' => trim(str_replace(['(Izin Pulang Awal Piket)', ' | Alasan: '], '', $keterangan)) ?: 'Tanpa alasan detail'
                ];
            } else {
                $byDate[$date]['normal']++;
            }
        }
    }

    $rows = [];
    $totalNormal = 0;
    $totalEarly = 0;
    $totalForgotten = 0;
    $allMins = 0;
    $allCount = 0;

    foreach ($byDate as $row) {
        $row['avgMinutes'] = $row['countMins'] > 0 ? (int)round($row['totalMins'] / $row['countMins']) : null;
        $totalNormal += $row['normal'];
        $totalEarly += $row['early'];
        $totalForgotten += $row['forgotten'];
        $allMins += $row['totalMins'];
        $allCount += $row['countMins'];
        $rows[] = $row;
    }

    $total = $totalNormal + $totalEarly + $totalForgotten;
    return [
        'rows' => $rows,
        'reasons' => array_slice($reasons, 0, 10),
        'summary' => [
            'normal' => $totalNormal,
            'early' => $totalEarly,
            'forgotten' => $totalForgotten,
            'avgMins' => $allCount > 0 ? (int)round($allMins / $allCount) : null,
            'pctForgotten' => $total > 0 ? number_format(($totalForgotten / $total) * 100, 1, '.', '') : '0.0'
        ]
    ];
}

try {
    $chart = $_GET['chart'] ?? 'overview';
    $today = date('Y-m-d');

    if ($chart === 'overview') {
        $startDate = date('Y-m-d', strtotime('-6 days'));
        $trend = [];

        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-{$i} days"));
            $trend[$date] = [
                'tanggal' => dayLabel($date),
                'date' => $date,
                'hadir' => 0,
                'tidakHadir' => 0,
                'tercatat' => 0
            ];
        }

        $guruStmt = $pdo->prepare("SELECT id, jenis_kelamin FROM users WHERE role = 'guru' AND archived_at IS NULL");
        $guruStmt->execute();
        $guruRows = $guruStmt->fetchAll();

        $expectedByDate = [];
        foreach (array_keys($trend) as $date) {
            $expectedByDate[$date] = 0;
            foreach ($guruRows as $guru) {
                if (in_array($date, getWorkdayDates($pdo, $date, $date, $guru['jenis_kelamin']), true)) {
                    $expectedByDate[$date]++;
                }
            }
        }

        $trendStmt = $pdo->prepare("
            SELECT a.user_id, a.tanggal, a.status, u.jenis_kelamin
            FROM attendance_logs a
            JOIN users u ON u.id = a.user_id
            WHERE a.tanggal BETWEEN ? AND ?
              AND u.role = 'guru'
              AND u.archived_at IS NULL
        ");
        $trendStmt->execute([$startDate, $today]);
        foreach ($trendStmt->fetchAll() as $row) {
            $date = $row['tanggal'];
            if (!isset($trend[$date])) {
                continue;
            }
            if (!in_array($date, getWorkdayDates($pdo, $date, $date, $row['jenis_kelamin']), true)) {
                continue;
            }

            $trend[$date]['tercatat']++;
            if (in_array($row['status'], ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true)) {
                $trend[$date]['hadir']++;
            } else {
                $trend[$date]['tidakHadir']++;
            }
        }

        $totalGuru = count($guruRows);

        $workdayMap = array_flip(getWorkdayDates($pdo, $startDate, $today));
        foreach ($trend as $date => &$day) {
            if (isset($workdayMap[$date])) {
                $day['tidakHadir'] += max(($expectedByDate[$date] ?? 0) - $day['tercatat'], 0);
            }
            unset($day['tercatat']);
        }
        unset($day);

        $todayStmt = $pdo->prepare("
            SELECT a.status, u.jenis_kelamin
            FROM attendance_logs a
            JOIN users u ON u.id = a.user_id
            WHERE a.tanggal = ?
              AND u.role = 'guru'
              AND u.archived_at IS NULL
        ");
        $todayStmt->execute([$today]);
        $todayStats = [
            'hadir' => 0,
            'izin' => 0,
            'sakit' => 0,
            'alfa' => 0,
            'belumAbsen' => $totalGuru,
            'total' => $totalGuru,
            'persentase' => 0
        ];

        foreach ($todayStmt->fetchAll() as $row) {
            if (!in_array($today, getWorkdayDates($pdo, $today, $today, $row['jenis_kelamin']), true)) {
                continue;
            }

            if (in_array($row['status'], ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true)) {
                $todayStats['hadir']++;
            } elseif ($row['status'] === 'izin') {
                $todayStats['izin']++;
            } elseif ($row['status'] === 'sakit') {
                $todayStats['sakit']++;
            }
        }

        $sudahAbsen = $todayStats['hadir'] + $todayStats['izin'] + $todayStats['sakit'];
        $todayExpected = $expectedByDate[$today] ?? 0;
        $todayStats['belumAbsen'] = max($todayExpected - $sudahAbsen, 0);
        $todayStats['alfa'] = $todayStats['belumAbsen'];
        $todayStats['total'] = $todayExpected;
        $todayStats['persentase'] = $todayExpected > 0 ? (int)round(($sudahAbsen / $todayExpected) * 100) : 0;

        sendResponse(true, 'Data grafik admin berhasil diambil', [
            'trend7Days' => array_values($trend),
            'todayStats' => $todayStats
        ]);
    }

    if ($chart === 'leaderboard') {
        $period = $_GET['period'] ?? 'month';
        $startDate = null;
        $endDate = $today;

        if ($period === 'week') {
            $startDate = date('Y-m-d', strtotime('-6 days'));
        } elseif ($period === 'month') {
            $startDate = date('Y-m-d', strtotime('-29 days'));
        } elseif ($period === 'custom') {
            $customStart = $_GET['start_date'] ?? null;
            $customEnd = $_GET['end_date'] ?? null;
            if (!validateDate($customStart) || !validateDate($customEnd)) {
                sendResponse(false, 'Rentang tanggal kustom tidak valid');
            }
            if ($customStart > $customEnd) {
                sendResponse(false, 'Tanggal mulai tidak boleh setelah tanggal akhir');
            }
            $startDate = $customStart;
            // Batasi akhir sampai hari ini: tidak ada presensi setelah hari ini,
            // dan hari kerja masa depan akan membuat "alfa" menggembung secara artifisial.
            $endDate = min($customEnd, $today);
            if ($startDate > $endDate) {
                $startDate = $endDate;
            }
        } elseif ($period !== 'all') {
            sendResponse(false, 'Invalid period');
        }

        if ($period === 'all') {
            $minDateStmt = $pdo->prepare("SELECT MIN(tanggal) AS tanggal_awal FROM attendance_logs");
            $minDateStmt->execute();
            $startDate = $minDateStmt->fetch()['tanggal_awal'] ?? $today;
        }

        $dateFilter = "AND tanggal BETWEEN ? AND ?";
        $params = [$startDate, $endDate];
        $totalHariAktif = count(getWorkdayDates($pdo, $startDate, $endDate));

        $usersStmt = $pdo->prepare("
            SELECT id, nama, jabatan, jenis_kelamin
            FROM users
            WHERE role = 'guru'
              AND archived_at IS NULL
            ORDER BY nama ASC
        ");
        $usersStmt->execute();
        $guruRows = $usersStmt->fetchAll();

        $statsStmt = $pdo->prepare("
            SELECT user_id, tanggal, status, jam_pulang, lokasi_pulang
            FROM attendance_logs
            WHERE 1=1 {$dateFilter}
        ");
        $statsStmt->execute($params);

        // Jam pulang normal per (guru, tanggal) diambil dari rotasi piket
        // dwi-pekanan (gp_get_piket), bukan tabel jadwal_piket per-hari lama.
        // Di-cache per pasangan user|tanggal agar tidak query berulang.
        $normalPulangCache = [];
        $gp_normal_pulang = function ($userId, $tanggal) use (&$normalPulangCache, $pdo) {
            $key = (int)$userId . '|' . $tanggal;
            if (array_key_exists($key, $normalPulangCache)) {
                return $normalPulangCache[$key];
            }
            $piket = gp_get_piket($pdo, (int)$userId, $tanggal);
            $val = $piket ? substr($piket['jam_pulang_piket'], 0, 5) : '13:00';
            $normalPulangCache[$key] = $val;
            return $val;
        };

        $byUser = [];
        $genderByUser = [];
        foreach ($guruRows as $guru) {
            $genderByUser[(int)$guru['id']] = $guru['jenis_kelamin'];
        }
        foreach ($statsStmt->fetchAll() as $row) {
            $userId = (int)$row['user_id'];
            if (!in_array($row['tanggal'], getWorkdayDates($pdo, $row['tanggal'], $row['tanggal'], $genderByUser[$userId] ?? null), true)) {
                continue;
            }

            if (!isset($byUser[$userId])) {
                $byUser[$userId] = [
                    'hadir' => 0,
                    'tepatWaktu' => 0,
                    'terlambat' => 0,
                    'izin' => 0,
                    'sakit' => 0,
                    'lupaPulang' => 0,
                    'lemburHari' => 0,
                    'lemburMenit' => 0,
                    'records' => 0
                ];
            }

            $byUser[$userId]['records']++;
            $status = $row['status'];
            $isHadir = in_array($status, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true);

            if ($status === 'hadir') {
                $byUser[$userId]['hadir']++;
                $byUser[$userId]['tepatWaktu']++;
            } elseif ($status === 'hadir_terlambat' || $status === 'hadir_izin_terlambat') {
                $byUser[$userId]['hadir']++;
                $byUser[$userId]['terlambat']++;
            } elseif ($status === 'izin') {
                $byUser[$userId]['izin']++;
            } elseif ($status === 'sakit') {
                $byUser[$userId]['sakit']++;
            }

            // Lupa presensi pulang: hari HADIR di masa lalu (sebelum hari ini) tanpa jam pulang.
            // Hari ini dikecualikan karena guru mungkin belum pulang.
            if ($isHadir && $row['tanggal'] < $today) {
                $jp = $row['jam_pulang'] ?? null;
                if ($jp === null || $jp === '' || $jp === '-' || $jp === '00:00:00') {
                    $byUser[$userId]['lupaPulang']++;
                }
            }

            // Bonus lembur: hari HADIR yang pulang TERLAMBAT dari jam pulang normal,
            // DAN checkout-nya di sekolah (QR lama selalu sekolah; data lama NULL
            // diasumsikan sekolah). Checkout dari luar ('luar') tidak dapat bonus.
            if ($isHadir) {
                $jp = $row['jam_pulang'] ?? null;
                $lokasi = $row['lokasi_pulang'] ?? null;
                $jamPulangOK = $jp !== null && $jp !== '' && $jp !== '-' && $jp !== '00:00:00';
                $diSekolah = $lokasi === 'sekolah' || $lokasi === null || $lokasi === '';
                if ($jamPulangOK && $diSekolah) {
                    $normal = $gp_normal_pulang($userId, $row['tanggal']);
                    $normalMenit = timeToMinutesValue($normal);
                    $pulangMenit = timeToMinutesValue($jp);
                    if ($pulangMenit !== null && $pulangMenit > $normalMenit) {
                        $byUser[$userId]['lemburHari']++;
                        $byUser[$userId]['lemburMenit'] += ($pulangMenit - $normalMenit);
                    }
                }
            }
        }

        $leaderboard = [];
        foreach ($guruRows as $guru) {
            $userStats = $byUser[(int)$guru['id']] ?? [
                'hadir' => 0,
                'tepatWaktu' => 0,
                'terlambat' => 0,
                'izin' => 0,
                'sakit' => 0,
                'lupaPulang' => 0,
                'lemburHari' => 0,
                'lemburMenit' => 0,
                'records' => 0
            ];

            $userTotalHariAktif = count(getWorkdayDates($pdo, $startDate, $endDate, $guru['jenis_kelamin']));
            $tidakPresensi = max($userTotalHariAktif - $userStats['records'], 0);
            $totalHadir = $userStats['hadir'];
            $lupaPulang = $userStats['lupaPulang'];
            $lemburHari = $userStats['lemburHari'];
            $lemburMenit = $userStats['lemburMenit'];

            // Skor dasar disiplin — guru ideal = 100% hadir fisik, tidak terlambat,
            // dan tidak pernah lupa presensi pulang. Izin, sakit, alpa, terlambat,
            // dan lupa pulang semuanya menurunkan skor.
            $persentaseKehadiran = $userTotalHariAktif > 0 ? ($totalHadir / $userTotalHariAktif) * 100 : 0;
            $persentaseTepatWaktu = $totalHadir > 0 ? ($userStats['tepatWaktu'] / $totalHadir) * 100 : 0;
            $totalPulangLengkap = max($totalHadir - $lupaPulang, 0);
            $persentasePulang = $totalHadir > 0 ? ($totalPulangLengkap / $totalHadir) * 100 : 0;
            $skorDasar = ($persentaseKehadiran * 0.5) + ($persentaseTepatWaktu * 0.25) + ($persentasePulang * 0.25);

            // Bonus lembur: +1 poin per 60 menit lembur di sekolah (proporsional,
            // tanpa batas atas). Skor akhir tetap dibatasi 100.
            $lemburBonus = round($lemburMenit / 60, 1);
            $skor = min($skorDasar + $lemburBonus, 100);

            $leaderboard[] = [
                'id' => (int)$guru['id'],
                'nama' => $guru['nama'],
                'jabatan' => parseJabatan($guru['jabatan']),
                'totalHadir' => $totalHadir,
                'tepatWaktu' => $userStats['tepatWaktu'],
                'terlambat' => $userStats['terlambat'],
                'izin' => $userStats['izin'],
                'sakit' => $userStats['sakit'],
                'lupaPulang' => $lupaPulang,
                'lemburHari' => $lemburHari,
                'lemburMenit' => $lemburMenit,
                'lemburBonus' => $lemburBonus,
                'totalPulangLengkap' => $totalPulangLengkap,
                'persentasePulang' => round($persentasePulang, 1),
                'tidakPresensi' => $tidakPresensi,
                'totalHariAktif' => $userTotalHariAktif,
                'persentaseKehadiran' => round($persentaseKehadiran, 1),
                'persentaseTepatWaktu' => round($persentaseTepatWaktu, 1),
                'skor' => round($skor, 1)
            ];
        }

        usort($leaderboard, function ($a, $b) {
            if ($b['skor'] !== $a['skor']) {
                return $b['skor'] <=> $a['skor'];
            }
            // Tiebreak: lebih sedikit lupa pulang, lalu lebih banyak tepat waktu,
            // lalu lebih banyak lembur (dedikasi kerja).
            if ($a['lupaPulang'] !== $b['lupaPulang']) {
                return $a['lupaPulang'] <=> $b['lupaPulang'];
            }
            if ($b['tepatWaktu'] !== $a['tepatWaktu']) {
                return $b['tepatWaktu'] <=> $a['tepatWaktu'];
            }
            return $b['lemburMenit'] <=> $a['lemburMenit'];
        });

        sendResponse(true, 'Leaderboard guru berhasil diambil', [
            'period' => $period,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'totalHariAktif' => $totalHariAktif,
            'items' => $leaderboard
        ]);
    }

    if ($chart === 'checkout') {
        $startA = $_GET['startA'] ?? date('Y-m-d', strtotime('-13 days'));
        $endA = $_GET['endA'] ?? $today;
        $startB = $_GET['startB'] ?? date('Y-m-d', strtotime('-27 days'));
        $endB = $_GET['endB'] ?? date('Y-m-d', strtotime('-14 days'));
        $userId = $_GET['user_id'] ?? 'all';

        if (!validateDate($startA) || !validateDate($endA) || !validateDate($startB) || !validateDate($endB)) {
            sendResponse(false, 'Invalid date range');
        }

        $guruStmt = $pdo->prepare("SELECT id, nama FROM users WHERE role = 'guru' AND archived_at IS NULL ORDER BY nama ASC");
        $guruStmt->execute();
        $guru = $guruStmt->fetchAll();

        $minDate = min($startA, $startB);
        $maxDate = max($endA, $endB);
        $params = [$minDate, $maxDate];
        $userFilter = '';
        if ($userId !== 'all') {
            $userFilter = 'AND user_id = ?';
            $params[] = (int)$userId;
        }

        $logsStmt = $pdo->prepare("
            SELECT user_id, nama, tanggal, status, jam_pulang, keterangan
            FROM attendance_logs
            WHERE tanggal BETWEEN ? AND ? {$userFilter}
        ");
        $logsStmt->execute($params);
        $logs = $logsStmt->fetchAll();

        $logsA = array_values(array_filter($logs, fn($log) => $log['tanggal'] >= $startA && $log['tanggal'] <= $endA));
        $logsB = array_values(array_filter($logs, fn($log) => $log['tanggal'] >= $startB && $log['tanggal'] <= $endB));
        $a = summarizeCheckoutRows($logsA, $startA, $endA, $today);
        $b = summarizeCheckoutRows($logsB, $startB, $endB, $today);

        $maxLen = max(count($a['rows']), count($b['rows']));
        $compare = [];
        for ($i = 0; $i < $maxLen; $i++) {
            $rowA = $a['rows'][$i] ?? null;
            $rowB = $b['rows'][$i] ?? null;
            $totalA = $rowA ? $rowA['normal'] + $rowA['early'] + $rowA['forgotten'] : 0;
            $totalB = $rowB ? $rowB['normal'] + $rowB['early'] + $rowB['forgotten'] : 0;
            $compare[] = [
                'day' => $i + 1,
                'Lupa Pulang A' => $totalA > 0 ? round(($rowA['forgotten'] / $totalA) * 100, 1) : 0,
                'Lupa Pulang B' => $totalB > 0 ? round(($rowB['forgotten'] / $totalB) * 100, 1) : 0
            ];
        }

        sendResponse(true, 'Data tren jam pulang berhasil diambil', [
            'guru' => $guru,
            'periodA' => $a,
            'periodB' => $b,
            'compare' => $compare
        ]);
    }

    if ($chart === 'complete_stats') {
        $days = validateInt($_GET['days'] ?? 30, 1, 3650);
        if ($days === false) {
            sendResponse(false, 'Invalid days');
        }
        $startDate = date('Y-m-d', strtotime('-' . ($days - 1) . ' days'));

        $logsStmt = $pdo->prepare("
            SELECT id, user_id, nama, tanggal, status, jam_masuk, jam_pulang, keterangan
            FROM attendance_logs
            WHERE tanggal >= ?
            ORDER BY tanggal DESC, id DESC
        ");
        $logsStmt->execute([$startDate]);
        $logs = $logsStmt->fetchAll();

        $guruStmt = $pdo->prepare("SELECT id, nama FROM users WHERE role = 'guru' AND archived_at IS NULL ORDER BY nama ASC");
        $guruStmt->execute();
        $guruRows = $guruStmt->fetchAll();

        // Status piket per (guru, tanggal) dari rotasi dwi-pekanan (gp_get_piket).
        // Di-cache agar tidak query berulang per log.
        $piketOnDateCache = [];
        $gp_is_piket = function ($userId, $tanggal) use (&$piketOnDateCache, $pdo) {
            $key = (int)$userId . '|' . $tanggal;
            if (array_key_exists($key, $piketOnDateCache)) {
                return $piketOnDateCache[$key];
            }
            $val = gp_get_piket($pdo, (int)$userId, $tanggal) !== null;
            $piketOnDateCache[$key] = $val;
            return $val;
        };

        $checkIns = array_values(array_filter($logs, fn($log) => strpos($log['status'], 'hadir') === 0));
        $lateLogs = array_values(array_filter($checkIns, fn($log) => in_array($log['status'], ['hadir_terlambat', 'hadir_izin_terlambat'], true)));
        $statsByGuru = [];
        foreach ($guruRows as $guru) {
            $statsByGuru[(int)$guru['id']] = [
                'id' => (int)$guru['id'],
                'nama' => $guru['nama'],
                'total' => 0,
                'terlambat' => 0,
                'persentase' => '0.0'
            ];
        }

        foreach ($checkIns as $log) {
            $id = (int)$log['user_id'];
            if (!isset($statsByGuru[$id])) continue;
            $statsByGuru[$id]['total']++;
            if (in_array($log['status'], ['hadir_terlambat', 'hadir_izin_terlambat'], true)) {
                $statsByGuru[$id]['terlambat']++;
            }
        }
        foreach ($statsByGuru as &$stat) {
            $stat['persentase'] = $stat['total'] > 0 ? number_format(($stat['terlambat'] / $stat['total']) * 100, 1, '.', '') : '0.0';
        }
        unset($stat);
        $statsPerGuru = array_values($statsByGuru);
        usort($statsPerGuru, fn($a, $b) => (float)$b['persentase'] <=> (float)$a['persentase']);

        $latePiket = [];
        $earlyCheckouts = [];
        $izinSakit = [];
        $forgotten = [];

        foreach ($logs as $log) {
            $log['userId'] = (int)$log['user_id'];
            $log['jamMasuk'] = $log['jam_masuk'];
            $log['jamPulang'] = $log['jam_pulang'];

            if (in_array($log['status'], ['hadir_terlambat', 'hadir_izin_terlambat'], true)) {
                if ($gp_is_piket((int)$log['user_id'], $log['tanggal'])) {
                    $latePiket[] = $log;
                }
            }
            if (!empty($log['keterangan']) && strpos($log['keterangan'], 'Izin Pulang Awal Piket') !== false) {
                $earlyCheckouts[] = $log;
            }
            if ($log['status'] === 'izin' || $log['status'] === 'sakit') {
                $izinSakit[] = $log;
            }
            $noCheckout = empty($log['jam_pulang']) || $log['jam_pulang'] === '-' || $log['jam_pulang'] === '00:00:00';
            if ($log['tanggal'] < $today && strpos($log['status'], 'hadir') === 0 && $noCheckout) {
                $forgotten[] = $log;
            }
        }

        sendResponse(true, 'Statistik lengkap berhasil diambil', [
            'lateStats' => [
                'totalLatePct' => count($checkIns) > 0 ? number_format((count($lateLogs) / count($checkIns)) * 100, 1, '.', '') : '0.0',
                'statsPerGuru' => $statsPerGuru,
                'totalLate' => count($lateLogs)
            ],
            'latePiket' => $latePiket,
            'earlyCheckouts' => $earlyCheckouts,
            'izinSakit' => $izinSakit,
            'forgotten' => $forgotten
        ]);
    }

    sendResponse(false, 'Invalid chart');
} catch (PDOException $e) {
    handleError($e, 'admin_charts.php');
}
?>
