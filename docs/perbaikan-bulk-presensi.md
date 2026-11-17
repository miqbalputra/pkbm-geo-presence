# Perbaikan bulk karena salah jam masuk

Menu **Admin → Pengaturan → Presensi → Perbaikan bulk karena salah jam masuk**.

## Cara memakai

1. Perbaiki **Jam Masuk Normal** di bagian atas untuk presensi berikutnya. Contoh kasus: nonpiket Pusat seharusnya 07.20 WIB, piket tetap memakai jadwalnya.
2. Pilih tanggal awal/akhir yang terdampak (maksimal 366 hari), kategori, jam normal koreksi untuk Pusat, dan alasan.
3. Klik **Buat pratinjau bulk**. Periksa nama, kategori, tanggal, jam asli, target, serta status dan catatan sebelum/sesudah. Semua perubahan tersedia dalam tabel berhalaman, tidak hanya sampel.
4. Klik **Tinjau dan terapkan**, lalu konfirmasikan ringkasannya. Sistem menghitung ulang di server menggunakan data yang masih sama dengan pratinjau. Data atau aturan yang berubah membuat proses ditolak; buat pratinjau baru.
5. Gunakan **Riwayat dan pembatalan koreksi** untuk melihat rincian atau memulihkan status/catatan sebelumnya. Pembatalan ditolak seluruhnya jika ada satu presensi yang sudah berubah lagi, termasuk presensi pulang setelah koreksi. Tinjau perubahan terbaru secara manual dalam kasus tersebut.

Jam normal koreksi adalah parameter untuk rentang yang dipilih; fitur bulk tidak mengubah pengaturan global. Jika periode terdampak memiliki beberapa jam normal yang benar, jalankan batch terpisah per periode.

## Pemisahan kategori

| Kategori | Aturan koreksi |
| --- | --- |
| PKBM Pusat | Profil `pokjar` kosong/null/whitespace. Hanya status terlambat yang dinilai ulang. Jam normal parameter berlaku untuk nonpiket; piket grup A/B dihitung dari tanggal dan konfigurasi pekan, termasuk pekan kelima. Jadwal apel dan agenda tanggal tertentu tetap berlaku. |
| Pokjar | Profil `pokjar` terisi. Kehadiran pada tanggal tersebut menjadi `hadir`; jam, keterlambatan, apel dan piket tidak dinilai. Catatan hadir yang tidak memiliki jam juga dapat dinormalkan. |

Kategori menggunakan profil guru saat ini, bukan teks jabatan seperti “Tutor”. Jadwal dan kalender menggunakan konfigurasi aplikasi utama saat pratinjau. Sistem tidak mengarang riwayat perpindahan kategori/grup atau jadwal lama yang tidak tersedia: periksa profil dan pratinjau, lalu pisahkan rentang jika aturan berubah pada periode tersebut.

Koreksi Pusat tidak membuat keterlambatan baru pada status yang sudah `hadir`, agar persetujuan manual tidak ditimpa. Status `hadir_izin_terlambat` tetap membawa izin jika memang masih terlambat. Hari nonkerja Pusat dan Pusat tanpa jam valid dilewati. Status izin, sakit, Alfa dan record di luar rentang/kategori tidak diubah. Sistem tidak membuat presensi bagi tanggal yang belum memiliki record.

## Keamanan data

- Pembaruan hanya menyentuh `status`, bagian otomatis keterangan keterlambatan, dan timestamp pembaruan. Jam masuk/hadir/pulang, GPS, metode, tanggal, identitas guru dan catatan manual lainnya dipertahankan.
- Riwayat `attendance_corrections` menyimpan pembuat, alasan, rentang, parameter, kategori, rincian perubahan, salinan sebelum perubahan dan penanda kondisi sesudah perubahan. Riwayat dan perubahan presensi disimpan dalam satu transaksi: kegagalan salah satunya membatalkan semuanya.
- Pratinjau mengikat parameter, record presensi, kategori/grup guru, kalender dan jadwal. Penerapan memakai transaksi dan penguncian baris. Pengiriman ulang pratinjau lama ditolak setelah data berubah.
- Arsip snapshot rekap bulanan yang sudah dikonfirmasi tidak ditulis ulang. Koreksi record sumber tidak mengubah arsip persetujuan tersebut.
- Migrasi `011_attendance_corrections.sql` hanya menambah tabel riwayat; tidak menghapus, mereset, atau mengisi ulang data presensi/guru.
- Endpoint hanya dapat diakses admin yang masih aktif. Integrasi n8n tidak memperoleh akses menulis koreksi ini.

## API

- `GET /api/v1/operations/attendance-corrections/preview`: `start_date`, `end_date`, `scope` (`pusat`, `pokjar`, `all`), `normal_time` (`HH:MM`, wajib jika mencakup Pusat), `reason` (5–500 karakter).
- `POST /api/v1/operations/attendance-corrections/apply`: parameter yang sama dan `preview_hash` dari pratinjau.
- `GET /api/v1/operations/attendance-corrections/`: 50 batch terakhir.
- `GET /api/v1/operations/attendance-corrections/:id`: rincian sebelum/sesudah.
- `POST /api/v1/operations/attendance-corrections/:id/undo`: pemulihan satu batch, dengan pemeriksaan konflik.

Periksa fitur pada database staging terpisah sebelum deploy produksi. Tidak perlu mengimpor `database.sql` ke database aktif.
