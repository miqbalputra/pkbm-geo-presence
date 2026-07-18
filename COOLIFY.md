# Deploy Geo Presensi PKBM Tunas Ilmu di Coolify

Repo ini siap deploy sebagai Docker image berbasis **FrankenPHP classic mode**. Coolify cukup pull repo GitHub dan build dari `Dockerfile`. Frontend (React/Vite) di-build saat pembuatan image, jadi tidak perlu commit folder `dist/`.

---

## 1. Buat Database & Import

Di Coolify, buat service database **MariaDB 11.4 LTS** (skema `database.sql` pakai collation `utf8mb4_unicode_ci` yang kompatibel; MariaDB dipilih karena lebih ringan dari MySQL).

Import **`database.sql`** (sudah ikut repo, bersih — bukan data produksi) ke database via phpMyAdmin / SQL console Coolify:

```bash
# contoh via CLI (sesuaikan user/host/db)
mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < database.sql
```

Setelah import, aplikasi langsung bisa dipakai. Login default (ganti password segera):

| Username | Password   | Peran            |
|----------|------------|------------------|
| admin    | admin123   | admin            |
| kepsek   | admin123   | kepala sekolah   |
| guru1    | admin123   | guru (contoh)    |

Skema `database.sql` sudah mencakup semua tabel + index performa, jadi **tidak perlu** menjalankan migration tambahan untuk install baru.

Untuk produksi, matikan mode testing GPS (contoh awal diset `1` agar mudah uji):

```sql
UPDATE settings SET setting_value = '0' WHERE setting_key = 'mode_testing';
```

## 2. Buat Application

1. Repository: `https://github.com/miqbalputra/pkbm-geo-presence.git`
2. Build Pack: **Dockerfile**.
3. Port aplikasi: `80`.
4. Domain: arahkan ke domain/subdomain presensi.

## 3. Environment Variables

Isi variable berikut di Coolify:

```env
APP_ENV=production
APP_URL=https://geo.pkbmtunasilmu.web.id
APP_TIMEZONE=Asia/Jakarta
CORS_ALLOWED_ORIGINS=https://geo.pkbmtunasilmu.web.id

DB_HOST=nama-service-mysql-atau-host-internal
DB_PORT=3306
DB_NAME=pkbm_presence
DB_USER=user_database
DB_PASS=password_database
DB_TIMEZONE=+07:00

N8N_API_KEY=isi-dengan-random-key-yang-kuat
```

Opsional jika memakai webhook WhatsApp direct (GOWA):

```env
GOWA_WEBHOOK_URL=
GOWA_USERNAME=
GOWA_PASSWORD=
```

Opsional untuk mengaktifkan Login Google (Sign in with Google):

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

Client ID didapat dari [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
Cukup set **satu env var runtime** ini (tidak perlu build arg). Frontend mengambil
Client ID dari endpoint `/api/google_config.php` saat halaman login dimuat.
Jangan lupa tambahkan URL aplikasi ke **Authorized JavaScript origins** di Google Cloud.

Frontend di dalam Docker default memakai `VITE_API_URL=/api`, jadi API berjalan same-origin dan tidak perlu URL API berbeda.

## 4. Cron Reminder WhatsApp

Jika fitur reminder dipakai, buat scheduled task di Coolify (atau cron VPS) yang memanggil endpoint reminder. Ada dua varian — pilih sesuai mekanisme pengiriman:

**A. Direct GOWA (rekomendasi, tanpa n8n)** — butuh env `GOWA_WEBHOOK_URL`, `GOWA_USERNAME`, `GOWA_PASSWORD` (lihat `env_deploy.md`) + `webhook_config.enabled=1`:

```bash
curl -fsS https://geo.pkbmtunasilmu.web.id/api/webhook_reminder_direct.php
```

**B. Via n8n relay** — butuh `webhook_config.n8n_webhook_url` terisi (di tabel `webhook_config`) + `webhook_config.enabled=1`:

```bash
curl -fsS https://geo.pkbmtunasilmu.web.id/api/webhook_reminder.php
```

Jalankan pada jam `08:00`, `09:00`, dan `10:00` WIB. Kedua varian memerlukan baris `webhook_config` (id=1) aktif (`enabled=1`); aktifkan via phpMyAdmin bila perlu.

## 5. Catatan Keamanan

- Endpoint debug/reset/import lama sudah dikeluarkan dari image production (lihat `Dockerfile`).
- Credential database & API key harus disimpan di environment variable Coolify, bukan di file PHP.
- `geogqpresence.sql` (dump lama berisi data produksi) **sengaja di-gitignore** dan tidak ikut repo. Untuk install baru cukup pakai `database.sql`.
- Runtime production memakai FrankenPHP classic mode dengan OPcache aktif.

## 6. Healthcheck

Image Docker punya healthcheck bawaan ke `/api/health.php` — mengecek runtime FrankenPHP/PHP dan koneksi MySQL ringan (`SELECT 1`). Jika Coolify menampilkan container unhealthy, cek env database (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`) dan pastikan service MySQL berjalan.