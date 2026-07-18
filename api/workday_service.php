<?php

function gpw_bool_setting($value)
{
    return in_array(strtolower((string)$value), ['1', 'true', 'yes', 'on'], true);
}

/**
 * Daftar hari kerja reguler (0=Minggu .. 6=Sabtu) dari setting `workday_days`.
 * Default '6' (Sabtu saja) — sesuai aturan PKBM Tunas Ilmu yang belajar hanya Sabtu.
 * Admin dapat mengubahnya di menu Pengaturan (mis. '6' atau '1,6').
 */
function gpw_get_workday_days($pdo)
{
    $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'workday_days' LIMIT 1");
    $stmt->execute();
    $row = $stmt->fetch();
    $raw = $row ? trim((string)$row['setting_value']) : '';
    if ($raw === '') {
        return [6];
    }
    $days = [];
    foreach (preg_split('/[\s,]+/', $raw) as $part) {
        $part = trim($part);
        if ($part === '') {
            continue;
        }
        $n = (int)$part;
        if ($n >= 0 && $n <= 6) {
            $days[] = $n;
        }
    }
    return $days ?: [6];
}

/**
 * Apakah hari (day-of-week) termasuk hari kerja reguler menurut `workday_days`.
 */
function gpw_is_regular_workday_dow($dayOfWeek, $workdayDays)
{
    return in_array((int)$dayOfWeek, $workdayDays, true);
}

function gpw_weekend_workday_enabled($pdo)
{
    $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'weekend_workday_enabled' LIMIT 1");
    $stmt->execute();
    $row = $stmt->fetch();
    return $row ? gpw_bool_setting($row['setting_value']) : false;
}

function gpw_normalize_gender($gender)
{
    $value = strtolower(trim((string)$gender));
    if ($value === 'laki-laki' || $value === 'laki laki' || $value === 'male') {
        return 'male';
    }
    if ($value === 'perempuan' || $value === 'female') {
        return 'female';
    }
    return null;
}

function gpw_get_weekend_workday_settings($pdo)
{
    $keys = [
        'weekend_workday_enabled',
        'saturday_male_workday_enabled',
        'saturday_female_workday_enabled',
        'sunday_male_workday_enabled',
        'sunday_female_workday_enabled'
    ];
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $stmt = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ({$placeholders})");
    $stmt->execute($keys);

    $settings = [];
    foreach ($stmt->fetchAll() as $row) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
    return $settings;
}

function gpw_weekend_workday_allowed($settings, $dayOfWeek, $gender = null)
{
    $normalizedGender = gpw_normalize_gender($gender);
    $specificKeys = [
        'saturday_male_workday_enabled',
        'saturday_female_workday_enabled',
        'sunday_male_workday_enabled',
        'sunday_female_workday_enabled'
    ];
    $hasSpecificSettings = count(array_intersect($specificKeys, array_keys($settings))) > 0;

    if (!$hasSpecificSettings) {
        return gpw_bool_setting($settings['weekend_workday_enabled'] ?? '0');
    }

    if ($dayOfWeek === 6) {
        if ($normalizedGender === 'male') {
            return gpw_bool_setting($settings['saturday_male_workday_enabled'] ?? '0');
        }
        if ($normalizedGender === 'female') {
            return gpw_bool_setting($settings['saturday_female_workday_enabled'] ?? '0');
        }
        return gpw_bool_setting($settings['saturday_male_workday_enabled'] ?? '0')
            || gpw_bool_setting($settings['saturday_female_workday_enabled'] ?? '0');
    }

    if ($dayOfWeek === 0) {
        if ($normalizedGender === 'male') {
            return gpw_bool_setting($settings['sunday_male_workday_enabled'] ?? '0');
        }
        if ($normalizedGender === 'female') {
            return gpw_bool_setting($settings['sunday_female_workday_enabled'] ?? '0');
        }
        return gpw_bool_setting($settings['sunday_male_workday_enabled'] ?? '0')
            || gpw_bool_setting($settings['sunday_female_workday_enabled'] ?? '0');
    }

    return false;
}

