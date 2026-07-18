<?php
require_once 'config.php';
require_once 'workday_service.php';

$method = $_SERVER['REQUEST_METHOD'];

// Check date endpoint bisa diakses tanpa auth (untuk cek hari libur)
if ($method === 'GET' && isset($_GET['check'])) {
    // Public endpoint - tidak perlu auth
} else if (in_array($method, ['POST', 'PUT', 'DELETE'])) {
    // Write operations - hanya admin
    requireAuth(['admin', 'kepala_sekolah']);
} else {
    // Read operations - admin dan guru
    requireAuth(['admin', 'guru']);
}

// CHECK IF DATE IS HOLIDAY (harus dicek duluan sebelum GET ALL)
if ($method === 'GET' && isset($_GET['check'])) {
    try {
        $tanggal = $_GET['check'];
        
        // Validasi format tanggal
        if (!validateDate($tanggal)) {
            sendResponse(false, 'Format tanggal tidak valid');
        }
        
        $dateStatus = gpw_get_date_status($pdo, $tanggal, $_GET['jenis_kelamin'] ?? null);
        $holiday = $dateStatus['holiday'];
        $dayOfWeek = $dateStatus['dayOfWeek'];
        
        $response = [
            'tanggal' => $tanggal,
            'isHoliday' => $holiday ? true : false,
            'isWeekend' => $dateStatus['isWeekend'],
            'isWeekendWorkday' => $dateStatus['isWeekendWorkday'],
            'isWorkday' => $dateStatus['isWorkday'],
            'jamMasukKhusus' => $holiday ? $holiday['jam_masuk_khusus'] : null,
            'holidayName' => $holiday ? $holiday['nama'] : null,
            'holidayType' => $holiday ? $holiday['jenis'] : null,
            'dayName' => ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][$dayOfWeek]
        ];
        
        sendResponse(true, 'Pengecekan hari berhasil', $response);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// GET ALL HOLIDAYS
if ($method === 'GET' && !isset($_GET['id']) && !isset($_GET['check'])) {
    try {
        $query = "SELECT * FROM holidays WHERE 1=1";
        $params = [];
        
        // Filter by tanggal
        if (isset($_GET['tanggal'])) {
            $query .= " AND tanggal = ?";
            $params[] = $_GET['tanggal'];
        }
        
        // Filter by date range
        if (isset($_GET['start_date']) && isset($_GET['end_date'])) {
            $query .= " AND tanggal BETWEEN ? AND ?";
            $params[] = $_GET['start_date'];
            $params[] = $_GET['end_date'];
        }
        
        // Filter by year
        if (isset($_GET['year'])) {
            $query .= " AND YEAR(tanggal) = ?";
            $params[] = $_GET['year'];
        }
        
        $query .= " ORDER BY tanggal ASC";
        
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $holidays = $stmt->fetchAll();
        
        sendResponse(true, 'Data hari libur berhasil diambil', $holidays);
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// CREATE HOLIDAY (Admin only)
if ($method === 'POST') {
    $data = getRequestData();
    
    try {
        // Mode bulk rentang tanggal
        if (!empty($data['start_date']) && !empty($data['end_date'])) {
            $startDate = $data['start_date'];
            $endDate = $data['end_date'];
            
            if (!validateDate($startDate) || !validateDate($endDate)) {
                sendResponse(false, 'Format tanggal tidak valid');
            }
            
            if ($startDate > $endDate) {
                sendResponse(false, 'Tanggal awal tidak boleh lebih besar dari tanggal akhir');
            }
            
            $allowedTypes = ['nasional', 'cuti_bersama', 'sekolah'];
            $jenis = $data['jenis'] ?? 'nasional';
            if (!in_array($jenis, $allowedTypes)) {
                sendResponse(false, 'Jenis libur tidak valid');
            }
            
            $stmt = $pdo->prepare("
                INSERT INTO holidays (tanggal, nama, jenis, keterangan, is_workday, jam_masuk_khusus)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    nama = VALUES(nama),
                    jenis = VALUES(jenis),
                    keterangan = VALUES(keterangan),
                    is_workday = VALUES(is_workday),
                    jam_masuk_khusus = VALUES(jam_masuk_khusus)
            ");
            
            $count = 0;
            foreach (gpw_build_date_range($startDate, $endDate) as $date) {
                $stmt->execute([
                    $date,
                    $data['nama'],
                    $jenis,
                    $data['keterangan'] ?? null,
                    $data['isWorkday'] ?? 0,
                    $data['jamMasukKhusus'] ?? null
                ]);
                $count++;
            }
            
            sendResponse(true, "{$count} hari libur berhasil ditambahkan dari {$startDate} sampai {$endDate}");
            exit();
        }
        
        // Single date mode
        // Validasi input
        if (empty($data['tanggal']) || empty($data['nama'])) {
            sendResponse(false, 'Tanggal dan nama harus diisi');
        }
        
        // Validasi format tanggal
        if (!validateDate($data['tanggal'])) {
            sendResponse(false, 'Format tanggal tidak valid');
        }
        
        // Validasi jenis
        $allowedTypes = ['nasional', 'cuti_bersama', 'sekolah'];
        $jenis = $data['jenis'] ?? 'nasional';
        if (!in_array($jenis, $allowedTypes)) {
            sendResponse(false, 'Jenis libur tidak valid');
        }
        
        $stmt = $pdo->prepare("
            INSERT INTO holidays (tanggal, nama, jenis, keterangan, is_workday, jam_masuk_khusus)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $data['tanggal'],
            $data['nama'],
            $jenis,
            $data['keterangan'] ?? null,
            $data['isWorkday'] ?? 0,
            $data['jamMasukKhusus'] ?? null
        ]);
        
        sendResponse(true, 'Hari libur berhasil ditambahkan', ['id' => $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) {
            sendResponse(false, 'Tanggal sudah ada dalam daftar hari libur');
        } else {
            handleError($e, 'holidays.php - create');
        }
    }
}

// UPDATE HOLIDAY (Admin only)
if ($method === 'PUT') {
    $data = getRequestData();
    
    try {
        $stmt = $pdo->prepare("
            UPDATE holidays SET 
                tanggal = ?, nama = ?, jenis = ?, keterangan = ?,
                is_workday = ?, jam_masuk_khusus = ?
            WHERE id = ?
        ");
        
        $stmt->execute([
            $data['tanggal'],
            $data['nama'],
            $data['jenis'],
            $data['keterangan'],
            $data['isWorkday'] ?? 0,
            $data['jamMasukKhusus'] ?? null,
            $data['id']
        ]);
        
        sendResponse(true, 'Hari libur berhasil diupdate');
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

// DELETE HOLIDAY (Admin only)
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    
    if (!$id) {
        sendResponse(false, 'ID hari libur harus diisi');
    }
    
    try {
        $stmt = $pdo->prepare("DELETE FROM holidays WHERE id = ?");
        $stmt->execute([$id]);
        
        sendResponse(true, 'Hari libur berhasil dihapus');
    } catch (PDOException $e) {
        sendResponse(false, 'Error: ' . $e->getMessage());
    }
}

sendResponse(false, 'Invalid request');
?>
