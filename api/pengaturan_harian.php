<?php
/**
 * Pengaturan Harian API
 * Override jam pulang per-tanggal (kasus jarang: sekolah pulang lebih awal).
 *
 * Field:
 *   - jam_pulang_khusus        : menimpa jam_min_pulang untuk SEMUA guru tanggal tsb
 *   - jam_pulang_piket_khusus  : menimpa jadwal_piket.jam_pulang_piket untuk guru piket
 *   Keduanya punya toggle aktif (*_aktif '0'/'1'). Aktif HANYA berlaku jika aktif=1
 *   dan jam terisi; jika tidak, fallback ke nilai global/jadwal piket.
 *
 * Admin-only: GET (list), POST (upsert), DELETE (by tanggal).
 */
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
requireAuth(['admin']);

date_default_timezone_set('Asia/Jakarta');

/**
 * Normalisasi jam ke format HH:MM. Return null jika tidak valid/empty.
 */
function _gp_harian_normalize_time($value)
{
    $value = trim((string)$value);
    if ($value === '') {
        return null;
    }
    if (strlen($value) === 5) {
        $value .= ':00';
    }
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/', $value)) {
        return false; // invalid
    }
    return substr($value, 0, 5);
}

/**
 * Validasi tanggal YYYY-MM-DD.
 */
function _gp_harian_valid_date($value)
{
    $value = trim((string)$value);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return false;
    }
    [$y, $m, $d] = explode('-', $value);
    return checkdate((int)$m, (int)$d, (int)$y) ? $value : false;
}

// GET: list semua baris pengaturan harian
if ($method === 'GET') {
    try {
        $stmt = $pdo->prepare("SELECT tanggal, jam_pulang_khusus, jam_pulang_khusus_aktif,
                                      jam_pulang_piket_khusus, jam_pulang_piket_khusus_aktif,
                                      keterangan, updated_at, updated_by
                               FROM pengaturan_harian
                               ORDER BY tanggal DESC");
        $stmt->execute();
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['jam_pulang_khusus_aktif'] = (int)$r['jam_pulang_khusus_aktif'];
            $r['jam_pulang_piket_khusus_aktif'] = (int)$r['jam_pulang_piket_khusus_aktif'];
            $r['jam_pulang_khusus'] = $r['jam_pulang_khusus'] ? substr($r['jam_pulang_khusus'], 0, 5) : null;
            $r['jam_pulang_piket_khusus'] = $r['jam_pulang_piket_khusus'] ? substr($r['jam_pulang_piket_khusus'], 0, 5) : null;
        }
        unset($r);
        sendResponse(true, 'Data pengaturan harian berhasil diambil', $rows);
    } catch (PDOException $e) {
        handleError($e, 'pengaturan_harian.php GET');
    }
}

// POST: upsert satu baris per tanggal
if ($method === 'POST') {
    try {
        $data = getRequestData();

        $tanggal = _gp_harian_valid_date($data['tanggal'] ?? '');
        if (!$tanggal) {
            sendResponse(false, 'Tanggal tidak valid (format YYYY-MM-DD)');
        }

        $jamPulang = _gp_harian_normalize_time($data['jam_pulang_khusus'] ?? '');
        $jamPiket  = _gp_harian_normalize_time($data['jam_pulang_piket_khusus'] ?? '');
        if ($jamPulang === false || $jamPiket === false) {
            sendResponse(false, 'Format jam tidak valid (gunakan HH:MM)');
        }

        $aktifPulang = !empty($data['jam_pulang_khusus_aktif']) ? 1 : 0;
        $aktifPiket  = !empty($data['jam_pulang_piket_khusus_aktif']) ? 1 : 0;

        // Jika toggle aktif tapi jam kosong → tolak (tidak masuk akal).
        if ($aktifPulang && $jamPulang === null) {
            sendResponse(false, 'Jam pulang semua guru harus diisi saat diaktifkan');
        }
        if ($aktifPiket && $jamPiket === null) {
            sendResponse(false, 'Jam pulang khusus piket harus diisi saat diaktifkan');
        }

        $keterangan = trim((string)($data['keterangan'] ?? ''));
        $updatedBy  = $_SESSION['username'] ?? 'admin';

        $stmt = $pdo->prepare("
            INSERT INTO pengaturan_harian
                (tanggal, jam_pulang_khusus, jam_pulang_khusus_aktif,
                 jam_pulang_piket_khusus, jam_pulang_piket_khusus_aktif,
                 keterangan, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                jam_pulang_khusus = VALUES(jam_pulang_khusus),
                jam_pulang_khusus_aktif = VALUES(jam_pulang_khusus_aktif),
                jam_pulang_piket_khusus = VALUES(jam_pulang_piket_khusus),
                jam_pulang_piket_khusus_aktif = VALUES(jam_pulang_piket_khusus_aktif),
                keterangan = VALUES(keterangan),
                updated_by = VALUES(updated_by),
                updated_at = NOW()
        ");
        $stmt->execute([
            $tanggal,
            $jamPulang,
            $aktifPulang,
            $jamPiket,
            $aktifPiket,
            $keterangan ?: null,
            $updatedBy,
        ]);

        sendResponse(true, 'Pengaturan harian berhasil disimpan', ['tanggal' => $tanggal]);
    } catch (PDOException $e) {
        handleError($e, 'pengaturan_harian.php POST');
    }
}

// DELETE: hapus baris per tanggal
if ($method === 'DELETE') {
    try {
        $tanggal = _gp_harian_valid_date($_GET['tanggal'] ?? '');
        if (!$tanggal) {
            // fallback body
            $data = getRequestData();
            $tanggal = _gp_harian_valid_date($data['tanggal'] ?? '');
            if (!$tanggal) {
                sendResponse(false, 'Tanggal tidak valid (format YYYY-MM-DD)');
            }
        }
        $stmt = $pdo->prepare("DELETE FROM pengaturan_harian WHERE tanggal = ?");
        $stmt->execute([$tanggal]);
        sendResponse(true, 'Pengaturan harian berhasil dihapus', ['tanggal' => $tanggal]);
    } catch (PDOException $e) {
        handleError($e, 'pengaturan_harian.php DELETE');
    }
}

sendResponse(false, 'Method tidak didukung');
?>