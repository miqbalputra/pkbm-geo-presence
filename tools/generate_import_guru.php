<?php
/**
 * Generator SQL import guru dari data_guru_pkbm.xlsx.
 *
 * Aturan (sesuai permintaan):
 *  - username = password = nilai kolom Username (8-digit DDMMYYYY).
 *  - semua tipe_guru = full_time.
 *  - semua bukan Pokjar (pokjar = NULL).
 *  - semua jabatan = ["Tutor"] (JSON array, sesuai frontend).
 *  - tanggal_lahir: kolom D, konversi DDMMYYYY -> YYYY-MM-DD bila perlu.
 *
 * Output: tools/import_guru_pkbm.sql
 * Jalankan di prompt MariaDB [pkbm_presence]> atau phpMyAdmin.
 */
error_reporting(E_ERROR);

$xlsx = __DIR__ . '/../data_guru_pkbm.xlsx';
$z = new ZipArchive();
if ($z->open($xlsx) !== true) { echo "fail open xlsx\n"; exit; }
$ss = $z->getFromName('xl/sharedStrings.xml');
$sheet = $z->getFromName('xl/worksheets/sheet1.xml');
$z->close();

// --- parser shared strings ---
$strings = [];
preg_match_all('#<si>(.*?)</si>#s', $ss, $si);
foreach ($si[1] as $s) {
    if (preg_match_all('#<t[^>]*>(.*?)</t>#s', $s, $ts)) {
        $strings[] = implode('', array_map(fn($x) => html_entity_decode($x, ENT_QUOTES), $ts[1]));
    } else {
        $strings[] = '';
    }
}
function colIdx($ref) {
    if (!preg_match('/^([A-Z]+)(\d+)$/', $ref, $m)) return -1;
    $n = 0; foreach (str_split($m[1]) as $c) $n = $n * 26 + (ord($c) - 64);
    return $n - 1;
}
// --- parser sheet ---
$rr = [];
preg_match_all('#<row\b[^>]*r="(\d+)"[^>]*>(.*?)</row>#s', $sheet, $rm);
foreach ($rm[1] as $i => $rnum) {
    $body = preg_replace('#<c\b([^>]*?)/>#', '<c$1></c>', $rm[2][$i]);
    $cells = [];
    preg_match_all('#<c\b([^>]*)>(.*?)</c>#s', $body, $cm);
    foreach ($cm[1] as $ci => $attrs) {
        $inner = $cm[2][$ci];
        if (!preg_match('/r="([A-Z]+\d+)"/', $attrs, $ref)) continue;
        $t = preg_match('/t="([^"]*)"/', $attrs, $tm) ? $tm[1] : '';
        $val = '';
        if ($t === 's') { if (preg_match('#<v>(.*?)</v>#', $inner, $vm)) $val = $strings[(int)$vm[1]] ?? ''; }
        elseif ($t === 'inlineStr') { if (preg_match('#<t[^>]*>(.*?)</t>#', $inner, $vm)) $val = html_entity_decode($vm[1], ENT_QUOTES); }
        elseif (preg_match('#<v>(.*?)</v>#', $inner, $vm)) $val = $vm[1];
        $cells[colIdx($ref[1])] = $val;
    }
    $rr[(int)$rnum] = $cells;
}
ksort($rr);

// --- helpers ---
function sqlEsc($v) { return "'" . str_replace(["\\", "'"], ["\\\\", "''"], (string)$v) . "'"; }
function toISODate($v) {
    $v = trim((string)$v);
    if ($v === '') return null;
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) return $v;          // sudah ISO
    if (preg_match('/^(\d{2})(\d{2})(\d{4})$/', $v, $m)) return "$m[3]-$m[2]-$m[1]"; // DDMMYYYY -> ISO
    return null;
}
function jkMap($v) {
    $v = trim((string)$v);
    if (stripos($v, 'laki') !== false || strtoupper($v) === 'L') return 'Laki-laki';
    if (stripos($v, 'perempuan') !== false || stripos($v, 'perempu') !== false || strtoupper($v) === 'P') return 'Perempuan';
    return null;
}

$rows = [];
foreach ($rr as $rn => $c) {
    if ($rn === 1) continue; // header
    $idGuru = trim($c[1] ?? '');
    $nama = trim($c[2] ?? '');
    if ($idGuru === '' && $nama === '') continue;
    $username = trim($c[11] ?? ''); // Username
    $rows[] = [
        'id_guru' => $idGuru,
        'username' => $username !== '' ? $username : $idGuru,
        'password' => password_hash($username !== '' ? $username : $idGuru, PASSWORD_DEFAULT),
        'nama' => $nama,
        'tanggal_lahir' => toISODate($c[3] ?? ''),
        'jenis_kelamin' => jkMap($c[5] ?? ''),
        'alamat' => trim($c[6] ?? ''),
        'no_hp' => trim($c[7] ?? ''),
        'tanggal_bertugas' => toISODate($c[9] ?? ''),
    ];
}

