# Hermes Agent - PKBM Tunas Ilmu API Guide

Endpoint utama untuk Hermes Agent mengakses data presensi guru dari Geo Presensi PKBM Tunas Ilmu.

## Base URL

```
https://geo.pkbmtunasilmu.web.id/api
```

## Autentikasi

Semua endpoint Hermes memerlukan header:

```
X-API-Key: <HERMES_API_KEY atau N8N_API_KEY>
```

## 1. Cek Koneksi

```http
GET /hermes_connect.php
X-API-Key: <API_KEY>
```

Response berisi daftar endpoint dan capabilities yang tersedia.

## 2. Ambil Laporan Presensi (Recommended)

```http
GET /hermes_presensi_overview.php?period=month
X-API-Key: <API_KEY>
```

### Parameter

| Parameter | Tipe | Keterangan |
|-----------|------|------------|
| `period` | string | `today`, `yesterday`, `7days`, `14days`, `30days`, `month`, `all` |
| `start_date` | date (YYYY-MM-DD) | Rentang manual awal. Jika dipakai, `period` diabaikan. |
| `end_date` | date (YYYY-MM-DD) | Rentang manual akhir. Default = `start_date`. |
| `user_id` | integer | Filter untuk satu guru saja. |
| `include_logs` | boolean (`1`/`true`/`yes`) | Sertakan log presensi lengkap. |
| `limit` | integer (1-2000) | Batas jumlah log jika `include_logs=1`. Default 500. |

### Contoh Request

```http
GET https://geo.pkbmtunasilmu.web.id/api/hermes_presensi_overview.php?start_date=2026-06-01&end_date=2026-06-23&include_logs=1&limit=500
X-API-Key: <API_KEY>
```

### Field Response Utama

```json
{
  "success": true,
  "message": "Overview presensi Hermes berhasil diambil",
  "data": {
    "generatedAt": "2026-06-23T08:00:00+07:00",
    "period": "custom",
    "startDate": "2026-06-01",
    "endDate": "2026-06-23",
    "summary": {
      "totalGuru": 7,
      "totalHariAktif": 18,
      "totalExpected": 120,
      "totalTercatat": 115,
      "totalLogRecords": 130,
      "totalHadir": 100,
      "totalTidakHadir": 20,
      "attendanceRate": 95.8,
      "presenceRate": 83.3,
      "punctualityRate": 75.0,
      "lupaPulang": 5,
      "izinPulangAwal": 2
    },
    "statusCounts": {
      "hadir": 70,
      "hadirTerlambat": 20,
      "hadirIzinTerlambat": 10,
      "izin": 5,
      "sakit": 2,
      "alfa": 13
    },
    "belumPresensiHariIni": [
      {
        "userId": 3,
        "idGuru": "G2020001",
        "nama": "Budi Santoso",
        "tanggal": "2026-06-23",
        "noHP": "081234567890",
        "jabatan": ["Guru Matematika", "Wali Kelas 7A"]
      }
    ],
    "belumPresensiByDate": {
      "2026-06-23": [...]
    },
    "lupaPulang": [...],
    "izinPulangAwal": [...],
    "perGuru": [
      {
        "id": 3,
        "idGuru": "G2020001",
        "nama": "Budi Santoso",
        "noHP": "081234567890",
        "jabatan": ["Guru Matematika", "Wali Kelas 7A"],
        "jenisKelamin": "Laki-laki",
        "tipeGuru": null,
        "hadir": 18,
        "tepatWaktu": 15,
        "terlambat": 3,
        "izin": 1,
        "sakit": 0,
        "alfa": 1,
        "totalTercatat": 19,
        "lupaPulang": 1,
        "izinPulangAwal": 0,
        "persentaseKehadiran": 90.0,
        "totalHariAktif": 20
      }
    ],
    "excludedDates": [
      {
        "tanggal": "2026-06-23",
        "reason": "Libur Sekolah"
      }
    ],
    "logs": [...]
  }
}
```

## 3. Aturan Perhitungan yang Sama dengan Admin > Download Laporan

1. **Hari Kerja**: tanggal dalam rentang yang bukan weekend, bukan libur nasional/cuti bersama/libur sekolah, kecuali diatur khusus:
   - `is_workday=1` pada tabel holidays = hari masuk khusus (event/rapat).
   - Weekend workday per gender diaktifkan di Pengaturan.
   - Override per guru di menu **Override Weekend**.
2. **Optional Workdays**: hari kerja opsional/bonus. Hanya menambah total hari kerja jika guru hadir. Jika tidak hadir, tidak dianggap alfa.
3. **Alfa**: hari kerja wajib yang tidak memiliki presensi.
4. **Hadir**: termasuk `hadir`, `hadir_terlambat`, `hadir_izin_terlambat`.
5. **Izin/Sakit**: hanya dihitung di hari kerja wajib, tidak di optional workdays.

## 4. Rekomendasi Penggunaan Hermes

- Untuk **laporan harian**: gunakan `period=today` atau `period=yesterday`.
- Untuk **laporan mingguan/bulanan**: gunakan `period=7days`, `period=30days`, atau `period=month`.
- Untuk **peringatan guru belum presensi**: baca array `belumPresensiHariIni`.
- Untuk **detail log per guru**: tambahkan `include_logs=1&limit=500`.
- Untuk **perbandingan dengan laporan admin**: periode dan guru yang sama akan menghasilkan angka yang identik dengan **Admin > Download Laporan**.

## 5. Perbandingan dengan Download Laporan Admin

Hermes `hermes_presensi_overview.php` sekarang memakai logika yang sama persis dengan:
- `teachers_workdays.php` untuk perhitungan hari kerja per guru.
- `optional_workdays.php` untuk hari kerja opsional.
- `weekend_overrides.php` untuk override weekend per guru.

Jadi angka `totalHariAktif`, `hadir`, `izin`, `sakit`, `alfa`, dan `persentaseKehadiran` pada `perGuru` akan cocok dengan laporan yang diunduh dari **Admin > Download Laporan** untuk periode yang sama.
