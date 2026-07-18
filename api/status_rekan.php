<?php
require_once 'config.php';

requireAuth(['guru']);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, 'Invalid request method');
}

try {
    $today = date('Y-m-d');
    $currentUserId = (int)($_SESSION['user_id'] ?? 0);

    $stmt = $pdo->prepare("
        SELECT
            u.id,
            u.nama,
            u.jabatan,
            a.status,
            a.jam_masuk,
            a.jam_pulang,
            a.jam_hadir
        FROM users u
        LEFT JOIN attendance_logs a ON a.user_id = u.id AND a.tanggal = ?
        WHERE u.role = 'guru'
          AND u.archived_at IS NULL
          AND u.id <> ?
        ORDER BY u.nama ASC
    ");
    $stmt->execute([$today, $currentUserId]);
    $rows = $stmt->fetchAll();

    $order = [
        'hadir' => 0,
        'hadir_terlambat' => 1,
        'hadir_izin_terlambat' => 2,
        'sudah_pulang' => 3,
        'izin' => 4,
        'sakit' => 5,
        'belum' => 6
    ];

    $statusList = [];
    foreach ($rows as $row) {
        $statusFinal = $row['status'] ?: 'belum';
        $jamMasuk = $row['jam_masuk'] ?: ($row['jam_hadir'] ?: '-');
        $jamPulang = $row['jam_pulang'] ?: null;

        if (
            in_array($statusFinal, ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'], true) &&
            !empty($jamPulang)
        ) {
            $statusFinal = 'sudah_pulang';
        }

        if (!empty($row['jabatan'])) {
            $jabatan = json_decode($row['jabatan'], true);
            $row['jabatan'] = is_array($jabatan) ? $jabatan : [$row['jabatan']];
        } else {
            $row['jabatan'] = [];
        }

        $statusList[] = [
            'id' => (int)$row['id'],
            'nama' => $row['nama'],
            'jabatan' => $row['jabatan'],
            'statusFinal' => $statusFinal,
            'statusAsli' => $row['status'] ?: 'belum',
            'jamMasuk' => $jamMasuk,
            'jamPulang' => $jamPulang,
            'sortOrder' => $order[$statusFinal] ?? 9
        ];
    }

    usort($statusList, function ($a, $b) {
        if ($a['sortOrder'] === $b['sortOrder']) {
            return strcmp($a['nama'], $b['nama']);
        }
        return $a['sortOrder'] <=> $b['sortOrder'];
    });

    foreach ($statusList as &$item) {
        unset($item['sortOrder']);
    }
    unset($item);

    sendResponse(true, 'Status rekan guru berhasil diambil', [
        'tanggal' => $today,
        'items' => $statusList
    ]);
} catch (PDOException $e) {
    handleError($e, 'status_rekan.php');
}
?>
