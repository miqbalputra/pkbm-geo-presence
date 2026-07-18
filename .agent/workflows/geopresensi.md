---
description: Konfigurasi utama project Geo Presensi PKBM Tunas Ilmu
---

# Project Geo Presensi PKBM Tunas Ilmu - Konfigurasi Utama

## 🌐 Domain Produksi
**URL Utama:** https://geo.pkbmtunasilmu.web.id

## 📁 Folder Kerja
- **Folder Utama:** `D:\Google Antigravity\Presensi PKBM`
- **Frontend Source:** `src/`
- **Backend API:** `api/`
- **Build Output:** `dist/` (di-gitignore, di-build saat Docker image dibuat)

## 🔧 Setelah Melakukan Perubahan

1. Jika edit frontend (React/JSX/CSS):
   ```
   npm run build
   ```
   Lalu commit & push — di deploy Coolify, frontend di-build ulang saat pembuatan image.

2. Jika edit backend (PHP):
   Upload/commit langsung file yang diubah ke folder `api/`.

## 📝 Catatan
- CORS dikonfigurasi via env `CORS_ALLOWED_ORIGINS` (di-set di Coolify), fallback ke `APP_URL`.
- API URL: `https://geo.pkbmtunasilmu.web.id/api`
- Database credentials & config berasal dari environment variable Coolify, bukan file PHP.