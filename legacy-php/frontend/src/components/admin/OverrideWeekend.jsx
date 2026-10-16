import { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, CheckCircle, XCircle, Save, Trash2, Users, AlertCircle } from 'lucide-react'
import { guruAPI, weekendOverridesAPI } from '../../services/api'
import { formatDateForInput, getDayName } from '../../utils/dateUtils'

function OverrideWeekend() {
  const [gurus, setGurus] = useState([])
  const [selectedGurus, setSelectedGurus] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [overrideType, setOverrideType] = useState('workday') // 'workday' or 'off'
  const [keterangan, setKeterangan] = useState('')
  const [overrides, setOverrides] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterGender, setFilterGender] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' })

  // State untuk bulk override berdasarkan gender
  const [bulkDate, setBulkDate] = useState('')
  const [bulkGenders, setBulkGenders] = useState([])
  const [bulkType, setBulkType] = useState('workday')
  const [bulkKeterangan, setBulkKeterangan] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => {
    const today = new Date()
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    setPeriodStart(formatDateForInput(firstDay))
    setPeriodEnd(formatDateForInput(today))
    loadInitialData()
  }, [])

  useEffect(() => {
    if (periodStart && periodEnd) {
      loadOverrides()
    }
  }, [periodStart, periodEnd])

  const loadInitialData = async () => {
    try {
      setLoading(true)
      const guruResponse = await guruAPI.getAll()
      setGurus(guruResponse.data || [])
    } catch (error) {
      showNotification('Gagal memuat data guru: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadOverrides = async () => {
    try {
      const response = await weekendOverridesAPI.getAll({ start_date: periodStart, end_date: periodEnd })
      setOverrides(response.data || [])
    } catch (error) {
      console.error('Failed to load overrides:', error)
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000)
  }

  const handleSelectAll = () => {
    const filtered = getFilteredGurus()
    const allSelected = filtered.length > 0 && filtered.every(g => selectedGurus.includes(g.id))
    if (allSelected) {
      setSelectedGurus(prev => prev.filter(id => !filtered.some(g => g.id === id)))
    } else {
      const newSelected = [...new Set([...selectedGurus, ...filtered.map(g => g.id)])]
      setSelectedGurus(newSelected)
    }
  }

  const handleToggleGuru = (guruId) => {
    setSelectedGurus(prev =>
      prev.includes(guruId) ? prev.filter(id => id !== guruId) : [...prev, guruId]
    )
  }

  const handleToggleBulkGender = (gender) => {
    setBulkGenders(prev =>
      prev.includes(gender) ? prev.filter(g => g !== gender) : [...prev, gender]
    )
  }

  const handleBulkSave = async () => {
    if (bulkGenders.length === 0) {
      showNotification('Pilih minimal satu gender', 'error')
      return
    }
    if (!bulkDate) {
      showNotification('Pilih tanggal Sabtu/Minggu', 'error')
      return
    }
    if (!isWeekendDate(bulkDate)) {
      showNotification('Override hanya untuk hari Sabtu atau Minggu', 'error')
      return
    }

    try {
      setBulkSaving(true)
      const payload = {
        tanggal: bulkDate,
        apply_to_gender: bulkGenders,
        is_workday: bulkType === 'workday' ? 1 : 0,
        keterangan: bulkKeterangan || (bulkType === 'workday' ? 'Wajib hadir' : 'Libur')
      }

      await weekendOverridesAPI.create(payload)
      showNotification(`Override berhasil disimpan untuk gender ${bulkGenders.join(', ')}`, 'success')
      setBulkGenders([])
      setBulkKeterangan('')
      loadOverrides()
    } catch (error) {
      showNotification('Gagal menyimpan override gender: ' + error.message, 'error')
    } finally {
      setBulkSaving(false)
    }
  }

  const getFilteredGurus = () => {
    return gurus.filter(guru => {
      if (filterGender && (guru.jenisKelamin || guru.jenis_kelamin) !== filterGender) return false
      return true
    })
  }

  const isWeekendDate = (dateStr) => {
    if (!dateStr) return false
    const day = new Date(`${dateStr}T00:00:00`).getDay()
    return day === 0 || day === 6
  }

  const handleSave = async () => {
    if (selectedGurus.length === 0) {
      showNotification('Pilih minimal satu guru', 'error')
      return
    }
    if (!selectedDate) {
      showNotification('Pilih tanggal Sabtu/Minggu', 'error')
      return
    }
    if (!isWeekendDate(selectedDate)) {
      showNotification('Override hanya untuk hari Sabtu atau Minggu', 'error')
      return
    }

    try {
      setSaving(true)
      const payload = selectedGurus.map(userId => ({
        user_id: userId,
        tanggal: selectedDate,
        is_workday: overrideType === 'workday' ? 1 : 0,
        keterangan: keterangan || (overrideType === 'workday' ? 'Wajib hadir' : 'Libur')
      }))

      await weekendOverridesAPI.create(payload)
      showNotification(`Override berhasil disimpan untuk ${selectedGurus.length} guru`, 'success')
      setSelectedGurus([])
      setKeterangan('')
      loadOverrides()
    } catch (error) {
      showNotification('Gagal menyimpan override: ' + error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Yakin ingin menghapus override ini?')) return
    try {
      await weekendOverridesAPI.delete(id)
      showNotification('Override berhasil dihapus', 'success')
      loadOverrides()
    } catch (error) {
      showNotification('Gagal menghapus override: ' + error.message, 'error')
    }
  }

  const getGuruName = (userId) => {
    const guru = gurus.find(g => g.id === userId)
    return guru?.nama || `ID ${userId}`
  }

  const getGuruGender = (userId) => {
    const guru = gurus.find(g => g.id === userId)
    return guru?.jenisKelamin || guru?.jenis_kelamin || '-'
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
          <h1 className="text-2xl font-bold text-gray-800">Override Weekend per Guru</h1>
          <p className="text-sm text-gray-600">Atur hari kerja Sabtu/Minggu khusus per guru</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          Fitur ini menggantikan aturan gender global untuk tanggal Sabtu/Minggu tertentu.
          Gunakan untuk kegiatan insidental yang hanya melibatkan sebagian guru.
        </p>
      </div>

      {/* Bulk Override Berdasarkan Gender */}
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-800">Override Berdasarkan Gender</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal Sabtu/Minggu</label>
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            {bulkDate && (
              <p className="text-xs mt-1 text-gray-500">{getDayName(bulkDate)}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gender yang Diterapkan</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkGenders.includes('Laki-laki')}
                  onChange={() => handleToggleBulkGender('Laki-laki')}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Laki-laki</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkGenders.includes('Perempuan')}
                  onChange={() => handleToggleBulkGender('Perempuan')}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Perempuan</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="flex gap-2">
              <button
                onClick={() => setBulkType('workday')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                  bulkType === 'workday'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                Wajib Hadir
              </button>
              <button
                onClick={() => setBulkType('off')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                  bulkType === 'off'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 hover:border-red-300'
                }`}
              >
                <XCircle className="w-4 h-4" />
                Libur
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Keterangan (opsional)</label>
            <input
              type="text"
              value={bulkKeterangan}
              onChange={(e) => setBulkKeterangan(e.target.value)}
              placeholder="Contoh: Kegiatan Maulid"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          onClick={handleBulkSave}
          disabled={bulkSaving || bulkGenders.length === 0 || !bulkDate}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
        >
          <Users className="w-5 h-5" />
          {bulkSaving ? 'Menyimpan...' : 'Simpan Override Gender'}
        </button>
      </div>

      {/* Form Override */}
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-800">Tambah Override Manual (Per Guru)</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal Sabtu/Minggu</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            {selectedDate && (
              <p className="text-xs mt-1 text-gray-500">{getDayName(selectedDate)}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="flex gap-2">
              <button
                onClick={() => setOverrideType('workday')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                  overrideType === 'workday'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                Wajib Hadir
              </button>
              <button
                onClick={() => setOverrideType('off')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                  overrideType === 'off'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 hover:border-red-300'
                }`}
              >
                <XCircle className="w-4 h-4" />
                Libur
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Keterangan (opsional)</label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Contoh: Kegiatan Maulid"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Filter & Select Guru */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Pilih Guru</label>
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Semua Gender</option>
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
              <input
                type="checkbox"
                id="select-all"
                checked={getFilteredGurus().length > 0 && getFilteredGurus().every(g => selectedGurus.includes(g.id))}
                onChange={handleSelectAll}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label htmlFor="select-all" className="text-sm font-medium text-gray-700 cursor-pointer">
                Pilih Semua ({getFilteredGurus().length} guru)
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {getFilteredGurus().map(guru => (
                <label
                  key={guru.id}
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedGurus.includes(guru.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedGurus.includes(guru.id)}
                    onChange={() => handleToggleGuru(guru.id)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{guru.nama}</p>
                    <p className="text-xs text-gray-500">{guru.jenisKelamin || guru.jenis_kelamin || '-'}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <p className="text-sm text-gray-600">
            {selectedGurus.length} guru dipilih
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || selectedGurus.length === 0 || !selectedDate}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Menyimpan...' : 'Simpan Override'}
        </button>
      </div>

      {/* List Overrides */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Daftar Override</h2>
          <div className="flex gap-2">
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <span className="text-gray-500 self-center">s/d</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {overrides.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Belum ada override untuk periode ini
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Guru</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gender</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {overrides.map(override => (
                  <tr key={override.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {override.tanggal}
                      <p className="text-xs text-gray-500">{getDayName(override.tanggal)}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{override.nama_guru || getGuruName(override.user_id)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{override.jenis_kelamin || getGuruGender(override.user_id)}</td>
                    <td className="px-4 py-3 text-center">
                      {override.is_workday == 1 ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3" /> Wajib Hadir
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                          <XCircle className="w-3 h-3" /> Libur
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{override.keterangan || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(override.id)}
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

export default OverrideWeekend
