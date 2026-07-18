<?php
error_reporting(E_ERROR);
$lines = file(__DIR__ . '/import_guru_pkbm.sql');
$checked = $okCount = 0;
foreach ($lines as $l) {
    // Baris SELECT: SELECT 'PKBMTI01', '17081994', '$2y$...', 'guru', 'Nama', ...
    if (preg_match("/^\s*SELECT\s+'(PKBMTI\d+)'\s*,\s*'(\d+)'\s*,\s*'([^']+)'/", $l, $m)) {
        $id = $m[1]; $user = $m[2]; $hash = $m[3];
        $ok = password_verify($user, $hash);
        $checked++; if ($ok) $okCount++;
        echo $id . "  user=" . $user . "  " . ($ok ? "OK" : "FAIL") . "\n";
    }
}
echo "total=$checked ok=$okCount\n";