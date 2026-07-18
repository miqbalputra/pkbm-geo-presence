import { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, Plus, Trash2, AlertCircle } from 'lucide-react'
import { optionalWorkdaysAPI } from '../../services/api'
import { formatDateForInput, getDayName } from '../../utils/dateUtils'

function OptionalWorkdays() {
  const [workdays, setWorkdays] = useState([])
  const [loading, setLoading] = useState(true)
  const [tanggal, setTanggal] = useState('')
  const [nama, setNama] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' })

  useEffect(() => {
    loadWorkdays()
  }, [])

  const loadWorkdays = async () => {
    try {
      setLoading(true)
      const response = await optionalWorkdaysAPI.getAll()
      setWorkdays(response.data || [])
    } catch (error) {
      showNotification('Gagal memuat data: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!tanggal || !nama.trim()) {
      showNotification('Tanggal dan nama harus diisi', 'error')
      return
    }
    try {
      await optionalWorkdaysAPI.create({ tanggal, nama: nama.trim(), keterangan: keterangan.trim() })
      showNotification('Hari kerja opsional berhasil disimpan')
      setTanggal('')
      setNama('')
      setKeterangan('')
      loadWorkdays()
    } catch (error) {
      showNotification('Gagal menyimpan: ' + error.message, 'error')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Yakin ingin menghapus hari kerja opsional ini?')) return
    try {
      await optionalWorkdaysAPI.delete(id)
      showNotification('Berhasil dihapus')
      loadWorkdays()
    } catch (error) {
      showNotification('Gagal menghapus: ' + error.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarIcon className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Hari Kerja Opsional</h1>
          <p className="text-sm text-gray-600">Atur hari kerja insidental: yang hadir dihitung, yang tidak hadir tidak alfa.</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          Gunakan fitur ini untuk hari seperti remidial, kegiatan tambahan, atau insidental lain.
          Guru yang mengisi presensi di hari ini akan mendapat kehadiran bonus, sementara guru yang tidak hadir tidak akan dikenai alfa.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Tambah Hari Kerja Opsional</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            {tanggal && <p className="text-xs mt-1 text-gray-500">{getDayName(tanggal)}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nama Kegiatan</label>
            <input
              type="text"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Contoh: Remidial"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Keterangan (opsional)</label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Contoh: Remidial semester genap"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          type="submit"
          className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
        >
          <Plus className="w-5 h-5" />
          Simpan
        </button>
      </form>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Daftar Hari Kerja Opsional</h2>
        {workdays.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Belum ada hari kerja opsional</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {workdays.map(day => (
                  <tr key={day.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {day.tanggal}
                      <p className="text-xs text-gray-500">{getDayName(day.tanggal)}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{day.nama}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{day.keterangan || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(day.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {notification.show && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in ${
          notification.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        } text-white`}>
          {notification.message}
        </div>
      )}
    </div>
  )
}

export default OptionalWorkdays