function gpw_get_holiday($pdo, $date)
{
    $stmt = $pdo->prepare("
        SELECT tanggal, nama, jenis, is_workday, jam_masuk_khusus
        FROM holidays
        WHERE tanggal = ?
        LIMIT 1
    ");
    $stmt->execute([$date]);
    return $stmt->fetch();
}

function gpw_is_special_workday($holiday)
{
    // Libur sekolah dianggap libur total, bukan hari masuk khusus.
    // Hanya hari libur dengan is_workday=1 yang dianggap special workday (event/rapat).
    return $holiday && ((int)$holiday['is_workday'] === 1);
}

function gpw_get_user_weekend_override($pdo, $userId, $date)
{
    $stmt = $pdo->prepare("
        SELECT is_workday, keterangan
        FROM user_weekend_overrides
        WHERE user_id = ? AND tanggal = ?
        LIMIT 1
    ");
    $stmt->execute([$userId, $date]);
    return $stmt->fetch();
}

function gpw_is_optional_workday($pdo, $date)
{
    $stmt = $pdo->prepare("
        SELECT id, tanggal, nama, keterangan
        FROM optional_workdays
        WHERE tanggal = ?
        LIMIT 1
    ");
    $stmt->execute([$date]);
    return $stmt->fetch();
}

function gpw_get_date_status($pdo, $date, $gender = null, $userId = null)
{
    $holiday = gpw_get_holiday($pdo, $date);
    $dayOfWeek = (int)date('w', strtotime($date));
    $isWeekend = ($dayOfWeek === 0 || $dayOfWeek === 6);
    $weekendSettings = gpw_get_weekend_workday_settings($pdo);
    $isWeekendWorkday = $isWeekend && gpw_weekend_workday_allowed($weekendSettings, $dayOfWeek, $gender);
    $isSpecialWorkday = gpw_is_special_workday($holiday);
    $workdayDays = gpw_get_workday_days($pdo);

        // Override per user mengalahkan aturan `workday_days` untuk hari Sabtu/Minggu
        $override = null;
        if ($isWeekend && $userId !== null) {
            $override = gpw_get_user_weekend_override($pdo, $userId, $date);
            if ($override) {
                $isWorkday = (int)$override['is_workday'] === 1;
            } else {
                $isWorkday = $isSpecialWorkday || (!$holiday && gpw_is_regular_workday_dow($dayOfWeek, $workdayDays));
            }
        } else {
            $isWorkday = $isSpecialWorkday || (!$holiday && gpw_is_regular_workday_dow($dayOfWeek, $workdayDays));
        }

    return [
        'holiday' => $holiday,
        'dayOfWeek' => $dayOfWeek,
        'isWeekend' => $isWeekend,
        'isWeekendWorkday' => $isWeekendWorkday,
        'gender' => gpw_normalize_gender($gender),
        'isSpecialWorkday' => $isSpecialWorkday,
        'isWorkday' => $isWorkday,
        'override' => $override
    ];
}

function gpw_build_date_range($start, $end)
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

function gpw_get_workday_dates($pdo, $start, $end, $gender = null, $userId = null)
{
    $stmt = $pdo->prepare("
        SELECT tanggal, jenis, is_workday
        FROM holidays
        WHERE tanggal BETWEEN ? AND ?
    ");
    $stmt->execute([$start, $end]);

    $holidays = [];
    foreach ($stmt->fetchAll() as $holiday) {
        $holidays[$holiday['tanggal']] = $holiday;
    }

    $userOverrides = [];
    if ($userId !== null) {
        $overrideStmt = $pdo->prepare("
            SELECT tanggal, is_workday
            FROM user_weekend_overrides
            WHERE user_id = ? AND tanggal BETWEEN ? AND ?
        ");
        $overrideStmt->execute([$userId, $start, $end]);
        foreach ($overrideStmt->fetchAll() as $row) {
            $userOverrides[$row['tanggal']] = (int)$row['is_workday'];
        }
    }

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

    $weekendSettings = gpw_get_weekend_workday_settings($pdo);
    $workdayDays = gpw_get_workday_days($pdo);

    // Guru tidak wajib presensi sebelum akunnya dibuat. Ambil created_at user
    // (jika ada) agar hari kerja sebelum akun ada tidak dihitung (menghindari
    // alfa retroaktif bagi guru yang baru di-import).
    $createdAtDate = null;
    if ($userId !== null && $userId !== false) {
        $cs = $pdo->prepare("SELECT created_at FROM users WHERE id = ? LIMIT 1");
        $cs->execute([$userId]);
        $cu = $cs->fetch();
        if (!empty($cu['created_at'])) {
            $createdAtDate = substr($cu['created_at'], 0, 10);
        }
    }

    $workdays = [];
    foreach (gpw_build_date_range($start, $end) as $date) {
        $holiday = $holidays[$date] ?? null;
        $dayOfWeek = (int)date('w', strtotime($date));
        $isWeekend = in_array($dayOfWeek, [0, 6], true);

        // Override per user mengalahkan aturan `workday_days`
        if (isset($userOverrides[$date]) && $isWeekend) {
            $isWorkday = $userOverrides[$date] === 1;
        } else {
            $isSpecialWorkday = gpw_is_special_workday($holiday);
            $isWorkday = $isSpecialWorkday || (!$holiday && gpw_is_regular_workday_dow($dayOfWeek, $workdayDays));
        }

        // Lewati hari kerja sebelum akun guru dibuat.
        if ($isWorkday && $createdAtDate !== null && $date < $createdAtDate) {
            $isWorkday = false;
        }

        if ($isWorkday) {
            $workdays[] = $date;
        }
    }

    return [
        'workdays' => $workdays,
        'optional_workdays' => $optionalWorkdays,
    ];
}
?>
