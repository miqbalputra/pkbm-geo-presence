// Koordinat Sekolah (Contoh: Jakarta)
export const SCHOOL_LOCATION = {
  latitude: -6.2088,
  longitude: 106.8456,
  radius: 100 // meter
}

// Data Users
export const users = [
  { id: 1, username: 'admin', password: 'admin123', role: 'admin', nama: 'Admin Sekolah' },
  { id: 2, username: 'kepsek', password: 'kepsek123', role: 'kepala_sekolah', nama: 'Kepala Sekolah' },
  { id: 3, idGuru: 'G2020001', username: 'guru1', password: 'guru123', role: 'guru', nama: 'Budi Santoso', jenisKelamin: 'Laki-laki', alamat: 'Jl. Merdeka No. 10', noHP: '081234567890', jabatan: ['Guru Matematika', 'Wali Kelas 7A'], tanggalBertugas: '2020-01-15' },
  { id: 4, idGuru: 'G2019001', username: 'guru2', password: 'guru123', role: 'guru', nama: 'Siti Nurhaliza', jenisKelamin: 'Perempuan', alamat: 'Jl. Sudirman No. 25', noHP: '081234567891', jabatan: ['Guru Bahasa Indonesia'], tanggalBertugas: '2019-08-20' },
  { id: 5, idGuru: 'G2021001', username: 'guru3', password: 'guru123', role: 'guru', nama: 'Ahmad Fauzi', jenisKelamin: 'Laki-laki', alamat: 'Jl. Gatot Subroto No. 5', noHP: '081234567892', jabatan: ['Guru IPA', 'Koordinator Lab'], tanggalBertugas: '2021-03-10' },
  { id: 6, idGuru: 'G2018001', username: 'guru4', password: 'guru123', role: 'guru', nama: 'Dewi Lestari', jenisKelamin: 'Perempuan', alamat: 'Jl. Ahmad Yani No. 15', noHP: '081234567893', jabatan: ['Guru Bahasa Inggris', 'Pembina Ekstrakurikuler'], tanggalBertugas: '2018-06-01' },
  { id: 7, idGuru: 'G2022001', username: 'guru5', password: 'guru123', role: 'guru', nama: 'Rudi Hartono', jenisKelamin: 'Laki-laki', alamat: 'Jl. Diponegoro No. 30', noHP: '081234567894', jabatan: ['Guru Olahraga'], tanggalBertugas: '2022-01-05' }
]

// Data Guru (untuk tabel Data Guru)
export const dataGuru = users.filter(u => u.role === 'guru')

// Initial Attendance Logs
export const initialAttendanceLogs = [
  { id: 1, userId: 3, nama: 'Budi Santoso', tanggal: '2025-12-12', status: 'hadir', jamMasuk: '07:15', jamPulang: null, jamHadir: '07:15', jamIzin: null, jamSakit: null, keterangan: '', latitude: -6.2088, longitude: 106.8456 },
  { id: 2, userId: 4, nama: 'Siti Nurhaliza', tanggal: '2025-12-12', status: 'hadir', jamMasuk: '07:20', jamPulang: null, jamHadir: '07:20', jamIzin: null, jamSakit: null, keterangan: '', latitude: -6.2088, longitude: 106.8456 },
  { id: 3, userId: 5, nama: 'Ahmad Fauzi', tanggal: '2025-12-12', status: 'izin', jamMasuk: '-', jamPulang: null, jamHadir: null, jamIzin: '07:00', jamSakit: null, keterangan: 'Ada keperluan keluarga', latitude: null, longitude: null },
  { id: 4, userId: 3, nama: 'Budi Santoso', tanggal: '2025-12-11', status: 'hadir', jamMasuk: '07:10', jamPulang: '16:00', jamHadir: '07:10', jamIzin: null, jamSakit: null, keterangan: '', latitude: -6.2088, longitude: 106.8456 },
  { id: 5, userId: 4, nama: 'Siti Nurhaliza', tanggal: '2025-12-11', status: 'hadir', jamMasuk: '07:25', jamPulang: '16:15', jamHadir: '07:25', jamIzin: null, jamSakit: null, keterangan: '', latitude: -6.2088, longitude: 106.8456 },
  { id: 6, userId: 5, nama: 'Ahmad Fauzi', tanggal: '2025-12-11', status: 'hadir', jamMasuk: '07:18', jamPulang: '16:05', jamHadir: '07:18', jamIzin: null, jamSakit: null, keterangan: '', latitude: -6.2088, longitude: 106.8456 },
  { id: 7, userId: 6, nama: 'Dewi Lestari', tanggal: '2025-12-11', status: 'sakit', jamMasuk: '-', jamPulang: null, jamHadir: null, jamIzin: null, jamSakit: '06:30', keterangan: 'Demam tinggi', latitude: null, longitude: null },
  { id: 8, userId: 7, nama: 'Rudi Hartono', tanggal: '2025-12-11', status: 'hadir', jamMasuk: '07:30', jamPulang: '16:20', jamHadir: '07:30', jamIzin: null, jamSakit: null, keterangan: '', latitude: -6.2088, longitude: 106.8456 }
]

// Initial Activity Logs
export const initialActivityLogs = [
  { id: 1, waktu: '2025-12-12 07:15:30', user: 'Budi Santoso', aktivitas: 'Input Presensi', status: 'Hadir' },
  { id: 2, waktu: '2025-12-12 07:20:15', user: 'Siti Nurhaliza', aktivitas: 'Input Presensi', status: 'Hadir' },
  { id: 3, waktu: '2025-12-12 07:25:00', user: 'Ahmad Fauzi', aktivitas: 'Input Presensi', status: 'Izin' },
  { id: 4, waktu: '2025-12-12 08:00:00', user: 'Admin Sekolah', aktivitas: 'Login', status: 'Sukses' },
  { id: 5, waktu: '2025-12-11 07:10:00', user: 'Budi Santoso', aktivitas: 'Input Presensi', status: 'Hadir' }
]
