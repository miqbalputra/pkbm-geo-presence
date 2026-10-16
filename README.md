# Presensi PKBM Tunas Ilmu

Sistem presensi guru PKBM dengan GPS/geofence, QR, mode sederhana Pokjar, laporan, dan jadwal piket.

## Stack aplikasi

- Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4.
- Backend: Go 1.25, Fiber, GORM, REST API `/api/v1`.
- Produksi/staging: MySQL 8.4. SQLite hanya untuk pengembangan lokal.
- `database.sql` adalah skema instalasi baru, bukan skrip upgrade database yang sudah berisi data.

## Pengembangan lokal

```powershell
npm ci
npm run dev
```

Untuk backend lokal SQLite, dari root repository jalankan `npm run build:local`, lalu dari folder `backend` build binary dan kembali ke root untuk menjalankan launcher:

```powershell
Set-Location backend
go build -trimpath -o build/geopresensi-local.exe ./cmd/server
Set-Location ..
.\scripts\start-local-sqlite.cmd
```

Akun seed lokal `admin` / `admin123` hanya untuk pengembangan; jangan gunakan pada produksi.

Pemeriksaan lokal:

```powershell
npm run typecheck
npm run build
npm run test:reconciliation
npm run verify:source
npm run verify:deployment
npm run verify:pwa
Set-Location .\backend
go test ./...
go vet ./...
```

## Migrasi database aktif

Database PKBM yang sedang dipakai tetap menjadi sumber data. Jangan import `database.sql` ke database aktif. Sebelum cutover, buat backup penuh database aktif, pulihkan ke MySQL 8.4 staging yang terpisah, lalu jalankan migrasi bertahap, rekonsiliasi jumlah/checksum dan laporan, pengujian role/integrasi, serta UAT. Langkah rinci ada di [MIGRASI_STACK.md](MIGRASI_STACK.md).

Nilai `workday_days` yang sudah tersimpan tetap digunakan. Jika belum dikonfigurasi, hari kerja default adalah Sabtu saja. Kalender menghormati hari libur, hari kerja opsional, override per guru, rotasi piket grup A/B termasuk pekan kelima, dan pengecualian mode Pokjar.

Route PHP lama dipertahankan sebagai kompatibilitas API dan rollback tersedia melalui `Dockerfile.legacy`. Jangan alihkan produksi ke backend Go sebelum pemeriksaan staging dan rekonsiliasi data dinyatakan lulus.

## Integrasi dan dokumentasi

Endpoint lama untuk n8n, Hermes, dan webhook tetap tersedia melalui route kompatibilitas. Lihat panduan operasional lama pada [legacy-php/README.PHP.md](legacy-php/README.PHP.md), serta petunjuk pengguna dan dokumentasi yang sudah ada di repository.
