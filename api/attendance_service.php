<?php
require_once __DIR__ . '/workday_service.php';

function gp_map_attendance_record($record)
{
    if (!$record) {
        return null;
    }

    $record['userId'] = $record['user_id'];
    $record['jamMasuk'] = $record['jam_masuk'];
    $record['jamPulang'] = $record['jam_pulang'];
    $record['jamHadir'] = $record['jam_hadir'];
    $record['jamIzin'] = $record['jam_izin'];
    $record['jamSakit'] = $record['jam_sakit'];
    $record['lokasiPulang'] = $record['lokasi_pulang'] ?? null;
    return $record;
}

function gp_get_attendance_by_id($pdo, $id)
{
    $stmt = $pdo->prepare("SELECT * FROM attendance_logs WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    return gp_map_attendance_record($stmt->fetch());
}

function gp_write_activity($pdo, $user, $activity, $status)
{
    try {
        $stmt = $pdo->prepare("INSERT INTO activity_logs (user, aktivitas, status) VALUES (?, ?, ?)");
        $stmt->execute([$user, $activity, $status]);
    } catch (Exception $e) {
        // Activity log tidak boleh menggagalkan presensi utama.
    }
}

function gp_get_settings($pdo, $keys)
{
    if (empty($keys)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $stmt = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ({$placeholders})");
    $stmt->execute($keys);

    $settings = [];
    foreach ($stmt->fetchAll() as $row) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
    return $settings;
}

function gp_get_guru($pdo, $userId)
{
    $stmt = $pdo->prepare("
        SELECT id, nama, jenis_kelamin, tipe_guru, pokjar
        FROM users
        WHERE id = ? AND role = 'guru' AND archived_at IS NULL
        LIMIT 1
    ");
    $stmt->execute([$userId]);
    return $stmt->fetch();
}

function gp_calculate_distance($lat1, $lon1, $lat2, $lon2)
{
    $earthRadius = 6371000;
    $latDiff = deg2rad($lat2 - $lat1);
    $lonDiff = deg2rad($lon2 - $lon1);

    $a = sin($latDiff / 2) * sin($latDiff / 2) +
        cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
        sin($lonDiff / 2) * sin($lonDiff / 2);
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

    return round($earthRadius * $c);
}

function gp_get_setting_coordinate($settings, $latKey, $lonKey)
{
    if (!isset($settings[$latKey], $settings[$lonKey])) {
        return null;
    }

    if (!validateCoordinates($settings[$latKey], $settings[$lonKey])) {
        return null;
    }

    return [
        'lat' => (float)$settings[$latKey],
        'lon' => (float)$settings[$lonKey]
    ];
}

function gp_add_location_target(&$targets, $label, $coord)
{
    if (!$coord) {
        return;
    }

    $key = $coord['lat'] . ',' . $coord['lon'];
    if (isset($targets[$key])) {
        return;
    }

    $targets[$key] = [
        'label' => $label,
        'lat' => $coord['lat'],
        'lon' => $coord['lon']
    ];
}

function gp_get_attendance_location_targets($settings, $user, $date, $isCheckout = false)
{
    $targets = [];
    $school = gp_get_setting_coordinate($settings, 'sekolah_latitude', 'sekolah_longitude');
    $apel = gp_get_setting_coordinate($settings, 'lokasi_apel_latitude', 'lokasi_apel_longitude');

    $isMonday = date('w', strtotime($date)) == 1;
    if ($isMonday && ($settings['apel_senin_enabled'] ?? '0') == '1') {
        gp_add_location_target($targets, 'Lokasi Apel Senin', $apel ?: $school);
    }

    gp_add_location_target($targets, 'Lokasi Sekolah', $school);
    gp_add_location_target($targets, 'Area Guru Laki-laki', gp_get_setting_coordinate($settings, 'lokasi_laki_latitude', 'lokasi_laki_longitude'));
    gp_add_location_target($targets, 'Area Guru Perempuan', gp_get_setting_coordinate($settings, 'lokasi_perempuan_latitude', 'lokasi_perempuan_longitude'));

    return array_values($targets);
}

function gp_enforce_attendance_location($settings, $user, $latitude, $longitude, $date, $isCheckout = false)
{
    if (($settings['mode_testing'] ?? '0') == '1') {
        return;
    }

    // Guru Pokjar: mode presensi sederhana tanpa aturan GPS — boleh presensi
    // dari mana saja. Di frontend tombol QR tidak ditampilkan untuk Pokjar,
    // pengecualian ini berlaku sebagai defense-in-depth bila endpoint QR
    // dipanggil dengan sesi Pokjar.
    if (!empty($user['pokjar'])) {
        return;
    }

    if (!validateCoordinates($latitude, $longitude)) {
        sendResponse(false, 'Koordinat GPS tidak valid');
    }

    $targets = gp_get_attendance_location_targets($settings, $user, $date, $isCheckout);
    if (empty($targets)) {
        sendResponse(false, 'Lokasi presensi belum dikonfigurasi. Hubungi admin.');
    }

    $radius = (int)($settings['radius_gps'] ?? 100);
    $nearestDistance = null;
    $nearestLabel = '';
    $allowedLabels = [];

    foreach ($targets as $target) {
        $distance = gp_calculate_distance((float)$latitude, (float)$longitude, $target['lat'], $target['lon']);
        $allowedLabels[] = $target['label'];

        if ($distance <= $radius) {
            return;
        }

        if ($nearestDistance === null || $distance < $nearestDistance) {
            $nearestDistance = $distance;
            $nearestLabel = $target['label'];
        }
    }

    $areaLabel = implode(' / ', array_unique($allowedLabels));
    $distanceText = $nearestDistance === null ? '-' : $nearestDistance . 'm';
    sendResponse(false, "Anda berada di luar area {$areaLabel}. Jarak terdekat: {$distanceText} dari {$nearestLabel}, Maksimal: {$radius}m");
}

/**
 * Cek apakah koordinat berada di dalam radius salah satu lokasi presensi.
 * Mengembalikan true jika di dalam radius (atau mode testing aktif), false jika di luar.
 * Tidak memblokir (tidak memanggil sendResponse) — dipakai untuk presensi pulang
 * agar guru yang lupa pulang tetap bisa checkout dari luar sekolah (ditandai 'luar').
 */
function gp_is_in_attendance_radius($settings, $latitude, $longitude, $date, $isCheckout = false)
{
    if (!validateCoordinates($latitude, $longitude)) {
        return false;
    }
    if (($settings['mode_testing'] ?? '0') == '1') {
        return true;
    }

    $targets = gp_get_attendance_location_targets($settings, null, $date, $isCheckout);
    if (empty($targets)) {
        return false;
    }

    $radius = (int)($settings['radius_gps'] ?? 100);
    foreach ($targets as $target) {
        $distance = gp_calculate_distance((float)$latitude, (float)$longitude, $target['lat'], $target['lon']);
        if ($distance <= $radius) {
            return true;
        }
    }
    return false;
}

/**
 * Pastikan kolom lokasi_pulang ada di attendance_logs (idempoten, sekali per request).
 * Menyimpan penanda 'sekolah'/'luar' saat presensi pulang.
 */
function gp_ensure_checkout_location_column($pdo)
{
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_logs' AND COLUMN_NAME = 'lokasi_pulang'");
        $stmt->execute();
        if ((int)$stmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE attendance_logs ADD COLUMN lokasi_pulang VARCHAR(16) NULL DEFAULT NULL COMMENT 'sekolah|luar — lokasi saat presensi pulang'");
        }
    } catch (Exception $e) {
        // abaikan — kolom mungkin sudah ada atau gagal dienvoironment read-only
    }
    $ensured = true;
}

function gp_day_name($date)
{
    $days = [
        'Monday' => 'Senin',
        'Tuesday' => 'Selasa',
        'Wednesday' => 'Rabu',
        'Thursday' => 'Kamis',
        'Friday' => 'Jumat',
        'Saturday' => 'Sabtu',
        'Sunday' => 'Minggu'
    ];
    return $days[date('l', strtotime($date))] ?? 'Senin';
}

function gp_get_holiday($pdo, $date)
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

function gp_validate_workday($pdo, $date, $gender = null, $userId = null)
{
    // UserId diteruskan agar override hari kerja per-guru (user_weekend_overrides)
    // berlaku saat validasi presensi — bukan hanya di laporan workday.
    $status = gpw_get_date_status($pdo, $date, $gender, $userId);
    $holiday = $status['holiday'];
    $isWeekend = $status['isWeekend'];
    $isSpecialWorkday = $status['isSpecialWorkday'];

    if (!$status['isWorkday']) {
        $message = $holiday
            ? 'Tidak dapat melakukan presensi pada hari libur: ' . $holiday['nama']
            : 'Tidak dapat melakukan presensi pada hari weekend untuk kelompok Anda';
        sendResponse(false, $message);
    }

    return [$holiday, $isSpecialWorkday];
}

/**
 * Nomor pekan dalam bulan (1..5). Pekan 1 = tanggal 1-7, pekan 2 = 8-14, dst.
 * Dipakai untuk rotasi piket dwi-pekanan Sabtu (PKBM Tunas Ilmu).
 */
function gp_week_of_month($date)
{
    $day = (int)date('j', strtotime($date));
    return (int)floor(($day - 1) / 7) + 1;
}

/**
 * Setting rotasi piket dwi-pekanan dari tabel settings.
 */
function gp_get_piket_rotation_settings($pdo)
{
    $keys = [
        'piket_rotation_enabled',
        'piket_group_a_weeks',
        'piket_group_b_weeks',
        'piket_week5_mode',
        'piket_jam_masuk',
        'piket_jam_pulang',
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

/**
 * Parse CSV pekan ("1,3") menjadi array int [1,3].
 */
function gp_parse_piket_weeks($value)
{
    $out = [];
    foreach (preg_split('/[\s,]+/', (string)$value) as $part) {
        $part = trim($part);
        if ($part === '') {
            continue;
        }
        $n = (int)$part;
        if ($n >= 1 && $n <= 5) {
            $out[] = $n;
        }
    }
    return $out;
}

/**
 * Apakah guru (userId) piket pada tanggal $date, berdasarkan rotasi dwi-pekanan:
 *   - Guru grup A piket Sabtu pekan sesuai setting `piket_group_a_weeks` (default 1,3)
 *   - Guru grup B piket Sabtu pekan sesuai setting `piket_group_b_weeks` (default 2,4)
 *   - Pekan ke-5 mengikuti `piket_week5_mode` (all|none|A|B), default 'all'
 *   - Jam masuk/pulang piket dari setting `piket_jam_masuk` / `piket_jam_pulang`
 *
 * Mengembalikan array ['jam_piket'=>..., 'jam_pulang_piket'=>...] bila piket, atau null.
 * Sumber tunggal — dipakai gp_get_checkin_target, gp_checkout_attendance, guru_home.
 */
function gp_get_piket($pdo, $userId, $date)
{
    $settings = gp_get_piket_rotation_settings($pdo);

    // Rotasi piket nonaktif -> tidak ada piket.
    if (!gpw_bool_setting($settings['piket_rotation_enabled'] ?? '1')) {
        return null;
    }

    $stmt = $pdo->prepare("SELECT piket_group, pokjar FROM users WHERE id = ? LIMIT 1");
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    // Guru Pokjar tidak ikut rotasi piket (mode presensi sederhana).
    if ($row && !empty($row['pokjar'])) {
        return null;
    }

    $group = $row ? $row['piket_group'] : null;

    // Guru belum diberi grup piket.
    if ($group !== 'A' && $group !== 'B') {
        return null;
    }

    $week = gp_week_of_month($date);
    if ($week >= 5) {
        $mode = $settings['piket_week5_mode'] ?? 'all';
        if ($mode === 'none') {
            $isPiket = false;
        } elseif ($mode === 'A') {
            $isPiket = ($group === 'A');
        } elseif ($mode === 'B') {
            $isPiket = ($group === 'B');
        } else {
            // 'all' (default) -> semua guru piket
            $isPiket = true;
        }
    } else {
        $weeks = gp_parse_piket_weeks(
            $group === 'A'
                ? ($settings['piket_group_a_weeks'] ?? '1,3')
                : ($settings['piket_group_b_weeks'] ?? '2,4')
        );
        $isPiket = in_array($week, $weeks, true);
    }

    if (!$isPiket) {
        return null;
    }

    return [
        'jam_piket' => substr($settings['piket_jam_masuk'] ?? '07:00', 0, 5),
        'jam_pulang_piket' => substr($settings['piket_jam_pulang'] ?? '13:00', 0, 5),
    ];
}

function gp_get_checkin_target($pdo, $userId, $date, $settings, $holiday, $isSpecialWorkday)
{
    $hariIni = gp_day_name($date);
    $piket = null;
    $jamMasukTarget = $settings['jam_masuk_normal'] ?? '07:20';
    $piketLabel = '';

    if ($isSpecialWorkday && !empty($holiday['jam_masuk_khusus'])) {
        return [substr($holiday['jam_masuk_khusus'], 0, 5), ' (Event: ' . $holiday['nama'] . ')', null];
    }

    $piket = gp_get_piket($pdo, $userId, $date);

    if ($hariIni === 'Senin') {
        if (($settings['apel_senin_enabled'] ?? '0') == '1') {
            if ($piket) {
                $jamMasukTarget = $piket['jam_piket'];
                $piketLabel = ' (Piket Apel)';
            } else {
                $jamMasukTarget = '07:00';
                $piketLabel = ' (Apel Senin)';
            }
        } elseif ($piket) {
            $jamMasukTarget = '07:00';
            $piketLabel = ' (Piket)';
        }
    } elseif ($piket) {
        $jamMasukTarget = $piket['jam_piket'];
        $piketLabel = ' (Piket)';
    }

    return [$jamMasukTarget, $piketLabel, $piket];
}

function gp_create_attendance($pdo, $options)
{
    $user = $options['user'];
    $date = $options['date'] ?? date('Y-m-d');
    $time = $options['time'] ?? date('H:i:s');
    $requestedStatus = $options['status'] ?? 'hadir';
    $keterangan = $options['keterangan'] ?? '';
    $method = $options['method'] ?? 'manual';
    $preserveStatus = !empty($options['preserve_status']);
    $izinTime = $options['jam_izin'] ?? $time;
    $sakitTime = $options['jam_sakit'] ?? $time;

    if (!validateDate($date)) {
        sendResponse(false, 'Format tanggal tidak valid');
    }

    $stmt = $pdo->prepare("SELECT id FROM attendance_logs WHERE user_id = ? AND tanggal = ? LIMIT 1");
    $stmt->execute([$user['id'], $date]);
    if ($stmt->fetch()) {
        sendResponse(false, 'Anda sudah melakukan presensi hari ini.');
    }

    [$holiday, $isSpecialWorkday] = gp_validate_workday($pdo, $date, $user['jenis_kelamin'] ?? null, $user['id'] ?? null);
    $settings = gp_get_settings($pdo, ['jam_masuk_normal', 'toleransi_terlambat', 'apel_senin_enabled']);

    $status = $requestedStatus;
    $jamMasuk = null;
    $jamHadir = null;
    $jamIzin = null;
    $jamSakit = null;

    if ($preserveStatus) {
        if (in_array($requestedStatus, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true)) {
            $jamMasuk = $time;
            $jamHadir = $time;
        } elseif ($requestedStatus === 'izin') {
            $jamIzin = $izinTime;
        } elseif ($requestedStatus === 'sakit') {
            $jamSakit = $sakitTime;
        }
    } elseif (in_array($requestedStatus, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true)) {
        $jamMasuk = $time;
        $jamHadir = $time;

        $isPartime = ($user['tipe_guru'] ?? '') === 'partime';
        $isPokjar = !empty($user['pokjar']);
        if ($isPartime || $isPokjar) {
            // Guru partime & guru Pokjar: tidak ada perhitungan terlambat.
            // Guru Pokjar hanya mencatat kehadiran (Hadir/Sakit/Izin).
            $status = 'hadir';
            // Default keterangan hanya untuk partime murni (bukan pokjar).
            if ($isPartime && !$isPokjar) {
                $keterangan = $keterangan ?: 'Guru Partime';
            }
        } else {
            [$jamMasukTarget, $piketLabel] = gp_get_checkin_target($pdo, $user['id'], $date, $settings, $holiday, $isSpecialWorkday);
            $targetMinutes = gp_time_to_minutes($jamMasukTarget);
            $actualMinutes = gp_time_to_minutes($time);
            $lateMinutes = $actualMinutes - $targetMinutes;

            if ($lateMinutes > 0) {
                $status = 'hadir_terlambat';
                $toleransi = (int)($settings['toleransi_terlambat'] ?? 15);
                $severity = $lateMinutes > $toleransi ? ' (Parah)' : '';
                $keterangan = "Terlambat {$lateMinutes} menit{$severity}{$piketLabel}";
            } else {
                $status = 'hadir';
            }
        }
    } elseif ($requestedStatus === 'izin') {
        $jamIzin = $izinTime;
    } elseif ($requestedStatus === 'sakit') {
        $jamSakit = $sakitTime;
    }

    $stmt = $pdo->prepare("
        INSERT INTO attendance_logs
        (user_id, nama, tanggal, status, jam_masuk, jam_pulang, jam_hadir, jam_izin, jam_sakit, keterangan, latitude, longitude, metode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $user['id'],
        $user['nama'],
        $date,
        $status,
        $jamMasuk,
        null,
        $jamHadir,
        $jamIzin,
        $jamSakit,
        $keterangan,
        $options['latitude'] ?? null,
        $options['longitude'] ?? null,
        $method
    ]);

    $insertId = $pdo->lastInsertId();
    gp_write_activity($pdo, $user['nama'], $method === 'qr_scan' ? 'Presensi QR Scan' : 'Input Presensi', ucfirst(str_replace('_', ' ', $status)));

    return gp_get_attendance_by_id($pdo, $insertId);
}

function gp_checkout_attendance($pdo, $options)
{
    $record = $options['record'];
    $date = $record['tanggal'] ?? date('Y-m-d');
    $time = $options['time'] ?? date('H:i:s');
    $izinPulangAwal = !empty($options['izin_pulang_awal']);
    $reason = trim($options['keterangan'] ?? '');
    $method = $options['method'] ?? 'manual';

    // Ambil data guru lebih awal: guru Pokjar tidak menggunakan presensi pulang
    // (mode sederhana: hanya Hadir/Sakit/Izin). Penolakan backend sebagai
    // defense-in-depth meski tombol pulang disembunyikan di frontend.
    $user = gp_get_guru($pdo, $record['user_id']);
    if (!$user) {
        sendResponse(false, 'Data guru tidak ditemukan');
    }
    if (!empty($user['pokjar'])) {
        sendResponse(false, 'Guru Pokjar tidak menggunakan presensi pulang.');
    }

    if (!in_array($record['status'], ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true)) {
        sendResponse(false, 'Presensi pulang hanya tersedia untuk status hadir.');
    }

    if (!empty($record['jam_pulang']) && $record['jam_pulang'] !== '-' && $record['jam_pulang'] !== '00:00:00') {
        sendResponse(false, 'Anda sudah melakukan presensi pulang!');
    }

    $minPulangFormatted = '12:30';
    $minPulangMinutes = gp_get_min_pulang_minutes($pdo, $minPulangFormatted);
    $nowMinutes = gp_time_to_minutes(date('H:i'));
    if ($nowMinutes < $minPulangMinutes && ($_SESSION['role'] ?? '') !== 'admin') {
        sendResponse(false, 'Presensi pulang hanya bisa dilakukan mulai pukul ' . $minPulangFormatted . ' WIB');
    }

    [$holiday, $isSpecialWorkday] = gp_validate_workday($pdo, $date, $user['jenis_kelamin'] ?? null, $user['id'] ?? null);

    gp_ensure_checkout_location_column($pdo);

    // Tentukan lokasi pulang (sekolah/luar). Tidak memblokir — guru yang lupa
    // pulang tetap bisa checkout dari luar sekolah, ditandai 'luar'.
    $lokasiPulang = $options['lokasi_pulang'] ?? null;
    if ($method === 'qr_scan') {
        // QR scan sudah menegaskan geofence di qr_scan.php, jadi dianggap di sekolah.
        $lokasiPulang = 'sekolah';
    } elseif (!empty($options['validate_location'])) {
        $settings = gp_get_settings($pdo, [
            'sekolah_latitude', 'sekolah_longitude', 'radius_gps', 'mode_testing',
            'lokasi_laki_latitude', 'lokasi_laki_longitude',
            'lokasi_perempuan_latitude', 'lokasi_perempuan_longitude',
            'lokasi_apel_latitude', 'lokasi_apel_longitude',
            'apel_senin_enabled'
        ]);
        if (!validateCoordinates($options['latitude'] ?? null, $options['longitude'] ?? null)) {
            sendResponse(false, 'Koordinat GPS diperlukan untuk presensi pulang');
        }
        if (($settings['mode_testing'] ?? '0') == '1') {
            $lokasiPulang = $lokasiPulang ?: 'sekolah';
        } elseif (gp_is_in_attendance_radius($settings, $options['latitude'], $options['longitude'], $date, true)) {
            $lokasiPulang = 'sekolah';
        } else {
            // Di luar radius: harapkan deklarasi guru (popup). Default 'luar' (lupa).
            $lokasiPulang = in_array($lokasiPulang, ['sekolah', 'luar'], true) ? $lokasiPulang : 'luar';
        }
    } else {
        $lokasiPulang = $lokasiPulang ?: 'sekolah';
    }

    $piket = gp_get_piket($pdo, $record['user_id'], $date);

    if (!$isSpecialWorkday && $piket && !empty($piket['jam_pulang_piket'])) {
        $targetMinutes = gp_time_to_minutes($piket['jam_pulang_piket']);
        $actualMinutes = gp_time_to_minutes($time);

        if ($actualMinutes < $targetMinutes && !$izinPulangAwal) {
            sendResponse(false, 'PIKET_RESTRICTION|' . substr($piket['jam_pulang_piket'], 0, 5));
        }
    }

    $keterangan = $record['keterangan'] ?? '';
    if ($izinPulangAwal && strpos($keterangan, 'Izin Pulang Awal Piket') === false) {
        $suffix = '(Izin Pulang Awal Piket' . ($reason ? ' | Alasan: ' . $reason : '') . ')';
        $keterangan = trim(($keterangan ? $keterangan . ' ' : '') . $suffix);
    }
    if ($lokasiPulang === 'luar' && strpos($keterangan, 'Pulang di Luar Sekolah') === false) {
        $marker = '(Pulang di Luar Sekolah - Lupa)';
        $keterangan = trim(($keterangan ? $keterangan . ' ' : '') . $marker);
    }

    $stmt = $pdo->prepare("
        UPDATE attendance_logs
        SET jam_pulang = ?, keterangan = ?, lokasi_pulang = ?, updated_at = NOW()
        WHERE id = ?
    ");
    $stmt->execute([$time, $keterangan, $lokasiPulang, $record['id']]);

    gp_write_activity(
        $pdo,
        $record['nama'],
        $method === 'qr_scan' ? 'Presensi Pulang (Smart QR)' : 'Presensi Pulang',
        $izinPulangAwal ? 'Pulang (Izin Awal)' : 'Pulang'
    );

    return gp_get_attendance_by_id($pdo, $record['id']);
}

function gp_time_to_minutes($time)
{
    $parts = explode(':', $time);
    return ((int)$parts[0] * 60) + (int)($parts[1] ?? 0);
}

/**
 * Ambil batas minimal jam presensi pulang (menit sejak 00:00) dari settings.
 * Default 12:30 = 750 menit. Dipakai oleh tombol pulang & QR scan pulang.
 */
function gp_get_min_pulang_minutes($pdo, &$formatted = null)
{
    $settings = gp_get_settings($pdo, ['jam_min_pulang']);
    $value = $settings['jam_min_pulang'] ?? '12:30';
    $formatted = substr($value, 0, 5);
    return gp_time_to_minutes($formatted);
}
?>
