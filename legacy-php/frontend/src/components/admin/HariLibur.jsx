import { useState, useEffect } from 'react'
import { Calendar, CalendarRange, Plus, Edit2, Trash2, AlertCircle, CheckCircle, X } from 'lucide-react'
import { holidaysAPI, activityAPI } from '../../services/api'
import { formatDate, formatDateForInput } from '../../utils/dateUtils'

function HariLibur({ user }) {
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add', 'edit', or 'bulk'
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [formData, setFormData] = useState({
    id: null,
    tanggal: '',
    startDate: '',
    endDate: '',
    nama: '',
    jenis: 'nasional',
    keterangan: '',
    isWorkday: 0,
    jamMasukKhusus: ''
  })

  useEffect(() => {
    loadHolidays()
  }, [selectedYear])

  const loadHolidays = async () => {
    setLoading(true)
    try {
      const response = await holidaysAPI.getAll({ year: selectedYear })
      setHolidays(response.data || [])
    } catch (error) {
      setMessage({ type: 'error', text: 'Gagal memuat data hari libur' })
    }
    setLoading(false)
  }

  const handleAdd = () => {
    setModalMode('add')
    setFormData({
      id: null,
      tanggal: '',
      startDate: '',
      endDate: '',
      nama: '',
      jenis: 'nasional',
      keterangan: '',
      isWorkday: 0,
      jamMasukKhusus: ''
    })
    setShowModal(true)
  }

  const handleAddBulk = () => {
    setModalMode('bulk')
    setFormData({
      id: null,
      tanggal: '',
      startDate: '',
      endDate: '',
      nama: '',
      jenis: 'sekolah',
      keterangan: '',
      isWorkday: 0,
      jamMasukKhusus: ''
    })
    setShowModal(true)
  }

  const handleEdit = (holiday) => {
    setModalMode('edit')
    setFormData({
      id: holiday.id,
      tanggal: holiday.tanggal,
      nama: holiday.nama,
      jenis: holiday.jenis,
      keterangan: holiday.keterangan || '',
      isWorkday: holiday.is_workday || 0,
      jamMasukKhusus: holiday.jam_masuk_khusus || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (id, nama) => {
    if (!confirm(`Hapus hari libur "${nama}"?`)) return

    setLoading(true)
    try {
      await holidaysAPI.delete(id)
      
      // Log activity
      await activityAPI.create({
        user: user.nama,
        aktivitas: 'Hapus Hari Libur',
        status: nama
      })

      setMessage({ type: 'success', text: 'Hari libur berhasil dihapus' })
      loadHolidays()
    } catch (error) {
      setMessage({ type: 'error', text: 'Gagal menghapus hari libur' })
    }
    setLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (modalMode === 'bulk') {
      if (!formData.startDate || !formData.endDate || !formData.nama) {
        setMessage({ type: 'error', text: 'Tanggal awal, tanggal akhir, dan nama harus diisi' })
        return
      }

      setLoading(true)
      try {
        await holidaysAPI.create({
          start_date: formData.startDate,
          end_date: formData.endDate,
          nama: formData.nama,
          jenis: formData.jenis,
          keterangan: formData.keterangan,
          isWorkday: formData.isWorkday,
          jamMasukKhusus: formData.jamMasukKhusus
        })

        await activityAPI.create({
          user: user.nama,
          aktivitas: 'Tambah Libur Rentang Tanggal',
          status: `${formData.nama} (${formData.startDate} s/d ${formData.endDate})`
        })

        setMessage({ type: 'success', text: 'Rentang hari libur berhasil ditambahkan' })
        setShowModal(false)
        loadHolidays()
      } catch (error) {
        setMessage({ type: 'error', text: error.message || 'Gagal menyimpan rentang hari libur' })
      }
      setLoading(false)
      return
    }
    
    if (!formData.tanggal || !formData.nama) {
      setMessage({ type: 'error', text: 'Tanggal dan nama harus diisi' })
      return
    }

    setLoading(true)
    try {
      if (modalMode === 'add') {
        await holidaysAPI.create(formData)
        
        // Log activity
        await activityAPI.create({
          user: user.nama,
          aktivitas: 'Tambah Hari Libur',
          status: formData.nama
        })

        setMessage({ type: 'success', text: 'Hari libur berhasil ditambahkan' })
      } else {
        await holidaysAPI.update(formData)
        
        // Log activity
        await activityAPI.create({
          user: user.nama,
          aktivitas: 'Edit Hari Libur',
          status: formData.nama
        })

        setMessage({ type: 'success', text: 'Hari libur berhasil diupdate' })
      }

      setShowModal(false)
      loadHolidays()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Gagal menyimpan hari libur' })
    }
    setLoading(false)
  }

  const getJenisLabel = (jenis) => {
    const labels = {
      'nasional': 'Libur Nasional',
      'cuti_bersama': 'Cuti Bersama',
      'sekolah': 'Libur Sekolah'
    }
    return labels[jenis] || jenis
  }

  const getJenisColor = (jenis) => {
    const colors = {
      'nasional': 'bg-red-100 text-red-800',
      'cuti_bersama': 'bg-yellow-100 text-yellow-800',
      'sekolah': 'bg-blue-100 text-blue-800'
    }
    return colors[jenis] || 'bg-gray-100 text-gray-800'
  }

  const years = []
  for (let i = 2024; i <= 2030; i++) {
    years.push(i)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Pengaturan Hari Libur</h2>
          <p className="text-gray-600 mt-1">Kelola hari libur nasional, cuti bersama, dan libur sekolah</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddBulk}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
            title="Tambah rentang tanggal sekaligus"
          >
            <CalendarRange className="w-5 h-5" />
            Tambah Rentang
          </button>
          <button
            onClick={handleAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Tambah Hari Libur
          </button>
        </div>
      </div>

      {/* Message */}
      {message.text && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{message.text}</span>
          <button
            onClick={() => setMessage({ type: '', text: '' })}
            className="ml-auto"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Filter Year */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <label className="text-gray-700 font-medium">Filter Tahun:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <span className="text-gray-600">
            Total: <strong>{holidays.length}</strong> hari libur
          </span>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Informasi:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Hari Sabtu dan Minggu otomatis libur (tidak perlu ditambahkan)</li>
              <li>Guru tidak bisa melakukan presensi di hari libur</li>
              <li>Hari libur akan ditampilkan dengan pesan khusus di aplikasi guru</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Memuat data...
          </div>
        ) : holidays.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>Belum ada hari libur untuk tahun {selectedYear}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Libur</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jenis</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status Kerja</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {holidays.map((holiday, index) => (
                  <tr key={holiday.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{index + 1}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formatDate(new Date(holiday.tanggal + 'T00:00:00'))}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {holiday.nama}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getJenisColor(holiday.jenis)}`}>
                        {getJenisLabel(holiday.jenis)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {holiday.keterangan || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {holiday.is_workday == 1 ? (
                        <div className="flex flex-col">
                          <span className="text-blue-600 font-bold">Tetap Masuk</span>
                          <span className="text-xs text-gray-500">Jam: {holiday.jam_masuk_khusus?.substring(0, 5) || '-'}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Libur Total</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(holiday)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(holiday.id, holiday.nama)}
                          className="text-red-600 hover:text-red-800"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              {modalMode === 'add' && 'Tambah Hari Libur'}
              {modalMode === 'edit' && 'Edit Hari Libur'}
              {modalMode === 'bulk' && 'Tambah Rentang Hari Libur'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {modalMode === 'bulk' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tanggal Awal <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tanggal Akhir <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-sm text-yellow-800">
                    <AlertCircle className="w-4 h-4 inline-block mr-1" />
                    Semua tanggal dari awal sampai akhir akan ditandai sebagai libur. Tanggal yang sudah ada akan diperbarui.
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required={modalMode !== 'bulk'}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Libur <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  placeholder="Contoh: Hari Kemerdekaan RI"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jenis Libur <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.jenis}
                  onChange={(e) => setFormData({ ...formData, jenis: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="nasional">Libur Nasional</option>
                  <option value="cuti_bersama">Cuti Bersama</option>
                  <option value="sekolah">Libur Sekolah</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Keterangan (Opsional)
                </label>
                <textarea
                  value={formData.keterangan}
                  onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                  placeholder="Keterangan tambahan..."
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Special Workday Section */}
              <div className="bg-blue-50 p-4 rounded-lg space-y-3 border border-blue-100">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isWorkday == 1}
                    onChange={(e) => setFormData({ ...formData, isWorkday: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-semibold text-blue-800">Guru Tetap Masuk (Event/Rapat)</span>
                </label>
                
                {formData.isWorkday == 1 && (
                  <div className="pl-7 space-y-2">
                    <label className="block text-xs font-medium text-blue-700">
                      Jam Masuk Khusus (Contoh: 07:30)
                    </label>
                    <input
                      type="time"
                      value={formData.jamMasukKhusus}
                      onChange={(e) => setFormData({ ...formData, jamMasukKhusus: e.target.value })}
                      className="w-full px-3 py-1.5 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 text-sm"
                      required={formData.isWorkday == 1}
                    />
                    <p className="text-[10px] text-blue-600 italic">
                      * Jadwal piket rutin akan diabaikan pada hari ini.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-1 px-4 py-2 text-white rounded-lg disabled:bg-gray-400 ${
                    modalMode === 'bulk' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {loading ? 'Menyimpan...' : modalMode === 'bulk' ? 'Tambah Rentang' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default HariLibur
