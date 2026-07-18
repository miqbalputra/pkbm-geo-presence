# 🚀 Rencana Migrasi & Optimalisasi GeoPresensi Sekolah

Dokumen ini berisi rencana teknis untuk memindahkan aplikasi **GeoPresensi Sekolah** dari PHP Vanilla (Shared Hosting) ke **Laravel Octane** (VPS) demi performa maksimal dan skalabilitas.

## 🛠️ Stack Teknologi Target (Modern & High-Performance)

| Komponen | Teknologi | Alasan |
| :--- | :--- | :--- |
| **Backend Framework** | **Laravel 13 (Latest)** | Versi terbaru (Maret 2026), support Passkey & AI Native. |
| **Server Engine** | **FrankenPHP** | Pengganti Nginx/FPM yang jauh lebih cepat & simpel (Built-in Caddy). |
| **Performa Mesin** | **Laravel Octane** | Berjalan di atas FrankenPHP untuk respon sub-millisecond. |
| **Frontend Bridge** | **Inertia.js** | Menghubungkan Laravel & React secara seamless. |
| **UI Framework** | **React (Existing Code)** | Mempertahankan tampilan premium yang sudah Anda miliki. |
| **Database** | **MariaDB / MySQL** | Penyimpanan data relasional yang stabil. |
| **Caching & Queue** | **Redis** | Mempercepat sesi login dan antrean notifikasi WA. |
| **Mobile Experience**| **PWA (Progressive Web App)**| Aplikasi bisa di-install di HP, loading instan, dan full screen. |
| **Login Biometrik** | **Passkey (FaceID/TouchID)**| **Login pakai Wajah atau Sidik Jari** (Sangat cepat & aman). |

---

## 📈 Arsitektur Sistem Baru

1.  **High Traffic Handling:** Saat jam 07:00 pagi (puncak presensi), **Octane** menjaga aplikasi tetap "panas" di RAM sehingga respon server < 10ms.
2.  **Background Processing:** Proses berat seperti pengiriman notifikasi WhatsApp via n8n akan dilempar ke **Redis Queue**, sehingga guru tidak perlu menunggu loading lama setelah klik "Hadir".
3.  **Data Efficiency:** Hanya JSON yang dikirim antara server dan HP guru, sangat hemat kuota dan cepat di sinyal lemah.
4.  **Instant Mobile Load (PWA):** Aset aplikasi (CSS/JS/Images) disimpan di storage HP guru via Service Worker, sehingga aplikasi muncul seketika saat dibuka kembali.

---

## 📝 Tahapan Migrasi

### Tahap 1: Inisialisasi & Infrastruktur
- Setup Project **Laravel 13** dengan starter kit Breeze (Inertia React).
- Konfigurasi **FrankenPHP** sebagai server utama (menggantikan Nginx/FPM).
- Setup **Laravel Octane** untuk integrasi dengan worker mode FrankenPHP.

### Tahap 2: Migrasi Database & Auth
- Membuat Migration berdasarkan schema database lama.
- Implementasi **Passkey Authentication** (Login Sidik Jari/FaceID) untuk Guru.
- Import data guru dan riwayat presensi.

### Tahap 3: Porting UI & PWA Setup
- Memindahkan komponen React ke `resources/js/Pages`.
- Konfigurasi `vite-plugin-pwa` untuk generate manifest dan service worker.
- Setup icon aplikasi dan splash screen untuk Android/iOS.
- Optimasi aset menggunakan Vite.

### Tahap 4: Migrasi Logika Backend
- Migrasi API manual ke Laravel Controllers & Eloquent.
- Pemanfaatan **Laravel 13 AI SDK** untuk fitur analisis kehadiran (opsional).

### Tahap 5: Deployment VPS
- Setup VPS dengan Docker (image FrankenPHP resmi).
- Aktivasi SSL otomatis via Caddy (FrankenPHP).
- Konfigurasi Redis untuk optimalisasi Queue.

---

## 💡 Fitur Unggulan Setelah Migrasi
- ✅ **Login Wajah / Sidik Jari:** Guru tidak perlu ketik password, cukup scan wajah/jari via Passkey.
- ✅ **Tanpa Refresh Halaman:** Navigasi antar menu secepat aplikasi mobile asli.
- ✅ **Tahan Serbuan:** Server tidak *down* meski ratusan guru absen di menit yang sama.
- ✅ **Offline Friendly (Basic):** Aset aplikasi tetap bisa dibuka meski internet sedang tidak stabil.
- ✅ **Notifikasi Cepat:** WhatsApp Reminder terkirim instan tanpa menghambat proses absen.

---

> [!IMPORTANT]
> **Status:** Rencana telah disetujui. Siap untuk tahap inisialisasi boilerplate Laravel.
