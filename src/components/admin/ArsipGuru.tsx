import { notify } from '../ui/toast'
import { Notice } from '../ui/page'
import { AppDialog } from '../ui/dialog'
import { useState, useEffect, useRef } from 'react'
import { Archive, RotateCcw, Trash2, Eye, X, Search } from 'lucide-react'
import { guruAPI, presensiAPI } from '../../services/api'
import { formatDisplayDate } from '../../utils/dateUtils'

function ArsipGuru() {
  const [arsip, setArsip] = useState([])
  const [filtered, setFiltered] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const loadRequest = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => () => { loadRequest.current++ }, [])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' })
  // Modal detail presensi
  const [detailGuru, setDetailGuru] = useState(null)
  const [presensiList, setPresensiList] = useState([])
  const [presensiLoading, setPresensiLoading] = useState(false)

  useEffect(() => {
    loadArsip()
  }, [])

  const loadArsip = async () => {
    const requestId = ++loadRequest.current
    setLoadError(null)
    setLoading(true)

    try {
      setLoading(true)
      const response = await guruAPI.getArchived()
      if (requestId !== loadRequest.current) return

      const data = response.data || []
      // Hitung jumlah presensi per guru (ringkasan)
      // Untuk efisiensi, ambil semua presensi sekali jalan lalu group by user_id
      setArsip(data)
      setFiltered(data)
    } catch (error) {
      if (requestId !== loadRequest.current) return
      setLoadError('Data belum dapat dimuat. Periksa koneksi lalu coba lagi.')

      console.error('Failed to load arsip:', error)
      showNotification('Gagal memuat data arsip: ' + error.message, 'error')
    } finally {
      requestId === loadRequest.current && setLoading(false)
    }
  }

  useEffect(() => {
    if (!searchTerm) {
      setFiltered(arsip)
      return
    }
    const lower = searchTerm.toLowerCase()
    setFiltered(
      arsip.filter(
        (g) =>
          g.nama.toLowerCase().includes(lower) ||
          (g.idGuru || '').toLowerCase().includes(lower)
      )
    )
  }, [searchTerm, arsip])

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    notify(message, type)
  }

  const handleUnarchive = async (guru) => {
    if (
      !confirm(
        `Pulihkan guru "${guru.nama}" dari arsip?\n\nGuru akan kembali muncul di dashboard, daftar guru aktif, dan dapat login kembali.`
      )
    )
      return
    try {
      await guruAPI.unarchive(guru.id)
      showNotification(`Guru "${guru.nama}" berhasil dipulihkan.`)
      loadArsip()
    } catch (error) {
      showNotification('Gagal memulihkan guru: ' + error.message, 'error')
    }
  }

  const handlePermanentDelete = async (guru) => {
    const ok = confirm(
      `⚠️ HAPUS PERMANEN data guru "${guru.nama}"?\n\n` +
        `Tindakan ini tidak dapat dibatalkan. SELURUH data presensi guru ini akan ikut terhapus permanen.\n\n` +
        `Jika Anda hanya ingin menyembunyikan guru yang keluar, gunakan "Pulihkan" lalu biarkan tetap aktif, atau biarkan tetap di arsip.\n\n` +
        `Ketik HAPUS untuk konfirmasi:`
    )
    if (!ok) return
    const ketik = prompt('Ketik "HAPUS" untuk mengonfirmasi penghapusan permanen:')
    if (ketik !== 'HAPUS') {
      showNotification('Penghapusan permanen dibatalkan.', 'error')
      return
    }
    try {
      await guruAPI.delete(guru.id)
      showNotification(`Data guru "${guru.nama}" & seluruh presensinya telah dihapus permanen.`)
      // Tutup modal jika terbuka untuk guru ini
      if (detailGuru?.id === guru.id) setDetailGuru(null)
      loadArsip()
    } catch (error) {
      showNotification('Gagal menghapus permanen: ' + error.message, 'error')
    }
  }

  const handleLihatPresensi = async (guru) => {
    setDetailGuru(guru)
    setPresensiList([])
    setPresensiLoading(true)
    try {
      const response = await presensiAPI.getAll({ user_id: guru.id })
      setPresensiList(response.data || [])
    } catch (error) {
      showNotification('Gagal memuat presensi: ' + error.message, 'error')
    } finally {
      setPresensiLoading(false)
    }
  }

  const formatTanggalArsip = (ts) => {
    if (!ts) return '-'
    const d = new Date(ts.replace(' ', 'T'))
    if (isNaN(d.getTime())) return ts
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusBadge = (status) => {
    const map = {
      hadir: 'bg-green-100 text-green-700',
      hadir_terlambat: 'bg-yellow-100 text-yellow-700',
      hadir_izin_terlambat: 'bg-yellow-100 text-yellow-700',
      izin: 'bg-blue-100 text-blue-700',
      sakit: 'bg-purple-100 text-purple-700',
      alfa: 'bg-red-100 text-red-700',
    }
    const label = (status || '').replace(/_/g, ' ')
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
          map[status] || 'bg-gray-100 text-gray-700'
        }`}
      >
        {label}
      </span>
    )
  }

  if (loadError) return <Notice onRetry={() => loadArsip()}>{loadError}</Notice>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Archive className="w-6 h-6 text-orange-600" />
            Arsip Guru
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Guru yang telah keluar dari sekolah. Data & seluruh presensi tetap tersimpan & dapat dilihat.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama / ID guru arsip..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <p className="text-sm text-gray-600 mt-3">
          Menampilkan {filtered.length} dari {arsip.length} guru arsip
        </p>
      </div>

      {/* Tabel arsip */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID Guru</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jabatan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal Bertugas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diarsipkan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alasan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.length > 0 ? (
                filtered.map((guru, index) => (
                  <tr key={guru.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                      {guru.idGuru || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{guru.nama}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDisplayDate(guru.tanggalBertugas)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatTanggalArsip(guru.archivedAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                      {guru.archiveReason || (
                        <span className="text-gray-400 italic">Tanpa alasan</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleLihatPresensi(guru)}
                          className="text-gray-600 hover:text-gray-800"
                          title="Lihat Presensi"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleUnarchive(guru)}
                          className="text-green-600 hover:text-green-800"
                          title="Pulihkan ke Guru Aktif"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(guru)}
                          className="text-red-600 hover:text-red-800"
                          title="Hapus Permanen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    {loading
                      ? 'Memuat data arsip...'
                      : 'Belum ada guru yang diarsipkan. Anda dapat mengarsipkan guru dari menu Data Guru.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detail Presensi */}
      {detailGuru && (
        <AppDialog open={true} onOpenChange={(open) => { if (!open) setDetailGuru(null) }} title="Riwayat presensi arsip" busy={false} className="sm:max-w-4xl">
<fieldset disabled={false} className="min-w-0">
<p className="mb-4 text-sm text-muted-foreground">{detailGuru.nama} · {presensiList.length} catatan</p>
            <div className="p-6">
              {presensiLoading ? (
                <div className="text-center py-8 text-gray-500">Memuat data presensi...</div>
              ) : presensiList.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Tidak ada catatan presensi untuk guru ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Jam Masuk</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Jam Pulang</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {presensiList.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2 whitespace-nowrap text-gray-900">{p.tanggal}</td>
                          <td className="px-4 py-2">{statusBadge(p.status)}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                            {p.jamMasuk && p.jamMasuk !== '-' ? p.jamMasuk : '-'}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                            {p.jamPulang && p.jamPulang !== '-' ? p.jamPulang : '-'}
                          </td>
                          <td className="px-4 py-2 text-gray-600 max-w-xs">{p.keterangan || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

</fieldset></AppDialog>
      )}

      {/* Notification */}

    </div>
  )
}

export default ArsipGuru