// --- build SQL ---
$out = [];
$out[] = "-- =============================================================";
$out[] = "-- Import data guru PKBM Tunas Ilmu (dari data_guru_pkbm.xlsx)";
$out[] = "-- Dibuat: " . date('Y-m-d H:i:s');
$out[] = "-- Target DB: pkbm_presence (tabel users)";
$out[] = "--";
$out[] = "-- Aturan: username=password (8-digit DDMMYYYY), tipe_guru=full_time,";
$out[] = "--         pokjar=NULL (bukan Pokjar), jabatan=[\"Tutor\"].";
$out[] = "-- Tanggal lahir DDMMYYYY sudah dikonversi ke YYYY-MM-DD.";
$out[] = "--";
$out[] = "-- IDEMPOTEN: pakai INSERT ... SELECT WHERE NOT EXISTS,";
$out[] = "-- jadi aman dijalankan ulang (baris yang sudah ada dilewati).";
$out[] = "-- PERINGATAN: password lemah (8-digit tgl lahir). Minta guru ganti";
$out[] = "--            setelah login pertama via halaman Akun.";
$out[] = "-- =============================================================";
$out[] = "";
$out[] = "START TRANSACTION;";
$out[] = "";

foreach ($rows as $r) {
    $hash = $r['password'];
    // Pecah hash jadi concatenation agar file SQL tetap valid & tidak pecah baris
    $hashLit = sqlEsc($hash);
    $fields = "id_guru, username, password, role, nama, tanggal_lahir, jenis_kelamin, alamat, no_hp, jabatan, tanggal_bertugas, tipe_guru, piket_group, pokjar";
    $vals = implode(', ', [
        sqlEsc($r['id_guru']),
        sqlEsc($r['username']),
        $hashLit,
        "'guru'",
        sqlEsc($r['nama']),
        $r['tanggal_lahir'] ? sqlEsc($r['tanggal_lahir']) : 'NULL',
        $r['jenis_kelamin'] ? sqlEsc($r['jenis_kelamin']) : 'NULL',
        $r['alamat'] !== '' ? sqlEsc($r['alamat']) : 'NULL',
        $r['no_hp'] !== '' ? sqlEsc($r['no_hp']) : 'NULL',
        "'[\"Tutor\"]'",
        $r['tanggal_bertugas'] ? sqlEsc($r['tanggal_bertugas']) : 'NULL',
        "'full_time'",
        'NULL',  // piket_group
        'NULL',  // pokjar
    ]);
    $idg = sqlEsc($r['id_guru']);
    $usr = sqlEsc($r['username']);
    $out[] = "-- {$r['id_guru']}  {$r['nama']}  (user/pass: {$r['username']})";
    $out[] = "INSERT INTO `users` ($fields)";
    $out[] = "SELECT $vals";
    $out[] = "  FROM dual";
    $out[] = " WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE id_guru = $idg OR username = $usr);";
    $out[] = "";
}

$out[] = "COMMIT;";
$out[] = "";
$out[] = "-- Verifikasi: harus 15 baris guru tambahan";
$out[] = "SELECT id_guru, username, nama, jenis_kelamin, tipe_guru, pokjar, jabatan";
$out[] = "  FROM `users` WHERE role='guru' AND id_guru LIKE 'PKBMTI%' ORDER BY id_guru;";
$out[] = "";
$out[] = "-- (Opsional) Reset: hapus semua guru import ini jika perlu ulang";
$out[] = "-- DELETE FROM `users` WHERE id_guru LIKE 'PKBMTI%';";

file_put_contents(__DIR__ . '/import_guru_pkbm.sql', implode("\n", $out));

// --- ringkasan ke stdout ---
echo "Dibuat: tools/import_guru_pkbm.sql\n";
echo "Jumlah guru: " . count($rows) . "\n";
echo str_pad('ID', 10) . str_pad('Username', 14) . str_pad('JK', 12) . str_pad('TglLahir', 12) . "Nama\n";
echo str_repeat('-', 70) . "\n";
foreach ($rows as $r) {
    echo str_pad($r['id_guru'], 10)
       . str_pad($r['username'], 14)
       . str_pad($r['jenis_kelamin'] ?? '-', 12)
       . str_pad($r['tanggal_lahir'] ?? '-', 12)
       . $r['nama'] . "\n";
}