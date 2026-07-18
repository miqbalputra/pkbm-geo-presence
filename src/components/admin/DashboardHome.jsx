import { useState, useEffect, useMemo } from 'react'
import { Users, UserCheck, UserX, FileText, AlertCircle, Clock, Search, Calendar } from 'lucide-react'
import { adminSummaryAPI } from '../../services/api'
import TrenKehadiran from './TrenKehadiran'
import PersentaseKehadiran from './PersentaseKehadiran'
import LeaderboardGuru from './LeaderboardGuru'
import TrenKeterlambatan from './TrenKeterlambatan'
import TrenJamPulang from './TrenJamPulang'
import StatistikLengkap from './StatistikLengkap'

// Format jam "HH:MM:SS" / "HH:MM" → "HH:MM". Nilai kosong/00:00:00/'-' → "-".
function formatTime(t) {
  if (!t || t === '-' || t === '00:00:00') return '-'
  return String(t).substring(0, 5)
}

// Konfigurasi badge status (label + warna) — mencakup semua kemungkinan status.
const STATUS_BADGE = {
  hadir: { label: 'Hadir', cls: 'bg-green-100 text-green-700' },
  hadir_terlambat: { label: 'Terlambat', cls: 'bg-yellow-100 text-yellow-700' },
  hadir_izin_terlambat: { label: 'Izin Terlambat', cls: 'bg-blue-100 text-blue-700' },
  izin: { label: 'Izin', cls: 'bg-sky-100 text-sky-700' },
  sakit: { label: 'Sakit', cls: 'bg-red-100 text-red-700' },
  alfa: { label: 'Alfa', cls: 'bg-slate-200 text-slate-700' },
  libur: { label: 'Libur', cls: 'bg-indigo-100 text-indigo-700' },
  libur_override: { label: 'Libur Khusus', cls: 'bg-purple-100 text-purple-700' },
  opsional: { label: 'Opsional', cls: 'bg-slate-100 text-slate-600' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] || {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : '-',
    cls: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function getJamMasuk(log) {
  const s = log.status || ''
  if (s === 'izin') return formatTime(log.jamIzin)
  if (s === 'sakit') return formatTime(log.jamSakit)
  return formatTime(log.jamMasuk)
}

function getJamPulang(log) {
  const s = log.status || ''
  // Hanya status hadir* yang punya jam pulang bermakna.
  if (s.indexOf('hadir') === 0) return formatTime(log.jamPulang)
  return '-'
}

// Kartu statistik dengan skeleton loading bawaan.
function StatCard({ stat, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-3 w-24 bg-slate-200 rounded" />
            <div className="h-7 w-16 bg-slate-200 rounded" />
          </div>
          <div className="w-12 h-12 bg-slate-200 rounded-xl" />
        </div>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{stat.value}</p>
        </div>
        <div className={`${stat.color} p-3 rounded-xl`}>
          <stat.icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}

function DashboardHome() {
  const [filter, setFilter] = useState('today')
  const [attendanceLogs, setAttendanceLogs] = useState([])
  const [totalGuru, setTotalGuru] = useState(0)
  const [statsSummary, setStatsSummary] = useState({ hadir: 0, izin: 0, sakit: 0, alfa: 0 })
  const [guruBelumPresensi, setGuruBelumPresensi] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadData(filter)
  }, [filter])

  const loadData = async (period) => {
    try {
      setLoading(true)
      const response = await adminSummaryAPI.getDashboard(period)
      const data = response.data || {}

      setTotalGuru(data.totalGuru || 0)
      setStatsSummary(data.stats || { hadir: 0, izin: 0, sakit: 0, alfa: 0 })
      setGuruBelumPresensi(data.belumPresensiHariIni || [])
      setAttendanceLogs(data.logs || [])
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter realtime table berdasarkan kata kunci (nama guru).
  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return attendanceLogs
    return attendanceLogs.filter((log) => String(log.nama || '').toLowerCase().includes(q))
  }, [attendanceLogs, search])

  const hadirCount = statsSummary.hadir || 0
  const izinCount = statsSummary.izin || 0
  const sakitCount = statsSummary.sakit || 0
  const alfaCount = statsSummary.alfa || 0
  const belumPresensiCount = guruBelumPresensi.length

  // Label dinamis berdasarkan filter
  const getStatsLabel = () => {
    switch (filter) {
      case 'today': return { hadir: 'Hadir Hari Ini', izin: 'Izin Hari Ini', sakit: 'Sakit Hari Ini', alfa: 'Alfa Hari Ini' }
      case 'yesterday': return { hadir: 'Hadir Kemarin', izin: 'Izin Kemarin', sakit: 'Sakit Kemarin', alfa: 'Alfa Kemarin' }
      case '7days': return { hadir: 'Hadir (7 Hari)', izin: 'Izin (7 Hari)', sakit: 'Sakit (7 Hari)', alfa: 'Alfa (7 Hari)' }
      case '14days': return { hadir: 'Hadir (14 Hari)', izin: 'Izin (14 Hari)', sakit: 'Sakit (14 Hari)', alfa: 'Alfa (14 Hari)' }
      case '30days': return { hadir: 'Hadir (30 Hari)', izin: 'Izin (30 Hari)', sakit: 'Sakit (30 Hari)', alfa: 'Alfa (30 Hari)' }
      default: return { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alfa: 'Alfa' }
    }
  }

  const labels = getStatsLabel()

  const stats = [
    { label: 'Total Guru', value: totalGuru, icon: Users, color: 'bg-blue-500' },
    { label: labels.hadir, value: hadirCount, icon: UserCheck, color: 'bg-green-500' },
    { label: labels.izin, value: izinCount, icon: FileText, color: 'bg-yellow-500' },
    { label: labels.sakit, value: sakitCount, icon: UserX, color: 'bg-red-500' },
    { label: labels.alfa, value: alfaCount, icon: AlertCircle, color: 'bg-gray-600' },
  ]

  const tableTitle = {
    today: 'Presensi Hari Ini',
    yesterday: 'Presensi Kemarin',
    '7days': 'Presensi 7 Hari Terakhir',
    '14days': 'Presensi 14 Hari Terakhir',
    '30days': 'Presensi 30 Hari Terakhir',
  }[filter] || 'Presensi'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Ringkasan kehadiran & laporan presensi guru</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-transparent text-sm text-slate-700 focus:outline-none focus:ring-0 font-medium cursor-pointer"
          >
            <option value="today">Hari Ini</option>
            <option value="yesterday">Kemarin</option>
            <option value="7days">7 Hari Terakhir</option>
            <option value="14days">14 Hari Terakhir</option>
            <option value="30days">30 Hari Terakhir</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat, index) => (
          <StatCard key={index} stat={stat} loading={loading} />
        ))}
      </div>

      {/* Widget Belum Presensi Hari Ini */}
      {belumPresensiCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500 rounded-xl shadow-sm">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-800">
                  Belum Presensi Hari Ini
                </h3>
                <p className="text-sm text-red-600">
                  {belumPresensiCount} dari {totalGuru} guru belum melakukan presensi dan akan dihitung alfa
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-red-600">{belumPresensiCount}</div>
                <div className="text-xs text-red-500">Guru</div>
              </div>
            </div>

            {/* Daftar Guru Belum Presensi */}
            <div className="bg-white rounded-xl p-3 max-h-64 overflow-y-auto border border-red-100">
              <div className="space-y-2">
                {guruBelumPresensi.map((guru, index) => (
                  <div
                    key={guru.id}
                    className="flex items-center justify-between p-3 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-red-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-red-700 font-bold text-sm">{index + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{guru.nama}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : (guru.jabatan || '-')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-red-600 flex-shrink-0">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs font-semibold">Belum Presensi</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Info Waktu */}
            <div className="mt-3 p-3 bg-red-100 rounded-xl">
              <p className="text-xs text-red-700 text-center">
                ⏰ Data diperbarui saat halaman dimuat. Refresh untuk update terbaru.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pesan Jika Semua Sudah Presensi */}
      {belumPresensiCount === 0 && filter === 'today' && !loading && (
        <div className="bg-green-50 border border-green-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-500 rounded-xl">
              <UserCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-green-800">
                ✅ Semua Guru Sudah Presensi!
              </h3>
              <p className="text-sm text-green-600">
                {totalGuru} dari {totalGuru} guru sudah melakukan presensi hari ini
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tren Kehadiran - Modern Area Chart */}
        <TrenKehadiran />

        {/* Persentase Kehadiran - Radial Progress */}
        <PersentaseKehadiran />

        {/* Tren Keterlambatan - Full width dengan perbandingan periode */}
        <TrenKeterlambatan />

        {/* Tren Jam Pulang - Analisis Checkout, Lupa Pulang & Alasan */}
        <TrenJamPulang />

        {/* Statistik Lengkap - Analisis Mendalam */}
        <div className="col-span-full">
          <StatistikLengkap />
        </div>
      </div>

      {/* Leaderboard Guru - Gamifikasi */}
      <LeaderboardGuru />

      {/* Realtime Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{tableTitle}</h2>
              <p className="text-sm text-slate-500 mt-1">
                Total: {filteredData.length} presensi
                {search && ` (dari ${attendanceLogs.length})`}
              </p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama guru..."
                className="pl-9 pr-3 py-2 w-full sm:w-64 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nama</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tanggal</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Jam Masuk</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Jam Pulang</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 w-32 bg-slate-200 rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-20 bg-slate-200 rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-12 bg-slate-200 rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-12 bg-slate-200 rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-5 w-20 bg-slate-200 rounded-full animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded animate-pulse" /></td>
                    </tr>
                  ))
                ) : filteredData.length > 0 ? (
                  filteredData.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">{log.nama}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{log.tanggal}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{getJamMasuk(log)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{getJamPulang(log)}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={log.status} /></td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate" title={log.keterangan || ''}>{log.keterangan || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <UserX className="w-8 h-8 text-slate-300" />
                        <p>{search ? 'Tidak ada presensi yang cocok dengan pencarian' : 'Tidak ada data presensi untuk periode ini'}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardHome