<?php
require_once 'config.php';
require_once 'workday_service.php';
require_once 'attendance_service.php';

requireAuth(['guru']);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, 'Invalid request method');
}

try {
    $userId = $_SESSION['user_id'];
    $today = date('Y-m-d');

    $userStmt = $pdo->prepare("SELECT jenis_kelamin FROM users WHERE id = ? AND role = 'guru' LIMIT 1");
    $userStmt->execute([$userId]);
    $currentUser = $userStmt->fetch();

    $settingsStmt = $pdo->prepare("SELECT setting_key, setting_value FROM settings");
    $settingsStmt->execute();
    $settingsRows = $settingsStmt->fetchAll();
    $settings = [];
    foreach ($settingsRows as $row) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }

    $dateStatus = gpw_get_date_status($pdo, $today, $currentUser['jenis_kelamin'] ?? null);
    $holiday = $dateStatus['holiday'];
    $dayOfWeek = $dateStatus['dayOfWeek'];
    $holidayData = [
        'tanggal' => $today,
        'isHoliday' => $holiday ? true : false,
        'isWeekend' => $dateStatus['isWeekend'],
        'isWeekendWorkday' => $dateStatus['isWeekendWorkday'],
        'isWorkday' => $dateStatus['isWorkday'],
        'jamMasukKhusus' => $holiday ? $holiday['jam_masuk_khusus'] : null,
        'holidayName' => $holiday ? $holiday['nama'] : null,
        'holidayType' => $holiday ? $holiday['jenis'] : null,
        'dayName' => ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][$dayOfWeek]
    ];

    $attendanceStmt = $pdo->prepare("
        SELECT id, user_id, nama, tanggal, status, jam_masuk, jam_pulang, jam_hadir,
               jam_izin, jam_sakit, keterangan, latitude, longitude, metode,
               created_at, updated_at
        FROM attendance_logs
        WHERE user_id = ? AND tanggal = ?
        LIMIT 1
    ");
    $attendanceStmt->execute([$userId, $today]);
    $attendance = $attendanceStmt->fetch();
    if ($attendance) {
        $attendance['userId'] = $attendance['user_id'];
        $attendance['jamMasuk'] = $attendance['jam_masuk'];
        $attendance['jamPulang'] = $attendance['jam_pulang'];
        $attendance['jamHadir'] = $attendance['jam_hadir'];
        $attendance['jamIzin'] = $attendance['jam_izin'];
        $attendance['jamSakit'] = $attendance['jam_sakit'];
    }

    $hariInggris = date('l');
    $hariIndonesia = [
        'Monday' => 'Senin',
        'Tuesday' => 'Selasa',
        'Wednesday' => 'Rabu',
        'Thursday' => 'Kamis',
        'Friday' => 'Jumat',
        'Saturday' => 'Sabtu',
        'Sunday' => 'Minggu'
    ];
    $hari = $hariIndonesia[$hariInggris];

    // Piket hari ini dihitung dari rotasi dwi-pekanan (gp_get_piket),
    // bukan dari tabel jadwal_piket per-hari lama.
    $myPiket = gp_get_piket($pdo, $userId, $today);

    sendResponse(true, 'Data dashboard guru berhasil diambil', [
        'today' => $today,
        'settings' => $settings,
        'holiday' => $holidayData,
        'attendance' => $attendance ?: null,
        'piket' => [
            'hari' => $hari,
            'mine' => $myPiket,
            'isPiketToday' => $myPiket ? true : false
        ]
    ]);
} catch (PDOException $e) {
    handleError($e, 'guru_home.php');
}
?>
