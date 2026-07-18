<?php
require_once 'config.php';
require_once 'workday_service.php';

$method = $_SERVER['REQUEST_METHOD'];

requireAuth(['admin', 'kepala_sekolah', 'guru']);

if ($method !== 'GET') {
    sendResponse(false, 'Invalid request method');
}

try {
    $startDate = $_GET['start_date'] ?? date('Y-m-01');
    $endDate = $_GET['end_date'] ?? date('Y-m-d');

    if (!validateDate($startDate) || !validateDate($endDate)) {
        http_response_code(400);
        sendResponse(false, 'Format tanggal tidak valid');
    }

    if ($startDate > $endDate) {
        http_response_code(400);
        sendResponse(false, 'Tanggal awal tidak boleh lebih besar dari tanggal akhir');
    }

    // Ambil semua guru aktif beserta gender
    $userStmt = $pdo->prepare("
        SELECT id, nama, jenis_kelamin
        FROM users
        WHERE (role = 'guru' OR role = 'kepala_sekolah')
          AND archived_at IS NULL
        ORDER BY nama ASC
    ");
    $userStmt->execute();
    $users = $userStmt->fetchAll();

    $holidaysByDate = [];
    $holidayStmt = $pdo->prepare("SELECT tanggal, jenis, is_workday FROM holidays WHERE tanggal BETWEEN ? AND ?");
    $holidayStmt->execute([$startDate, $endDate]);
    foreach ($holidayStmt->fetchAll() as $row) {
        $holidaysByDate[$row['tanggal']] = $row;
    }

    $overridesByUser = [];
    $overrideStmt = $pdo->prepare("
        SELECT user_id, tanggal, is_workday
        FROM user_weekend_overrides
        WHERE tanggal BETWEEN ? AND ?
    ");
    $overrideStmt->execute([$startDate, $endDate]);
    foreach ($overrideStmt->fetchAll() as $row) {
        if (!isset($overridesByUser[$row['user_id']])) {
            $overridesByUser[$row['user_id']] = [];
        }
        $overridesByUser[$row['user_id']][$row['tanggal']] = (int)$row['is_workday'];
    }

    $weekendSettings = gpw_get_weekend_workday_settings($pdo);
    $workdayDays = gpw_get_workday_days($pdo);
    $dateRange = gpw_build_date_range($startDate, $endDate);

    $optionalStmt = $pdo->prepare("SELECT tanggal, nama, keterangan FROM optional_workdays WHERE tanggal BETWEEN ? AND ?");
    $optionalStmt->execute([$startDate, $endDate]);
    $optionalWorkdays = [];
    $optionalDates = [];
    foreach ($optionalStmt->fetchAll() as $row) {
        $optionalWorkdays[$row['tanggal']] = $row;
        $optionalDates[] = $row['tanggal'];
    }

    $result = [];
    foreach ($users as $user) {
        $userId = (int)$user['id'];
        $gender = $user['jenis_kelamin'];
        $userOverrides = $overridesByUser[$userId] ?? [];

        $workdayDates = [];
        foreach ($dateRange as $date) {
            $dayOfWeek = (int)date('w', strtotime($date));
            $isWeekend = ($dayOfWeek === 0 || $dayOfWeek === 6);
            $holiday = $holidaysByDate[$date] ?? null;

            if (isset($userOverrides[$date]) && $isWeekend) {
                $isWorkday = $userOverrides[$date] === 1;
            } elseif (isset($optionalWorkdays[$date])) {
                $isWorkday = false;
            } else {
                $isSpecialWorkday = gpw_is_special_workday($holiday);
                $isWorkday = $isSpecialWorkday || (!$holiday && gpw_is_regular_workday_dow($dayOfWeek, $workdayDays));
            }

            if ($isWorkday) {
                $workdayDates[] = $date;
            }
        }

        $result[$userId] = [
            'user_id' => $userId,
            'nama' => $user['nama'],
            'gender' => $gender,
            'total_workdays' => count($workdayDates),
            'workday_dates' => $workdayDates,
        ];
    }

    sendResponse(true, 'Data hari kerja semua guru berhasil diambil', [
        'start_date' => $startDate,
        'end_date' => $endDate,
        'optional_dates' => $optionalDates,
        'optional_workdays' => $optionalWorkdays,
        'teachers' => $result,
    ]);
} catch (PDOException $e) {
    handleError($e, 'teachers_workdays.php - GET');
}

sendResponse(false, 'Invalid request method');
