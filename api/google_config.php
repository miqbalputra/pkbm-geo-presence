<?php
/**
 * Google OAuth Config (public)
 *
 * Mengembalikan Google Client ID agar frontend bisa menampilkan tombol
 * "Sign in with Google" tanpa perlu build arg. Client ID bersifat public
 * (sama seperti yang biasa ditanam di HTML), jadi aman diekspos.
 */

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Invalid request method']);
    exit;
}

$clientId = getenv('GOOGLE_CLIENT_ID');
$clientId = ($clientId === false || $clientId === '') ? '' : $clientId;

echo json_encode([
    'success' => true,
    'message' => 'OK',
    'data' => [
        'googleClientId' => $clientId,
        'enabled'        => $clientId !== '',
    ],
]);
?>