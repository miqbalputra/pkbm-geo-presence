import { useState, useEffect } from 'react'
import {
  BarChart2, 
  Clock, 
  AlertTriangle, 
  LogOut, 
  FileText, 
  UserX,
  Download,
  TrendingDown,
  Info
} from 'lucide-react'
import { adminChartsAPI } from '../../services/api'
import { formatDate } from '../../utils/dateUtils'
import * as XLSX from 'xlsx'

function StatistikLengkap() {
  const [loading, setLoading] = useState(true)
  const [filterDays, setFilterDays] = useState(30)
  const [lateStats, setLateStats] = useState({ totalLatePct: '0.0', statsPerGuru: [], totalLate: 0 })
  const [latePiket, setLatePiket] = useState([])
  const [earlyCheckouts, setEarlyCheckouts] = useState([])
  const [izinSakit, setIzinSakit] = useState([])
  const [forgotten, setForgotten] = useState([])

  useEffect(() => {
    loadData()
  }, [filterDays])

  const loadData = async () => {
    try {
      setLoading(true)
      const response = await adminChartsAPI.getCompleteStats(filterDays)
      const data = response.data || {}
      setLateStats(data.lateStats || { totalLatePct: '0.0', statsPerGuru: [], totalLate: 0 })
      setLatePiket(data.latePiket || [])
      setEarlyCheckouts(data.earlyCheckouts || [])
      setIzinSakit(data.izinSakit || [])
      setForgotten(data.forgotten || [])
    } catch (error) {
      console.error('Gagal memuat data statistik:', error)
    } finally {
      setLoading(false)
    }
  }

  const downloadFullReportExcel = () => {
    const wb = XLSX.utils.book_new()

    // 1. Ringkasan Terlambat
    const lateData = lateStats.statsPerGuru.map(s => ({
      'Nama Guru': s.nama,
      'Total Kehadiran': s.total,
      'Total Terlambat': s.terlambat,
      'Persentase Terlambat': `${s.persentase}%`
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lateData), 'Keterlambatan Guru')

    // 2. Terlambat Piket
    const latePiketData = latePiket.map(l => ({
      'Nama Guru': l.nama,
      'Tanggal': l.tanggal,
      'Jam Masuk': l.jamMasuk,
      'Status': l.status,
      'Keterangan': l.keterangan
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(latePiketData), 'Terlambat Piket')

    // 3. Pulang Awal
    const earlyData = earlyCheckouts.map(l => ({
      'Nama Guru': l.nama,
      'Tanggal': l.tanggal,
      'Jam Pulang': l.jamPulang,
      'Keterangan': l.keterangan
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(earlyData), 'Pulang Awal Piket')

    // 4. Alasan Izin Sakit
    const izinData = izinSakit.map(l => ({
      'Nama Guru': l.nama,
      'Tanggal': l.tanggal,
      'Status': l.status.toUpperCase(),
      'Keterangan': l.keterangan
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(izinData), 'Alasan Izin Sakit')

    // 5. Lupa Pulang
    const forgottenData = forgotten.map(l => ({
      'Nama Guru': l.nama,
      'Tanggal': l.tanggal,
      'Jam Masuk': l.jamMasuk
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(forgottenData), 'Lupa Presensi Pulang')

    XLSX.writeFile(wb, `Laporan_Statistik_Lengkap_${formatDate(new Date())}.xlsx`)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow p-8 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-32 bg-gray-100 rounded-xl"></div>
          <div className="h-32 bg-gray-100 rounded-xl"></div>
          <div className="h-32 bg-gray-100 rounded-xl"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header & Filter */}
      <div className="bg-white rounded-2xl shadow p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <BarChart2 className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Statistik Kehadiran Lengkap</h2>
              <p className="text-sm text-gray-500">Analisis mendalam perilaku kehadiran guru</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={filterDays}
              onChange={(e) => setFilterDays(parseInt(e.target.value))}
              className="px-4 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value={7}>7 Hari Terakhir</option>
              <option value={30}>30 Hari Terakhir</option>
              <option value={90}>90 Hari Terakhir</option>
              <option value={365}>1 Tahun Terakhir</option>
            </select>
            
            <button 
              onClick={downloadFullReportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all"
            >
              <Download className="w-4 h-4" />
              DOWNLOAD EXCEL
            </button>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow border-l-4 border-amber-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Terlambat</p>
              <p className="text-2xl font-black text-gray-800 mt-1">{lateStats.totalLate}</p>
              <p className="text-xs text-amber-600 font-bold mt-1">{lateStats.totalLatePct}% dari total hadir</p>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow border-l-4 border-red-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Terlambat Piket</p>
              <p className="text-2xl font-black text-gray-800 mt-1">{latePiket.length}</p>
              <p className="text-xs text-red-600 font-bold mt-1">Petugas piket pagi</p>
            </div>
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow border-l-4 border-orange-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pulang Awal Piket</p>
              <p className="text-2xl font-black text-gray-800 mt-1">{earlyCheckouts.length}</p>
              <p className="text-xs text-orange-600 font-bold mt-1">Dengan izin atasan</p>
            </div>
            <div className="p-2 bg-orange-50 rounded-lg">
              <LogOut className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow border-l-4 border-slate-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Lupa Pulang</p>
              <p className="text-2xl font-black text-gray-800 mt-1">{forgotten.length}</p>
              <p className="text-xs text-slate-600 font-bold mt-1">Tanpa jam checkout</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <UserX className="w-5 h-5 text-slate-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Keterlambatan per Guru */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-gray-800">Ranking Keterlambatan</h3>
            </div>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-black uppercase">Persentase</span>
          </div>
          <div className="p-0 max-h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Nama</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase">Total</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase">Lambat</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lateStats.statsPerGuru.length > 0 ? lateStats.statsPerGuru.map((guru, idx) => (
                  <tr key={guru.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-700">{guru.nama}</td>
                    <td className="px-6 py-4 text-center text-gray-500">{guru.total}</td>
                    <td className="px-6 py-4 text-center font-bold text-amber-600">{guru.terlambat}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-black ${parseFloat(guru.persentase) > 20 ? 'text-red-600' : 'text-amber-600'}`}>
                        {guru.persentase}%
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center text-gray-400">
                      <Info className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p>Belum ada data kehadiran pada periode ini</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Detail Terlambat Piket */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="font-bold text-gray-800">Terlambat Saat Jadwal Piket</h3>
          </div>
          <div className="p-0 max-h-[400px] overflow-auto">
            {latePiket.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Tanggal</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase">Jam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {latePiket.map((l, idx) => (
                    <tr key={idx} className="hover:bg-red-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-700">{l.nama}</td>
                      <td className="px-6 py-4 text-gray-500">{l.tanggal}</td>
                      <td className="px-6 py-4 text-center font-bold text-red-600">{l.jamMasuk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center text-gray-400">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>Tidak ada keterlambatan piket</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 3. Pulang Awal Piket + Alasan */}
        <div className="bg-white rounded-2xl shadow overflow-hidden lg:col-span-2">
          <div className="p-6 border-b border-gray-100 flex items-center gap-2">
            <LogOut className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold text-gray-800">Riwayat Pulang Awal Piket</h3>
          </div>
          <div className="p-0 max-h-[400px] overflow-auto">
            {earlyCheckouts.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Nama Guru</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Tanggal</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Alasan / Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {earlyCheckouts.map((l, idx) => (
                    <tr key={idx} className="hover:bg-orange-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-700">{l.nama}</td>
                      <td className="px-6 py-4 text-gray-500">{l.tanggal}</td>
                      <td className="px-6 py-4 text-xs text-gray-600 italic">
                        {(l.keterangan || '').replace('(Izin Pulang Awal Piket)', '').replace(' | Alasan: ', '').trim() || 'Tanpa alasan detail'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center text-gray-400">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>Tidak ada data pulang awal</p>
              </div>
            )}
          </div>
        </div>

        {/* 4. Lupa Presensi Pulang */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-2">
            <UserX className="w-5 h-5 text-slate-500" />
            <h3 className="font-bold text-gray-800">Lupa Checkout</h3>
          </div>
          <div className="p-0 max-h-[400px] overflow-auto">
            {forgotten.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Nama</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase">Tanggal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {forgotten.map((l, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-700">{l.nama}</td>
                      <td className="px-6 py-4 text-center text-gray-500">{l.tanggal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center text-gray-400">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>Semua checkout lengkap</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Alasan Izin & Sakit */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" />
          <h3 className="font-bold text-gray-800">Alasan Izin & Sakit</h3>
        </div>
        <div className="p-0 max-h-[400px] overflow-y-auto">
          {izinSakit.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Nama Guru</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Tanggal</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase">Keterangan / Alasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {izinSakit.map((l, idx) => (
                  <tr key={idx} className="hover:bg-blue-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-700">{l.nama}</td>
                    <td className="px-6 py-4 text-gray-500">{l.tanggal}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${l.status === 'izin' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{l.keterangan || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-gray-400">
              <Info className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p>Tidak ada data izin/sakit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StatistikLengkap
