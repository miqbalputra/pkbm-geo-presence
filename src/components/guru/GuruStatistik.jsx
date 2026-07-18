import { useState } from 'react'
import { Calendar, TrendingUp, Clock, AlertCircle, CheckCircle, FileText, UserX } from 'lucide-react'
import { formatDateForInput } from '../../utils/dateUtils'
import { useGuruReport } from '../../hooks/useGuruReport'

function GuruStatistik({ user }) {
  const [filter, setFilter] = useState('bulan_ini')

  const getPeriodRange = () => {
    const today = new Date()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()

    switch (filter) {
      case 'bulan_ini':
        return {
          startDate: formatDateForInput(new Date(currentYear, currentMonth, 1)),
          endDate: formatDateForInput(new Date(currentYear, currentMonth + 1, 0)),
        }
      case 'bulan_lalu': {
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear
        return {
          startDate: formatDateForInput(new Date(lastMonthYear, lastMonth, 1)),
          endDate: formatDateForInput(new Date(lastMonthYear, lastMonth + 1, 0)),
        }
      }
      case '3_bulan': {
        const threeMonthsAgo = new Date()
        threeMonthsAgo.setMonth(today.getMonth() - 3)
        return {
          startDate: formatDateForInput(threeMonthsAgo),
          endDate: formatDateForInput(today),
        }
      }
      case 'tahun_ini':
        return {
          startDate: formatDateForInput(new Date(currentYear, 0, 1)),
          endDate: formatDateForInput(today),
        }
      default:
        return {
          startDate: formatDateForInput(new Date(currentYear, currentMonth, 1)),
          endDate: formatDateForInput(new Date(currentYear, currentMonth + 1, 0)),
        }
    }
  }

  const { startDate, endDate } = getPeriodRange()

  // Sumber data tunggal: sama dengan Admin "Download Laporan" dan Guru "Riwayat".
  const { loading, getGuruReportRows, getGuruSummary } = useGuruReport(user, startDate, endDate, {
    allGuru: false,
  })

  const summary = user?.id
    ? getGuruSummary(user.id)
    : { totalHari: 0, hadir: 0, izin: 0, sakit: 0, alfa: 0, persentase: 0 }

  const displayData = user?.id
    ? getGuruReportRows(user.id).slice().sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))
    : []

  const totalPresensi = summary.totalHari || 0
  const totalHadir = summary.hadir || 0
  const totalIzin = summary.izin || 0
  const totalSakit = summary.sakit || 0
  const totalAlfa = summary.alfa || 0
  const totalTerlambat = displayData.filter((log) => log.status === 'hadir_terlambat').length

  const persentaseHadir = totalPresensi > 0 ? ((totalHadir / totalPresensi) * 100).toFixed(1) : 0
  const persentaseTerlambat = totalPresensi > 0 ? ((totalTerlambat / totalPresensi) * 100).toFixed(1) : 0

  const getPeriodeLabel = () => {
    switch (filter) {
      case 'bulan_ini':
        return 'Bulan Ini'
      case 'bulan_lalu':
        return 'Bulan Lalu'
      case '3_bulan':
        return '3 Bulan Terakhir'
      case 'tahun_ini':
        return 'Tahun Ini'
      default:
        return 'Bulan Ini'
    }
  }

  const getJamMasuk = (log) => log.jamMasuk || log.jam_masuk || log.jamHadir || log.jam_hadir || '-'
  const getJamPulang = (log) => log.jamPulang || log.jam_pulang || '-'

  const getStatusLabel = (status = '') => {
    if (status === 'hadir') return 'Hadir'
    if (status === 'hadir_terlambat') return 'Terlambat'
    if (status === 'hadir_izin_terlambat') return 'Izin Terlambat'
    if (status === 'izin') return 'Izin'
    if (status === 'sakit') return 'Sakit'
    if (status === 'alfa') return 'Alfa'
    if (status === 'libur') return 'Libur'
    if (status === 'libur_override') return 'Libur Khusus'
    if (status === 'opsional') return 'Opsional'
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : '-'
  }

  const getStatusClass = (status) => `px-3 py-1 rounded-full text-xs font-semibold
    ${status === 'hadir' ? 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300' : ''}
    ${status === 'hadir_terlambat' ? 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300' : ''}
    ${status === 'hadir_izin_terlambat' ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300' : ''}
    ${status === 'izin' ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300' : ''}
    ${status === 'sakit' ? 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300' : ''}
    ${status === 'alfa' ? 'bg-slate-200 dark:bg-slate-600/30 text-slate-800 dark:text-slate-300' : ''}
    ${status === 'libur' ? 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300' : ''}
    ${status === 'libur_override' ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300' : ''}
    ${status === 'opsional' ? 'bg-slate-100 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300' : ''}`

  const stats = [
    {
      label: 'Total Hadir',
      sublabel: '(Termasuk Terlambat & Opsional)',
      value: totalHadir,
      icon: CheckCircle,
      color: 'bg-green-500',
      darkColor: 'dark:bg-green-500/20',
      bgColor: 'bg-green-50',
      darkBgColor: 'dark:bg-green-500/10',
      textColor: 'text-green-600',
      darkTextColor: 'dark:text-green-400',
      percentage: totalPresensi > 0 ? ((totalHadir / totalPresensi) * 100).toFixed(1) : 0,
    },
    {
      label: 'Terlambat',
      sublabel: '(Dari Total Hadir)',
      value: totalTerlambat,
      icon: Clock,
      color: 'bg-yellow-500',
      darkColor: 'dark:bg-yellow-500/20',
      bgColor: 'bg-yellow-50',
      darkBgColor: 'dark:bg-yellow-500/10',
      textColor: 'text-yellow-600',
      darkTextColor: 'dark:text-yellow-400',
      percentage: totalHadir > 0 ? ((totalTerlambat / totalHadir) * 100).toFixed(1) : 0,
    },
    {
      label: 'Izin',
      sublabel: '',
      value: totalIzin,
      icon: FileText,
      color: 'bg-blue-500',
      darkColor: 'dark:bg-blue-500/20',
      bgColor: 'bg-blue-50',
      darkBgColor: 'dark:bg-blue-500/10',
      textColor: 'text-blue-600',
      darkTextColor: 'dark:text-blue-400',
      percentage: totalPresensi > 0 ? ((totalIzin / totalPresensi) * 100).toFixed(1) : 0,
    },
    {
      label: 'Sakit',
      sublabel: '',
      value: totalSakit,
      icon: UserX,
      color: 'bg-red-500',
      darkColor: 'dark:bg-red-500/20',
      bgColor: 'bg-red-50',
      darkBgColor: 'dark:bg-red-500/10',
      textColor: 'text-red-600',
      darkTextColor: 'dark:text-red-400',
      percentage: totalPresensi > 0 ? ((totalSakit / totalPresensi) * 100).toFixed(1) : 0,
    },
    {
      label: 'Alfa',
      sublabel: '(Tidak Presensi)',
      value: totalAlfa,
      icon: AlertCircle,
      color: 'bg-gray-600',
      darkColor: 'dark:bg-slate-400/20',
      bgColor: 'bg-gray-50',
      darkBgColor: 'dark:bg-slate-400/10',
      textColor: 'text-gray-700',
      darkTextColor: 'dark:text-slate-300',
      percentage: totalPresensi > 0 ? ((totalAlfa / totalPresensi) * 100).toFixed(1) : 0,
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Statistik Kehadiran Saya</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Periode: {getPeriodeLabel()}</p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 outline-none"
        >
          <option value="bulan_ini">Bulan Ini</option>
          <option value="bulan_lalu">Bulan Lalu</option>
          <option value="3_bulan">3 Bulan Terakhir</option>
          <option value="tahun_ini">Tahun Ini</option>
        </select>
      </div>

      <div className="bg-gradient-to-r from-indigo-500 to-violet-600 rounded-2xl shadow-[0_8px_24px_rgba(99,102,241,0.35)] p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-100 text-sm">Persentase Kehadiran</p>
            <p className="text-4xl font-bold mt-2">{persentaseHadir}%</p>
            <p className="text-indigo-100 text-sm mt-2">
              {totalHadir} dari {totalPresensi} hari kerja
            </p>
          </div>
          <div className="p-4 bg-white/15 rounded-2xl backdrop-blur-sm">
            <TrendingUp className="w-12 h-12" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className={`${stat.bgColor} ${stat.darkBgColor} rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-5 transition-colors`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`${stat.color} ${stat.darkColor} p-2 rounded-xl`}>
                <stat.icon className="w-5 h-5 text-white dark:text-current" />
              </div>
            </div>
            <p className={`${stat.textColor} ${stat.darkTextColor} text-sm font-semibold`}>{stat.label}</p>
            {stat.sublabel && <p className="text-xs text-slate-500 dark:text-slate-400">{stat.sublabel}</p>}
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-2">{stat.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {stat.percentage}% {stat.sublabel ? 'dari hadir' : 'dari total'}
            </p>
          </div>
        ))}
      </div>

      {totalTerlambat > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-2">Catatan Keterlambatan</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300/80">
                Anda terlambat sebanyak <strong>{totalTerlambat} kali</strong> ({persentaseTerlambat}%) dalam periode ini.
                Usahakan untuk datang tepat waktu agar tidak terlambat.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Riwayat Presensi Bulan Ini</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Data sama dengan Download Laporan admin, termasuk presensi opsional, alfa, dan libur</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tanggal</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Jam Masuk</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Jam Pulang</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayData.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-800 dark:text-slate-200 font-medium">{log.tanggal}</td>
                  <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">{getJamMasuk(log)}</td>
                  <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">{getJamPulang(log)}</td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className={getStatusClass(log.status)}>{getStatusLabel(log.status)}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-400">{log.keterangan || '-'}</td>
                </tr>
              ))}
              {displayData.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">
                    Belum ada data presensi untuk periode ini
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Calendar className="w-6 h-6 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-indigo-800 dark:text-indigo-300 mb-2">💡 Tips Meningkatkan Kehadiran</h3>
            <ul className="text-sm text-indigo-700 dark:text-indigo-300/80 space-y-1 list-disc list-inside">
              <li>Datang tepat waktu sebelum jam masuk normal</li>
              <li>Jangan lupa presensi pulang saat jam pulang sudah dibuka</li>
              <li>Jika berhalangan, segera isi presensi izin/sakit dengan keterangan</li>
              <li>Cek jadwal piket Anda agar tidak terlambat</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GuruStatistik
