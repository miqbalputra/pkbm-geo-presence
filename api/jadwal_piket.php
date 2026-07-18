<?php
require_once 'config.php';
require_once 'workday_service.php';
require_once 'attendance_service.php';

$method = $_SERVER['REQUEST_METHOD'];

// Penulisan (POST/PUT/PATCH/DELETE) hanya admin; baca (GET) admin+guru.
if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
    requireAuth(['admin', 'kepala_sekolah']);
} else {
    requireAuth(['admin', 'guru']);
}

/**
 * Apakah sebuah grup (A/B) piket pada pekan tertentu, sesuai setting rotasi.
 */
function gpj_is_group_piket($settings, $group, $week)
{
    if ($group !== 'A' && $group !== 'B') {
        return false;
    }
    if ($week >= 5) {
        $mode = $settings['piket_week5_mode'] ?? 'all';
        if ($mode === 'none') {
            return false;
        }
        if ($mode === 'A') {
            return $group === 'A';
        }
        if ($mode === 'B') {
            return $group === 'B';
        }
        return true; // 'all' (default) -> semua guru
    }
    $weeks = gp_parse_piket_weeks(
        $group === 'A'
            ? ($settings['piket_group_a_weeks'] ?? '1,3')
            : ($settings['piket_group_b_weeks'] ?? '2,4')
    );
    return in_array($week, $weeks, true);
}

/**
 * Daftar guru yang piket pada tanggal tertentu (rotasi dwi-pekanan).
 * Mengembalikan array: [{ user_id, nama_guru, piket_group, jam_piket, jam_pulang_piket }]
 */
function gpj_piket_users_for_date($pdo, $date)
{
    $settings = gp_get_piket_rotation_settings($pdo);
    if (!gpw_bool_setting($settings['piket_rotation_enabled'] ?? '1')) {
        return [];
    }
    $week = gp_week_of_month($date);
    $jamMasuk = substr($settings['piket_jam_masuk'] ?? '07:00', 0, 5);
    $jamPulang = substr($settings['piket_jam_pulang'] ?? '13:00', 0, 5);

    $stmt = $pdo->prepare("SELECT id, nama, piket_group, jenis_kelamin FROM users WHERE role = 'guru' AND archived_at IS NULL ORDER BY nama ASC");
    $stmt->execute();

    $out = [];
    foreach ($stmt->fetchAll() as $u) {
        if (gpj_is_group_piket($settings, $u['piket_group'], $week)) {
            $out[] = [
                'user_id' => (int)$u['id'],
                'nama_guru' => $u['nama'],
                'piket_group' => $u['piket_group'],
                'jam_piket' => $jamMasuk,
                'jam_pulang_piket' => $jamPulang,
            ];
        }
    }
    return $out;
}

// GET ?today=1 -> status piket hari ini (kompatibel dgn GuruHome: response.data.jadwal)
if ($method === 'GET' && isset($_GET['today'])) {
    try {
        date_default_timezone_set('Asia/Jakarta');
        $today = date('Y-m-d');
        $hariInggris = date('l');
        $hariIndonesia = [
            'Monday' => 'Senin', 'Tuesday' => 'Selasa', 'Wednesday' => 'Rabu',
            'Thursday' => 'Kamis', 'Friday' => 'Jumat', 'Saturday' => 'Sabtu', 'Sunday' => 'Minggu'
        ];
        $hari = $hariIndonesia[$hariInggris];

        $jadwal = gpj_piket_users_for_date($pdo, $today);
        $userId = (int)($_SESSION['user_id'] ?? 0);
        $mine = null;
        foreach ($jadwal as $j) {
            if ((int)$j['user_id'] === $userId) {
                $mine = $j;
                break;
            }
        }

        sendResponse(true, 'Piket hari ini berhasil diambil', [
            'hari' => $hari,
            'tanggal' => $today,
            'week_of_month' => gp_week_of_month($today),
            'jadwal' => $jadwal,
            'mine' => $mine,
            'isPiketToday' => $mine ? true : false,
        ]);
    } catch (PDOException $e) {
        handleError($e, 'jadwal_piket.php - today');
    }
}

// GET (default) -> overview rotasi piket (config + daftar guru + piket hari ini)
if ($method === 'GET') {
    try {
        date_default_timezone_set('Asia/Jakarta');
        $today = date('Y-m-d');
        $settings = gp_get_piket_rotation_settings($pdo);
        $week = gp_week_of_month($today);

        // Grup mana saja yang piket pekan ini
        $groupsToday = [];
        if (gpw_bool_setting($settings['piket_rotation_enabled'] ?? '1')) {
            if (gpj_is_group_piket($settings, 'A', $week)) $groupsToday[] = 'A';
            if (gpj_is_group_piket($settings, 'B', $week)) $groupsToday[] = 'B';
        }

        $stmt = $pdo->prepare("SELECT id, nama, piket_group, jenis_kelamin, username FROM users WHERE role = 'guru' AND archived_at IS NULL ORDER BY nama ASC");
        $stmt->execute();
        $guru = [];
        foreach ($stmt->fetchAll() as $u) {
            $guru[] = [
                'user_id' => (int)$u['id'],
                'nama' => $u['nama'],
                'username' => $u['username'],
                'piket_group' => $u['piket_group'],
                'jenis_kelamin' => $u['jenis_kelamin'],
            ];
        }

        sendResponse(true, 'Konfigurasi rotasi piket berhasil diambil', [
            'config' => [
                'piket_rotation_enabled' => $settings['piket_rotation_enabled'] ?? '1',
                'piket_group_a_weeks' => $settings['piket_group_a_weeks'] ?? '1,3',
                'piket_group_b_weeks' => $settings['piket_group_b_weeks'] ?? '2,4',
                'piket_week5_mode' => $settings['piket_week5_mode'] ?? 'all',
                'piket_jam_masuk' => substr($settings['piket_jam_masuk'] ?? '07:00', 0, 5),
                'piket_jam_pulang' => substr($settings['piket_jam_pulang'] ?? '13:00', 0, 5),
            ],
            'today' => [
                'tanggal' => $today,
                'day_name' => ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][(int)date('w')],
                'week_of_month' => $week,
                'groups_piket' => $groupsToday,
            ],
            'guru' => $guru,
            'piket_today' => gpj_piket_users_for_date($pdo, $today),
        ]);
    } catch (PDOException $e) {
        handleError($e, 'jadwal_piket.php - overview');
    }
}

// Penulisan (POST/PUT/PATCH/DELETE) tidak digunakan lagi — piket diatur via
// rotasi (menu Pengaturan) & penugasan grup per guru (menu Data Guru / Rotasi Piket).
if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
    sendResponse(false, 'Piket diatur lewat rotasi dwi-pekanan. Konfigurasi via menu Pengaturan, penugasan grup via menu Data Guru / Rotasi Piket.');
}

sendResponse(false, 'Invalid request');
?>