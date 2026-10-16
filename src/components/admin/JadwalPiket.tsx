import { notify } from '../ui/toast'
import { Notice } from '../ui/page'
import { AppDialog } from '../ui/dialog'
import { useState, useEffect, useRef } from 'react'
import { Plus, Edit2, Trash2, Calendar, Clock, User, Info } from 'lucide-react'
import { jadwalPiketAPI, guruAPI } from '../../services/api'

function JadwalPiket() {
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [jadwalPiket, setJadwalPiket] = useState([])
  const [dataGuru, setDataGuru] = useState([])
  const loadRequest = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => () => { loadRequest.current++ }, [])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingJadwal, setEditingJadwal] = useState(null)
  const [notification, setNotification] = useState({ show: false, message: '', type: '' })
  const [filterHari, setFilterHari] = useState('all')

  const hariList = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

  const [formData, setFormData] = useState({
    user_id: '',
    nama_guru: '',
    hari: 'Senin',
    jam_piket: '07:00',
    jam_pulang_piket: '13:00',
    keterangan: '',
    is_active: 1
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const requestId = ++loadRequest.current
    setLoadError(null)
    setLoading(true)

    try {
      setLoading(true)
      const [jadwalResponse, guruResponse] = await Promise.all([
        jadwalPiketAPI.getAll(),
        guruAPI.getAll()
      ])
      if (requestId !== loadRequest.current) return

      setJadwalPiket(jadwalResponse.data)
      setDataGuru(guruResponse.data)
    } catch (error) {
      if (requestId !== loadRequest.current) return
      setLoadError('Data belum dapat dimuat. Periksa koneksi lalu coba lagi.')

      console.error('Failed to load data:', error)
      showNotification('Gagal memuat data: ' + error.message, 'error')
    } finally {
      requestId === loadRequest.current && setLoading(false)
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    notify(message, type)
  }

  const handleAdd = () => {
    setEditingJadwal(null)
    setFormData({
      user_id: '',
      nama_guru: '',
      hari: 'Senin',
      jam_piket: '07:00',
      jam_pulang_piket: '13:00',
      keterangan: '',
      is_active: 1
    })
    setShowModal(true)
  }

  const handleEdit = (jadwal) => {
    setEditingJadwal(jadwal)
    setFormData({
      user_id: jadwal.user_id,
      nama_guru: jadwal.nama_guru,
      hari: jadwal.hari,
      jam_piket: jadwal.jam_piket.substring(0, 5), // HH:MM
      jam_pulang_piket: (jadwal.jam_pulang_piket || '13:00:00').substring(0, 5),
      keterangan: jadwal.keterangan || '',
      is_active: jadwal.is_active
    })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus jadwal piket ini?')) {
      try {
        await jadwalPiketAPI.delete(id)
        showNotification('Jadwal piket berhasil dihapus!')
        loadData()
      } catch (error) {
        showNotification('Gagal menghapus jadwal piket: ' + error.message, 'error')
      }
    }
  }

  const handleToggleActive = async (jadwal) => {
    try {
      await jadwalPiketAPI.toggleActive(jadwal.id)
      showNotification(
        jadwal.is_active == 1
          ? 'Jadwal piket dinonaktifkan. Data tetap tersimpan.'
          : 'Jadwal piket diaktifkan kembali.'
      )
      loadData()
    } catch (error) {
      showNotification('Gagal mengubah status jadwal piket: ' + error.message, 'error')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {



    if (!formData.user_id || !formData.nama_guru) {
      showNotification('Pilih guru terlebih dahulu', 'error')
      return
    }

    try {
      if (editingJadwal) {
        await jadwalPiketAPI.update({ ...formData, id: editingJadwal.id })
        showNotification('Jadwal piket berhasil diupdate!')
      } else {
        await jadwalPiketAPI.create(formData)
        showNotification('Jadwal piket berhasil ditambahkan!')
      }
      setShowModal(false)
      loadData()
    } catch (error) {
      showNotification('Gagal menyimpan jadwal piket: ' + error.message, 'error')
    }

    } finally { savingRef.current = false; setSaving(false) }
  }

  const handleGuruChange = (e) => {
    const guruId = parseInt(e.target.value)
    const guru = dataGuru.find(g => g.id === guruId)
    if (guru) {
      setFormData({
        ...formData,
        user_id: guru.id,
        nama_guru: guru.nama
      })
    }
  }

  const handleHariChange = (e) => {
    const newHari = e.target.value
    let newJamPulang = formData.jam_pulang_piket

    // Jika ganti ke Jumat, set default 10:15
    if (newHari === 'Jumat') {
      newJamPulang = '10:15'
    } else if (formData.hari === 'Jumat') {
      // Jika sebelumnya Jumat dan ganti ke hari lain, set kembali ke 13:00
      newJamPulang = '13:00'
    }

    setFormData({
      ...formData,
      hari: newHari,
      jam_pulang_piket: newJamPulang
    })
  }

  const getFilteredJadwal = () => {
    if (filterHari === 'all') return jadwalPiket
    return jadwalPiket.filter(j => j.hari === filterHari)
  }

  const filteredJadwal = getFilteredJadwal()

  // Group by hari
  const jadwalByHari = hariList.reduce((acc, hari) => {
    acc[hari] = filteredJadwal.filter(j => j.hari === hari)
    return acc
  }, {})

  if (loadError) return <Notice onRetry={() => loadData()}>{loadError}</Notice>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Jadwal Piket Guru</h1>
          <p className="text-sm text-gray-600 mt-1">Kelola jadwal piket guru per hari</p>
        </div>
        <div className="flex gap-2">
          <select
            value={filterHari}
            onChange={(e) => setFilterHari(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Semua Hari</option>
            {hariList.map(hari => (
              <option key={hari} value={hari}>{hari}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Tambah Jadwal
          </button>
        </div>
      </div>

      {/* Info banner: fitur toggle aktif/nonaktif */}
      <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Fitur Aktifkan / Nonaktifkan Jadwal Piket</p>
          <p className="mt-0.5">
            Gunakan tombol <span className="font-bold">On / Off</span> pada setiap jadwal untuk menonaktifkan sementara tanpa menghapus data.
            Cocok ketika ada agenda rapat atau libur peserta didik — jadwal tetap tersimpan dan bisa diaktifkan kembali kapan saja.
            Jadwal yang <span className="font-bold">Off</span> tidak akan diterapkan saat presensi.
          </p>
        </div>
      </div>

      {/* Jadwal per Hari */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {hariList.map(hari => {
          const jadwalHari = jadwalByHari[hari]
          if (filterHari !== 'all' && filterHari !== hari) return null
          const aktifCount = jadwalHari.filter(j => j.is_active == 1).length
          const nonaktifCount = jadwalHari.length - aktifCount

          return (
            <div key={hari} className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200 bg-blue-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-gray-800">{hari}</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {nonaktifCount > 0 && (
                      <span className="px-2.5 py-1 bg-gray-200 text-gray-600 text-xs font-semibold rounded-full">
                        {nonaktifCount} Off
                      </span>
                    )}
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      aktifCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {jadwalHari.length} Guru
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4">
                {jadwalHari.length > 0 ? (
                  <div className="space-y-2">
                    {jadwalHari.map(jadwal => {
                      const isActive = jadwal.is_active == 1
                      return (
                      <div
                        key={jadwal.id}
                        className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                          isActive ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-100 opacity-60 hover:opacity-80'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <User className={`w-4 h-4 ${isActive ? 'text-gray-500' : 'text-gray-400'}`} />
                            <p className={`font-semibold ${isActive ? 'text-gray-800' : 'text-gray-500 line-through'}`}>{jadwal.nama_guru}</p>
                            {!isActive && (
                              <span className="px-2 py-0.5 bg-gray-300 text-gray-600 text-[9px] font-bold rounded-full uppercase">
                                Nonaktif
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-emerald-500" />
                              <p className="text-xs text-gray-600">
                                Datang: {jadwal.jam_piket.substring(0, 5)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-rose-500" />
                              <p className="text-xs text-gray-600">
                                Pulang: {(jadwal.jam_pulang_piket || '16:00:00').substring(0, 5)}
                              </p>
                            </div>
                          </div>
                          {jadwal.keterangan && (
                            <p className="text-xs text-gray-500 mt-1">{jadwal.keterangan}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Toggle Switch Aktif/Nonaktif */}
                          <button
                            onClick={() => handleToggleActive(jadwal)}
                            className="flex items-center gap-1 group"
                            title={isActive ? 'Klik untuk menonaktifkan jadwal piket' : 'Klik untuk mengaktifkan kembali jadwal piket'}
                          >
                            {/* Track */}
                            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              isActive ? 'bg-green-500' : 'bg-gray-300'
                            }`}>
                              {/* Knob */}
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                isActive ? 'translate-x-4' : 'translate-x-1'
                              }`} />
                            </span>
                            <span className={`text-[9px] font-bold uppercase ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                              {isActive ? 'On' : 'Off'}
                            </span>
                          </button>
                          <button
                            onClick={() => handleEdit(jadwal)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(jadwal.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Belum ada jadwal piket</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <AppDialog open={true} onOpenChange={(open) => { if (!open) setShowModal(false) }} title={editingJadwal ? 'Edit jadwal piket' : 'Tambah jadwal piket'} busy={saving}>
<fieldset disabled={saving} className="min-w-0">
{notification.show && notification.type === 'error' && <Notice>{notification.message}</Notice>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="jadwalpiket-field-34" className="block text-sm font-medium text-gray-700 mb-2">
                  Pilih Guru
                </label>
                <select id="jadwalpiket-field-34" aria-label="Pilih Guru"
                  value={formData.user_id}
                  onChange={handleGuruChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Pilih Guru --</option>
                  {dataGuru.map(guru => (
                    <option key={guru.id} value={guru.id}>{guru.nama}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="jadwalpiket-field-35" className="block text-sm font-medium text-gray-700 mb-2">
                  Hari
                </label>
                <select id="jadwalpiket-field-35" aria-label="Hari"
                  value={formData.hari}
                  onChange={handleHariChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {hariList.map(hari => (
                    <option key={hari} value={hari}>{hari}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="jadwalpiket-field-36" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Jam Datang
                  </label>
                  <input id="jadwalpiket-field-36" aria-label="Jam Datang"
                    type="time"
                    value={formData.jam_piket}
                    onChange={(e) => setFormData({ ...formData, jam_piket: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="jadwalpiket-field-37" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Jam Pulang
                  </label>
                  <input id="jadwalpiket-field-37" aria-label="Jam Pulang"
                    type="time"
                    value={formData.jam_pulang_piket}
                    onChange={(e) => setFormData({ ...formData, jam_pulang_piket: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="jadwalpiket-field-38" className="block text-sm font-medium text-gray-700 mb-2">
                  Keterangan (Opsional)
                </label>
                <textarea id="jadwalpiket-field-38" aria-label="Keterangan (Opsional)"
                  value={formData.keterangan}
                  onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: Piket pagi, Piket siang"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-700">Status Jadwal Piket</p>
                  <p className="text-xs text-gray-500">
                    {formData.is_active == 1 ? 'Aktif — diterapkan saat presensi' : 'Nonaktif — data tersimpan, tidak diterapkan'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: formData.is_active == 1 ? 0 : 1 })}
                  className="flex items-center gap-1.5"
                >
                  <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    formData.is_active == 1 ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      formData.is_active == 1 ? 'translate-x-4' : 'translate-x-1'
                    }`} />
                  </span>
                  <span className={`text-xs font-bold uppercase ${formData.is_active == 1 ? 'text-green-600' : 'text-gray-400'}`}>
                    {formData.is_active == 1 ? 'On' : 'Off'}
                  </span>
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Simpan
                </button>
              </div>
            </form>

</fieldset></AppDialog>
      )}

      {/* Notification */}

    </div>
  )
}

export default JadwalPiket
