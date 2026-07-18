import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
import { guruAPI } from '../../services/api'
import { useGuruReport } from '../../hooks/useGuruReport'
import { formatDateForInput } from '../../utils/dateUtils'

const POKJAR_LIST = ['Lentera Qalbu', 'Umar bin Khattab', 'Nashirus Sunnah']

// Warna badge per pokjar (samakan dengan DataGuru)
const POKJAR_BADGE = {
  'Lentera Qalbu': 'bg-purple-100 text-purple-800',
  'Umar bin Khattab': 'bg-teal-100 text-teal-800',
  'Nashirus Sunnah': 'bg-orange-100 text-orange-800',
}

// Normalisasi status presensi ke label tiga-status Pokjar.
// Guru Pokjar hanya menghasilkan hadir/izin/sakit (tidak ada hadir_terlambat),
// tetapi tetap ditangani secara defensif bila ada data lama.
function statusLabel(status) {
  const s = String(status || '').toLowerCase()
  if (s.startsWith('hadir')) return 'Hadir'
  if (s === 'izin') return 'Izin'
  if (s === 'sakit') return 'Sakit'
  return status || '-'
}

function LaporanPokjar() {
  const [dataGuru, setDataGuru] = useState([])
  const [pokjarMap, setPokjarMap] = useState({}) // userId -> pokjar
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterPokjar, setFilterPokjar] = useState('') // '' = semua pokjar
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState({ show: false, message: '' })

  // Sumber data presensi yang sama dengan menu "Download Laporan" (semua guru).
  const { attendanceLogs } = useGuruReport(null, startDate, endDate, { allGuru: true })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const guruResponse = await guruAPI.getAllIncludingArchived()
      const list = guruResponse.data || []
      setDataGuru(list)
      const map = {}
      list.forEach((g) => {
        if (g.pokjar) map[g.id] = g.pokjar
      })
      setPokjarMap(map)
    } catch (error) {
      console.error('LaporanPokjar: gagal memuat data guru:', error)
      showNotification('Gagal memuat data guru: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // Default rentang tanggal: awal bulan ini s/d hari ini (setelah data dimuat).
  useEffect(() => {
    if (dataGuru.length > 0 && !startDate && !endDate) {
      const today = new Date()
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      setStartDate(formatDateForInput(firstDay))
      setEndDate(formatDateForInput(today))
    }
  }, [dataGuru, startDate, endDate])

  const showNotification = (message) => {
    setNotification({ show: true, message })
    setTimeout(() => setNotification({ show: false, message: '' }), 3000)
  }

  // Filter log: hanya guru pokjar, dalam rentang tanggal, status hadir/izin/sakit.
  const pokjarLogs = useMemo(() => {
    if (!startDate || !endDate) return []
    return (attendanceLogs || [])
      .filter((log) => {
        const pj = pokjarMap[log.userId] || pokjarMap[log.user_id]
        if (!pj) return false
        if (filterPokjar && pj !== filterPokjar) return false
        if (log.tanggal < startDate || log.tanggal > endDate) return false
        const s = String(log.status || '').toLowerCase()
        return s.startsWith('hadir') || s === 'izin' || s === 'sakit'
      })
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0))
  }, [attendanceLogs, pokjarMap, startDate, endDate, filterPokjar])

  // Daftar guru pokjar (untuk info ringkasan).
  const pokjarGuru = useMemo(
    () => dataGuru.filter((g) => !!g.pokjar && (!filterPokjar || g.pokjar === filterPokjar)),
    [dataGuru, filterPokjar]
  )

  const handleExportExcel = () => {
    if (!startDate || !endDate) {
      alert('Pilih rentang tanggal terlebih dahulu!')
      return
    }
    if (pokjarLogs.length === 0) {
      alert('Tidak ada data presensi Pokjar pada periode ini.')
      return
    }

    const wb = XLSX.utils.book_new()
    const targets = filterPokjar ? [filterPokjar] : POKJAR_LIST

    targets.forEach((pj) => {
      const rows = pokjarLogs
        .filter((l) => (pokjarMap[l.userId] || pokjarMap[l.user_id]) === pj)
        .map((l) => ({
          'Nama Guru': l.nama,
          'Tanggal': l.tanggal,
          'Status': statusLabel(l.status),
          'Keterangan': l.keterangan || '-',
        }))

      const hadir = rows.filter((r) => r.Status === 'Hadir').length
      const izin = rows.filter((r) => r.Status === 'Izin').length
      const sakit = rows.filter((r) => r.Status === 'Sakit').length

      const summary = [
        {
          'Nama Guru': `RINGKASAN POKJAR ${pj}`,
          'Tanggal': `Hadir: ${hadir}`,
          'Status': `Izin: ${izin}`,
          'Keterangan': `Sakit: ${sakit}`,
        },
        {},
      ]

      const ws = XLSX.utils.json_to_sheet([...summary, ...rows], {
        header: ['Nama Guru', 'Tanggal', 'Status', 'Keterangan'],
      })
      // Nama sheet maks 31 karakter (batas Excel).
      XLSX.utils.book_append_sheet(wb, ws, pj.replace(/\s+/g, ' ').slice(0, 31))
    })

    XLSX.writeFile(wb, `Laporan_Pokjar_${startDate}_${endDate}.xlsx`)
    showNotification('Laporan Pokjar berhasil diunduh.')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Laporan Pokjar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rekap kehadiran guru Pokjar (Hadir / Sakit / Izin) per sekolah binaan.
          </p>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={loading || pokjarLogs.length === 0}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Download className="w-5 h-5" />
          Export Excel
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pokjar</label>
          <select
            value={filterPokjar}
            onChange={(e) => setFilterPokjar(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Semua Pokjar</option>
            {POKJAR_LIST.map((p) => (
              <option key={p} value={p}>Pokjar {p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {POKJAR_LIST.filter((p) => !filterPokjar || filterPokjar === p).map((p) => {
          const logs = pokjarLogs.filter((l) => (pokjarMap[l.userId] || pokjarMap[l.user_id]) === p)
          const hadir = logs.filter((l) => String(l.status).toLowerCase().startsWith('hadir')).length
          const izin = logs.filter((l) => String(l.status).toLowerCase() === 'izin').length
          const sakit = logs.filter((l) => String(l.status).toLowerCase() === 'sakit').length
          const guruCount = pokjarGuru.filter((g) => g.pokjar === p).length
          return (
            <div key={p} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${POKJAR_BADGE[p]}`}>
                  {p}
                </span>
                <span className="text-xs text-gray-400">{guruCount} guru</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xl font-bold text-emerald-600">{hadir}</div>
                  <div className="text-xs text-gray-500">Hadir</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-amber-500">{izin}</div>
                  <div className="text-xs text-gray-500">Izin</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-rose-500">{sakit}</div>
                  <div className="text-xs text-gray-500">Sakit</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabel detail */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-700">
            Detail Presensi ({pokjarLogs.length} catatan)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Guru</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pokjar</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-400">Memuat data...</td>
                </tr>
              ) : pokjarLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-400">
                    Tidak ada data presensi Pokjar pada periode ini.
                  </td>
                </tr>
              ) : (
                pokjarLogs.map((log) => {
                  const pj = pokjarMap[log.userId] || pokjarMap[log.user_id]
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.nama}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${POKJAR_BADGE[pj] || 'bg-gray-100 text-gray-700'}`}>
                          {pj}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{log.tanggal}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {statusLabel(log.status)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{log.keterangan || '-'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {notification.show && (
        <div className="fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {notification.message}
        </div>
      )}
    </div>
  )
}

export default LaporanPokjar