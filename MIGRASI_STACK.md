# Migrasi stack Presensi PKBM Tunas Ilmu

Frontend baru menggunakan React 19, TypeScript, Vite, dan Tailwind CSS 4. API baru menggunakan Go 1.25, Fiber, GORM, dan MySQL 8.4. SQLite hanya dipakai untuk pengembangan lokal. API PHP tetap ada pada route kompatibilitas Go; berkas PHP dan frontend PHP lama disimpan untuk rollback.

## Jaminan data dan aturan PKBM

- Database PKBM aktif tetap menjadi sumber kebenaran. Jangan arahkan Go ke database aktif sebelum restore staging, rekonsiliasi tabel, laporan, akun, serta uji UAT lulus.
- Jangan mengimpor `database.sql` ke database aktif. File tersebut hanya untuk instalasi baru; migrasi pada Go hanya menambah tabel/kolom/index yang belum ada dan mencatat versinya.
- Migrasi mempertahankan ID pengguna/presensi, hash password bcrypt, dan relasi. Login Go memverifikasi format hash PHP `$2y$` yang lama.
- `workday_days` yang sudah tersimpan dipakai apa adanya. Nilai kosong/tidak tersedia berarti Sabtu saja (`6`). Hari libur, hari kerja opsional, override guru, pekan rotasi A/B, mode pekan kelima, dan pengecualian Pokjar tetap berlaku.
- Akun Pokjar tetap memakai mode sederhana: Hadir/Izin/Sakit, tanpa Gmail wajib, GPS, keterlambatan, QR, rotasi piket, atau presensi pulang.

## Backup dan pemulihan staging

Gunakan MySQL 8.4 staging baru yang terisolasi dari host dan kredensial database produksi. Pastikan file backup tidak masuk Git.

```powershell
New-Item -ItemType Directory -Force .\staging\backup | Out-Null
$sourceDb = Read-Host 'Nama database PKBM aktif yang sudah diverifikasi'
mysqldump --single-transaction --routines --triggers --events --hex-blob --default-character-set=utf8mb4 --result-file=.\staging\backup\pkbm-pre-migration.sql $sourceDb
Get-FileHash .\staging\backup\pkbm-pre-migration.sql -Algorithm SHA256
```

Dump sengaja dibuat tanpa opsi `--databases`, jadi SQL tidak membawa perintah `CREATE DATABASE` atau `USE`; nama sumber tidak akan menimpa nama database staging. Simpan output checksum bersama catatan cutover. Buat `deploy/staging.env` dari `deploy/staging.env.example`; gunakan nama database, user, password, URL, OAuth, JWT, n8n, dan webhook staging yang terpisah. Jangan menyalin rahasia produksi ke staging. Siapkan autentikasi `mysqldump` melalui client option file terlindungi atau mekanisme kredensial aman host Anda; jangan menaruh kata sandi di perintah atau Git.

```powershell
docker compose --env-file .\deploy\staging.env -f .\docker-compose.migration.yml up -d mysql
docker compose --env-file .\deploy\staging.env -f .\docker-compose.migration.yml cp .\staging\backup\pkbm-pre-migration.sql mysql:/tmp/pkbm-pre-migration.sql
docker compose --env-file .\deploy\staging.env -f .\docker-compose.migration.yml exec -T mysql sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --database="$MYSQL_DATABASE" < /tmp/pkbm-pre-migration.sql'
docker compose --env-file .\deploy\staging.env -f .\docker-compose.migration.yml up -d app
```

Sebelum meluncurkan versi baru, catat jumlah baris setiap tabel dan rentang ID; bandingkan akun, hash password (tanpa mencetaknya), presensi per status/bulan, hari libur, pengaturan, jadwal, override, lokasi, webhook, log, dan tabel integritas. Bandingkan laporan lama dan baru pada periode yang sama serta jalankan `npm run test:reconciliation` terhadap snapshot presensi sebelum/sesudah. Ulangi startup/migrasi Go sekali lagi dan pastikan jumlah serta checksum data bisnis tidak berubah. Bila ada selisih, hentikan cutover dan pulihkan backup staging.

## Validasi dan rollback

```powershell
npm run typecheck
npm run build
npm run test:reconciliation
Set-Location .\backend
go test ./...
go vet ./...
Set-Location ..
npm run verify:staging
```

Di staging, uji login setiap role, GPS/geofence, QR, masuk/pulang, ekspor PDF/XLSX, integrasi n8n/Hermes/webhook, laporan Pokjar, dan kalender Sabtu (hari libur, hari opsional, override guru, grup A/B dan pekan ke-5, Pokjar, serta perhitungan alfa). Jalankan `scripts/verify-staging.mjs` dengan `STAGING_URL` mengarah ke staging. Produksi tetap memakai `Dockerfile` Go setelah rekonsiliasi/UAT lulus. `Dockerfile.legacy` membangun ulang PHP + frontend lama bila rollback diperlukan; arahkan kembali deployment ke image PHP dan database yang sama, tanpa mengimpor ulang dump.

Lingkungan kerja ini belum memiliki Docker, `mysql`, atau `mysqldump`; karena itu backup/restore MySQL 8.4 dan UAT staging harus dijalankan pada host staging yang memiliki tool tersebut. Tidak ada database produksi yang diubah oleh pekerjaan migrasi ini.
