# Catatan Deploy — Geo Presensi PKBM Tunas Ilmu

## Repo & Git

- **Repo baru:** https://github.com/miqbalputra/pkbm-geo-presence.git
- Branch `main`, **1 commit bersih** (`7aa8fc3` "Initial commit: Geo Presensi PKBM Tunas Ilmu") — tanpa riwayat lama era Griya Quran.
- 126 file, **tanpa file sensitif** (dump lama `geogqpresence.sql`, `.env`, credential, `node_modules`, `dist` semua di-gitignore & tidak ikut).
- Remote baru `pkbm` ditambah sebagai remote terpisah; `origin` lama (`presensi-guru`) tetap utuh.
- `database.sql` sudah ikut repo (skema + seed PKBM + index performa).

Catatan git lokal:
- `main` lokal sekarang 2 commit di depan `origin` lama — aman dibiarkan.
- Jika ingin lokal `main` dilacak ke repo baru: `git branch --set-upstream-to=pkbm/main main` (riwayat lokal berbeda dari repo baru, butuh `--force` untuk sink — sebaiknya tidak, kecuali memang mau pindah total).

## Database siap-import (`database.sql`)

- Kompatibel **MySQL 8 & MariaDB 10.x** (collation `utf8mb4_unicode_ci` — MariaDB-friendly, jejak lebih ringan).
- 11 tabel lengkap sesuai yang dipakai API:
  `users`, `attendance_logs`, `activity_logs`, `settings`, `holidays`,
  `optional_workdays`, `user_weekend_overrides`, `remember_tokens`,
  `location_tracks`, `webhook_config`, `webhook_logs`.
- Tabel `jadwal_piket` sengaja **tidak dibuat** (sudah digantikan rotasi dwi-pekanan).
- 34 setting ter-seed dengan default PKBM (`workday_days=6`, rotasi piket, dll.).
- Index performa sudah digabung (tanggal_id, tanggal_status, role_nama, waktu_id, webhook_created_at).

### Login default (ganti password segera)

| Username | Password  | Peran            |
|----------|-----------|------------------|
| admin    | admin123  | admin            |
| kepsek   | admin123  | kepala sekolah   |
| guru1    | admin123  | guru (contoh)    |

(+ `guru2`/`guru3` contoh, sudah diberi `piket_group` A/B.)

- Koordinat sekolah & `qr_secret` = **nilai contoh** (bukan produksi) — sesuaikan via menu Pengaturan setelah login.

## Langkah deploy Coolify (ringkas — detail di COOLIFY.md)

1. **Buat DB MySQL 8** di Coolify → import `database.sql` (via phpMyAdmin/CLI).
2. **Buat app** dari repo `miqbalputra/pkbm-geo-presence`, Build Pack **Dockerfile**, port **80**.
3. **Env vars:**
   - `DB_HOST`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_TIMEZONE=+07:00`
   - `APP_URL`, `APP_TIMEZONE=Asia/Jakarta`, `CORS_ALLOWED_ORIGINS`, `N8N_API_KEY`
   - Opsional: `GOOGLE_CLIENT_ID`, `GOWA_WEBHOOK_URL`, `GOWA_USERNAME`, `GOWA_PASSWORD`
4. **Setelah deploy pertama:**
   - Matikan mode testing: `UPDATE settings SET setting_value='0' WHERE setting_key='mode_testing';`
   - Ganti password admin (dan akun contoh).
   - Sesuaikan koordinat sekolah & `qr_secret` di Pengaturan.
5. **Cron reminder** (opsional): `curl -fsS https://geo.pkbmtunasilmu.web.id/api/webhook_reminder_direct.php` jam 08:00 / 09:00 / 10:00 WIB (butuh env `GOWA_*` + `webhook_config.enabled=1`; varian n8n: `webhook_reminder.php`).
6. **Healthcheck** bawaan: `/api/health.php`.

## Status verifikasi

Belum teruji end-to-end (tidak ada MySQL/PHP runtime saat catatan ini dibuat).
Validasi yang sudah dilakukan:
- Build Vite lulus (frontend kompilasi OK).
- `php -l` bersih untuk semua file PHP yang diubah.
- Struktur `database.sql` dicek: 11 tabel, 34 settings unik, FK konsisten.
- **Code review menyeluruh** (backend + frontend + deploy/DB) sudah dilakukan; temuan kritis diperbaiki:
  - `presensi.php`: variabel salah `$piketRow` → `$piket` (PIKET_RESTRICTION pulang).
  - `attendance_service.php`: `gp_validate_workday` kini meneruskan `userId` agar override hari kerja per-guru berlaku saat presensi (sebelumnya hanya di laporan).
  - `teachers_workdays.php`: hapus state mati `$nonWorkdayDates`.
  - `settings.php`: pekan 1-4 saja untuk grup A/B (pekan ke-5 via `piket_week5_mode`); frontend `Pengaturan.jsx` disamakan.
  - `DownloadLaporan.jsx`: perbaiki false "Terlambat Piket" (banding jam HH:MM) + perhitungan pekan tahan zona waktu.
  - File debug (`debug_simple.php`, `debug_workdays.php`) diblokir di image produksi (`.dockerignore` + `Dockerfile` + `Caddyfile`) — sebelumnya bocor data guru tanpa auth.
  - `config.php`: default produksi DB diubah dari legacy (`geogqpresence`/`geopresensi`/`mysql`) ke `pkbm_presence`/`pkbm_user`/`mariadb`.

Sebelum deploy produksi: uji import `database.sql` ke 1 DB MariaDB 11.4 kosong + login `admin` sekali di staging.