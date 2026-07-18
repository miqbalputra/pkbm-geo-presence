<?php
// Simple version endpoint without requiring config.php to avoid CORS/session issues
header('Content-Type: application/json; charset=UTF-8');
echo json_encode([
    'success' => true,
    'message' => 'Deployment version info',
    'data' => [
        'version' => 'manual-check',
        'php_time' => date('Y-m-d H:i:s'),
        'teacher_workdays_role' => ['admin', 'kepala_sekolah', 'guru'],
        'optional_workdays_role' => ['admin', 'kepala_sekolah', 'guru']
    ]
]);
exit();
