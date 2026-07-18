import { useState, useEffect } from 'react'
import { Calendar, Clock, Users, Info, Settings, UserCheck, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { jadwalPiketAPI, guruAPI } from '../../services/api'

function JadwalPiket() {
  const [data, setData] = useState(null) // payload dari getRotation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingId, setSavingId] = useState(null) // user_id yang sedang disimpan
  const [notification, setNotification] = useState({ show: false, message: '', type: '' })
  const navigate = useNavigate()

  useEffect(() => {
    loadRotation()
  }, [])

  const loadRotation = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await jadwalPiketAPI.getRotation()
      setData(response.data)
    } catch (err) {
      console.error('Gagal memuat rotasi piket:', err)
      setError(err.message || 'Gagal memuat data rotasi piket')
      showNotification('Gagal memuat data rotasi piket: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000)
  }

  // ── Persistensi per-guru yang AMAN ──
  // Backend PUT /guru.php menimpa SEMUA kolom dari payload, jadi kita wajib
  // mengirim data guru lengkap. Alur: getById → gabungkan field lama + piketGroup baru → update.
  const handleGroupChange = async (guru, newGroup) => {
    // newGroup: 'A' | 'B' | null
    const userId = guru.user_id
    const prevGroup = guru.piket_group ?? null

    // Tidak ada perubahan
    if ((prevGroup ?? '') === (newGroup ?? '')) return

    // Optimistic: langsung perbarui tampilan
    setData(prev => ({
      ...prev,
      guru: prev.guru.map(g =>
        g.user_id === userId ? { ...g, piket_group: newGroup } : g
      )
    }))
    setSavingId(userId)

    try {
      const fullRes = await guruAPI.getById(userId)
      const full = fullRes.data
      const payload = buildUpdatePayload(full, newGroup)
      await guruAPI.update(payload)
      showNotification(
        `Grup piket ${guru.nama} diperbarui ke ${
          newGroup === 'A' ? 'Grup A' : newGroup === 'B' ? 'Grup B' : 'tidak ditugaskan'
        }.`
      )
    } catch (err) {
      console.error('Gagal menyimpan grup piket:', err)
      // Rollback optimistic
      setData(prev => ({
        ...prev,
        guru: prev.guru.map(g =>
          g.user_id === userId ? { ...g, piket_group: prevGroup } : g
        )
      }))
      showNotification('Gagal menyimpan grup piket: ' + err.message, 'error')
    } finally {
      setSavingId(null)
    }
  }

  // Membangun payload update yang mirror field wajib (lihat GuruModal / backend guru.php PUT).
  // Field: id, idGuru, username, nama, tanggalLahir, jenisKelamin, alamat, noHP,
  // jabatan (array), tanggalBertugas, tipeGuru, piketGroup.
  const buildUpdatePayload = (fullData, piketGroup) => {
    const jabatan = fullData.jabatan
    const jabatanArray = Array.isArray(jabatan)
      ? jabatan.filter(j => j && String(j).trim() !== '')
      : jabatan
        ? [jabatan]
        : []

    return {
      id: fullData.id,
      idGuru: fullData.idGuru,
      username: fullData.username,
      nama: fullData.nama,
      tanggalLahir: fullData.tanggalLahir || '',
      jenisKelamin: fullData.jenisKelamin,
      alamat: fullData.alamat,
      noHP: fullData.noHP || '',
      jabatan: jabatanArray,
      tanggalBertugas: fullData.tanggalBertugas,
      tipeGuru: fullData.tipeGuru || 'full_time',
      // '' dikirim agar backend menyimpan null (lihat guru.php: trim('') => null)
      piketGroup: piketGroup || ''
    }
  }

  // ── Helper tampilan ──
  const formatTanggal = (tanggal) => {
    if (!tanggal) return '-'
    const d = new Date(tanggal)
    if (isNaN(d.getTime())) return tanggal
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const parseWeeks = (csv) => {
    if (!csv) return '-'
    const weeks = String(csv)
      .split(',')
      .map(w => w.trim())
      .filter(Boolean)
    if (weeks.length === 0) return '-'
    return weeks.map(w => `Pekan ${w}`).join(', ')
  }

  const week5Label = (mode) => {
    switch (mode) {
      case 'all': return 'Semua guru'
      case 'none': return 'Tidak ada'
      case 'A': return 'Grup A'
      case 'B': return 'Grup B'
      default: return mode || '-'
    }
  }

  const groupsLabel = (groups) => {
    if (!groups || groups.length === 0) return 'tidak ada'
    return groups.map(g => (g === 'A' ? 'Grup A' : g === 'B' ? 'Grup B' : g)).join(' & ')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Rotasi Piket Sabtu</h1>
          <p className="text-sm text-gray-600 mt-1">Pengaturan rotasi piket dwi-pekanan</p>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-6 text-center">
          <p className="font-semibold">Gagal memuat data</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={loadRotation}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Coba lagi
          </button>
        </div>
      </div>
    )
  }

  const config = data?.config || {}
  const today = data?.today || {}
  const guruList = data?.guru || []
  const piketToday = data?.piket_today || []

  const grupA = guruList.filter(g => g.piket_group === 'A')
  const grupB = guruList.filter(g => g.piket_group === 'B')
  const belum = guruList.filter(g => g.piket_group !== 'A' && g.piket_group !== 'B')

  const rotationEnabled = config.piket_rotation_enabled == '1'

  // Render satu kartu grup
  const renderGroupCard = (title, color, list, emptyMsg) => {
    const colorMap = {
      blue: { badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', ring: 'ring-blue-500' },
      indigo: { badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500', ring: 'ring-indigo-500' },
      gray: { badge: 'bg-gray-200 text-gray-600', dot: 'bg-gray-400', ring: 'ring-gray-400' }
    }
    const c = colorMap[color]

    return (
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${c.dot}`}></span>
            <h3 className="font-bold text-gray-800">{title}</h3>
          </div>
          <span className={`px-3 py-1 text-xs font-semibold rounded-full ${c.badge}`}>
            {list.length} Guru
          </span>
        </div>
        <div className="p-4">
          {list.length > 0 ? (
            <div className="space-y-2">
              {list.map(guru => {
                const isSaving = savingId === guru.user_id
                const current = guru.piket_group ?? ''
                return (
                  <div
                    key={guru.user_id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{guru.nama}</p>
                        <p className="text-[11px] text-gray-500 truncate">@{guru.username}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isSaving && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                      {/* Segmented control: A | B | — */}
                      <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                        {['A', 'B', ''].map(opt => {
                          const active = current === opt
                          const label = opt === '' ? '—' : opt
                          return (
                            <button
                              key={opt || 'none'}
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleGroupChange(guru, opt || null)}
                              title={opt === '' ? 'Tidak ditugaskan' : `Grup ${opt}`}
                              className={`px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                active
                                  ? opt === 'A'
                                    ? 'bg-blue-600 text-white'
                                    : opt === 'B'
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-gray-500 text-white'
                                  : 'bg-white text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">{emptyMsg}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Rotasi Piket Sabtu</h1>
        <p className="text-sm text-gray-600 mt-1">
          Kelola penugasan grup piket dwi-pekanan untuk guru Sabtu
        </p>
      </div>

      {/* Banner Sabtu ini */}
      <div className={`rounded-lg p-4 border ${rotationEnabled ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start gap-3">
          <Calendar className={`w-6 h-6 flex-shrink-0 mt-0.5 ${rotationEnabled ? 'text-indigo-600' : 'text-gray-500'}`} />
          <div className="flex-1">
            <p className="text-sm text-gray-600">
              {today.day_name ? `${today.day_name}, ` : ''}{formatTanggal(today.tanggal)}
            </p>
            <p className="text-lg font-bold text-gray-800 mt-1">
              {today.week_of_month
                ? `Sabtu ini pekan ke-${today.week_of_month}`
                : 'Sabtu ini'}
              {' — '}
              <span className={rotationEnabled ? 'text-indigo-600' : 'text-gray-500'}>
                piket: {rotationEnabled ? groupsLabel(today.groups_piket) : 'rotasi nonaktif'}
              </span>
            </p>
            {!rotationEnabled && (
              <p className="text-xs text-gray-500 mt-1">
                Rotasi piket sedang nonaktif. Aktifkan di menu Pengaturan untuk menerapkan penugasan grup.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Ringkasan konfigurasi (read-only) */}
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            <h3 className="font-bold text-gray-800">Konfigurasi Rotasi</h3>
          </div>
          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${rotationEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
            {rotationEnabled ? 'Rotasi Aktif' : 'Rotasi Nonaktif'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Grup A piket pekan</p>
            <p className="text-sm font-semibold text-gray-800 mt-1">{parseWeeks(config.piket_group_a_weeks)}</p>
          </div>
          <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
            <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Grup B piket pekan</p>
            <p className="text-sm font-semibold text-gray-800 mt-1">{parseWeeks(config.piket_group_b_weeks)}</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
            <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Pekan ke-5 (Sabtu ke-5)</p>
            <p className="text-sm font-semibold text-gray-800 mt-1">{week5Label(config.piket_week5_mode)}</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Jam Masuk Piket</p>
            <p className="text-sm font-semibold text-gray-800 mt-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
              {config.piket_jam_masuk || '-'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-100">
            <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Jam Pulang Piket</p>
            <p className="text-sm font-semibold text-gray-800 mt-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-rose-500" />
              {config.piket_jam_pulang || '-'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 mt-4 text-xs text-gray-500">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            Konfigurasi rotasi (pekan, mode pekan ke-5, jam piket) hanya dapat diubah di menu{' '}
            <button
              onClick={() => navigate('/pengaturan')}
              className="font-semibold text-blue-600 hover:text-blue-800 underline"
            >
              Pengaturan
            </button>
            . Halaman ini hanya mengelola penugasan grup per guru.
          </p>
        </div>
      </div>

      {/* Daftar guru per grup */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-3">Penugasan Grup Piket</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {renderGroupCard('Grup A', 'blue', grupA, 'Belum ada guru di Grup A')}
          {renderGroupCard('Grup B', 'indigo', grupB, 'Belum ada guru di Grup B')}
          {renderGroupCard('Belum Ditugaskan', 'gray', belum, 'Semua guru sudah ditugaskan')}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Gunakan tombol <span className="font-bold">A</span> / <span className="font-bold">B</span> / <span className="font-bold">—</span> pada setiap guru untuk mengubah grup piket. Perubahan disimpan otomatis.
        </p>
      </div>

      {/* Piket hari ini */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-green-600" />
            <h3 className="font-bold text-gray-800">Piket Sabtu Ini</h3>
          </div>
          <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
            piketToday.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {piketToday.length} Guru
          </span>
        </div>
        <div className="p-4">
          {piketToday.length > 0 ? (
            <div className="space-y-2">
              {piketToday.map(p => (
                <div
                  key={p.user_id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="font-semibold text-gray-800">{p.nama_guru}</p>
                      <p className="text-[11px] text-gray-500">
                        Grup {p.piket_group === 'A' ? 'A' : p.piket_group === 'B' ? 'B' : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <Clock className="w-3.5 h-3.5 text-emerald-500" />
                      Datang: {(p.jam_piket || '-').substring(0, 5)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <Clock className="w-3.5 h-3.5 text-rose-500" />
                      Pulang: {(p.jam_pulang_piket || '-').substring(0, 5)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <UserCheck className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">
                {rotationEnabled
                  ? 'Tidak ada guru yang berjaga piket Sabtu ini.'
                  : 'Rotasi piket nonaktif — tidak ada jadwal piket.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Notification */}
      {notification.show && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in ${
          notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white`}>
          {notification.message}
        </div>
      )}
    </div>
  )
}

export default JadwalPiket