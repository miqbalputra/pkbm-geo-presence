# Environment Variables — Deploy Coolify (Geo Presensi PKBM Tunas Ilmu)

Daftar env aplikasi (app container, deploy dari repo publik `miqbalputra/pkbm-geo-presence`) yang diisi di Coolify. Domain produksi: **https://geo.pkbmtunasilmu.web.id**.

Database memakai **MariaDB 11.4 LTS** (service di Coolify, persistent storage otomatis ke `/var/lib/mysql`).

---

## Wajib (tanpa ini app tidak jalan / tidak aman)

```env
APP_ENV=production
APP_URL=https://geo.pkbmtunasilmu.web.id
APP_TIMEZONE=Asia/Jakarta
CORS_ALLOWED_ORIGINS=https://geo.pkbmtunasilmu.web.id

DB_HOST=mariadb
DB_PORT=3306
DB_NAME=pkbm_presence
DB_USER=pkbm_user
DB_PASS=<password-kuat-yang-dibuat-di-coolify>
DB_TIMEZONE=+07:00

N8N_API_KEY=<random-string-panjang-untuk-api-key>
```

### Catatan penting
- **`DB_HOST=mariadb`** → isi nama service MariaDB di Coolify (default `mariadb`), **bukan** `mysql`, **bukan** IP publik. App & DB harus di project/environment Coolify yang sama supaya hostname internal konek. Jangan expose port DB ke publik.
- **`DB_NAME` / `DB_USER` / `DB_PASS`** → sesuai yang di-set saat buat service MariaDB. User itu harus punya akses ke database `pkbm_presence` (database di-import dari `database.sql`).
- **`N8N_API_KEY`** → dipakai endpoint Hermes/n8n (header `X-API-Key`). Juga dipakai sebagai fallback `HERMES_API_KEY`. Generate string acak ~40+ char.
- **`APP_ENV=production`** → wajib agar detail error tidak terekspose (`security.php` membaca env ini, bukan host hardcode).

---

## Opsional — Login Google (Sign in with Google)

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

Tambahkan URL `https://geo.pkbmtunasilmu.web.id` ke **Authorized JavaScript origins** di Google Cloud Console. Client ID diambil frontend via `/api/google_config.php`.

---

## Opsional — Reminder WhatsApp direct (GOWA)

Dipakai jika fitur `webhook_reminder_direct.php` aktif (cron jam 08:00/09:00/10:00 WIB):

```env
GOWA_WEBHOOK_URL=<url-endpoint-gowa>
GOWA_USERNAME=<username-gowa>
GOWA_PASSWORD=<password-gowa>
```

---

## Opsional — API key terpisah untuk Hermes

```env
HERMES_API_KEY=<random-string>
```

Kalau tidak diisi, endpoint Hermes memakai `N8N_API_KEY` sebagai fallback — jadi sebenarnya cukup `N8N_API_KEY` saja.

---

## Yang TIDAK perlu di-set
- `VITE_API_URL` — frontend di Docker default sudah pakai `/api` (same-origin), tidak perlu env build.
- Credential di file PHP — semua sudah env-driven via `api/config.php`, jangan hardcode.

---

## Setelah deploy pertama

1. Matikan mode testing GPS via phpMyAdmin/CLI:
   ```sql
   UPDATE settings SET setting_value='0' WHERE setting_key='mode_testing';
   ```
2. Ganti password admin (`admin` / `admin123`) → login → menu Akun / Data Guru.
3. Sesuaikan koordinat sekolah & `qr_secret` (masih nilai contoh) di menu Pengaturan.

---

## Ringkas
- **Wajib:** 9 env (APP_ENV, APP_URL, APP_TIMEZONE, CORS_ALLOWED_ORIGINS, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS, DB_TIMEZONE, N8N_API_KEY — sebenarnya 11 baris, DB_TIMEZONE boleh default +07:00).
- **Opsional:** GOOGLE_CLIENT_ID, GOWA_WEBHOOK_URL, GOWA_USERNAME, GOWA_PASSWORD, HERMES_API_KEY.