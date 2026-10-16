# Presensi PKBM Tunas Ilmu API

Backend migrasi menggunakan Go 1.25, Fiber, GORM, dan MySQL. Untuk local development sementara tersedia mode SQLite pure-Go; staging/production tetap MySQL.

## Lokal

### MySQL

1. Jalankan MySQL 8.4 dengan database PKBM yang sudah dicadangkan dan dipulihkan ke lingkungan terpisah.
2. Isi environment dari `.env.example` dengan `DB_*` dan `JWT_SECRET`.
3. Jalankan:

```powershell
go mod download
go test ./...
go vet ./...
go run ./cmd/server
```

API akan tersedia di `http://localhost:8080`. Saat memakai database PKBM yang ada, jangan ganti `DB_NAME` ke database baru yang kosong.

### SQLite sementara di Windows/local

Dari root repository, setelah frontend dibuild:

```powershell
npm.cmd run build:local
Set-Location backend
go build -trimpath -o build/geopresensi-local.exe ./cmd/server
Set-Location ..
.\scripts\start-local-sqlite.cmd
```

Buka `http://localhost:8080`. Database dibuat di `data/geopresensi-local.db` dan akun seed development adalah `admin` / `admin123`. Jangan memakai file SQLite ini untuk staging atau production.

## Endpoint fondasi

- `GET /health/live`
- `GET /health/ready`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Endpoint kompatibilitas fitur berada di `/api/*.php` selama masa migrasi frontend.

## Keamanan lokal

- Jangan menggunakan `JWT_SECRET` development di staging/production.
- Refresh token hanya disimpan dalam cookie `HttpOnly` dan hash-nya di database aktif.
- Google OAuth dan Turnstile harus menggunakan credential khusus environment.
- Jangan mengimpor database production secara langsung ke development.
