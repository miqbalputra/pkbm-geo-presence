import { useState, useEffect, useRef } from 'react'
import { Save, Clock, MapPin, Timer, Map, School, ExternalLink, TestTube, CalendarCheck, Trash2, AlertTriangle, RefreshCw, ShieldCheck, ArrowRight, MessageCircle } from 'lucide-react'
import { PageHeader, Notice } from '../ui/page'
import { adminMonthlyAttendanceConfirmationAPI, settingsAPI, pengaturanHarianAPI, todayCheckInRecalculationAPI } from '../../services/api'

const statusLabel = (status) => ({
  hadir: 'Hadir tepat waktu',
  hadir_terlambat: 'Terlambat',
  hadir_izin_terlambat: 'Terlambat',
}[status] || status || '-')

const statusTone = (status) => status === 'hadir'
  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  : 'bg-amber-50 text-amber-800 ring-amber-200'

const latenessNoteChange = (item) => {
  if (!item.note_changed) return ''
  if (typeof item.new_late_minutes === 'number') {
    const previous = typeof item.old_late_minutes === 'number' ? `${item.old_late_minutes} menit` : 'belum tercatat'
    return `Keterangan terlambat: ${previous} → ${item.new_late_minutes} menit`
  }
  return 'Keterangan terlambat dihapus karena status sudah tepat waktu'
}

const jakartaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
const csvNumbers = (value: unknown, min: number, max: number, fallback: number[] = []) => {
  const parts = String(value ?? '').split(/[\s,]+/).filter(Boolean).map(Number).filter((number) => Number.isInteger(number) && number >= min && number <= max)
  return new Set(parts.length ? parts : fallback)
}

function Pengaturan() {
  const [section, setSection] = useState('Presensi')
  const [loadError, setLoadError] = useState('')
  const [settings, setSettings] = useState({
    jam_masuk_normal: '07:20',
    toleransi_terlambat: '15',
    radius_gps: '500',
    sekolah_latitude: '-5.1477',
    sekolah_longitude: '119.4327',
    sekolah_nama: 'Sekolah',
    mode_testing: '1',
    piket_terlambat_adalah_terlambat: '0',
    button_enabled: '1',
    jam_min_pulang: '12:30',
    weekend_workday_enabled: '0',
    saturday_male_workday_enabled: '0',
    saturday_female_workday_enabled: '0',
    sunday_male_workday_enabled: '0',
    sunday_female_workday_enabled: '0',
    apel_senin_enabled: '1',
    location_tracking_enabled: '0',
    location_tracking_interval_minutes: '15',
    location_tracking_accuracy_limit: '100',
    workday_days: '6',
    piket_rotation_enabled: '1',
    piket_group_a_weeks: '1,3',
    piket_group_b_weeks: '2,4',
    piket_week5_mode: 'all',
    piket_jam_masuk: '07:00',
    piket_jam_pulang: '13:00'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState({ show: false, message: '', type: '' })
  const [showPanduan, setShowPanduan] = useState(false)
  const [recalculationPreview, setRecalculationPreview] = useState(null)
  const [recalculationLoading, setRecalculationLoading] = useState(true)
  const [recalculationApplying, setRecalculationApplying] = useState(false)
  const [recalculationError, setRecalculationError] = useState('')
  const [recalculationDate, setRecalculationDate] = useState(() => jakartaToday())
  const recalculationRequest = useRef(0)
  const [monthlyContact, setMonthlyContact] = useState('')
  const [monthlyContactLoading, setMonthlyContactLoading] = useState(true)
  const [monthlyContactSaving, setMonthlyContactSaving] = useState(false)
  const [monthlyContactError, setMonthlyContactError] = useState('')

  // Override jam pulang per-tanggal (pengaturan harian khusus)
  const todayStr = jakartaToday()
  const [harianForm, setHarianForm] = useState({
    tanggal: todayStr,
    jam_pulang_khusus: '',
    jam_pulang_khusus_aktif: false,
    jam_pulang_piket_khusus: '',
    jam_pulang_piket_khusus_aktif: false,
    keterangan: '',
  })
  const [harianList, setHarianList] = useState([])
  const [savingHarian, setSavingHarian] = useState(false)

  useEffect(() => {
    loadSettings()
    loadHarian()
    loadRecalculationPreview()
    loadMonthlyContact()
  }, [])

  const loadMonthlyContact = async () => {
    try {
      setMonthlyContactLoading(true)
      setMonthlyContactError('')
      const response = await adminMonthlyAttendanceConfirmationAPI.getContact()
      setMonthlyContact(response.data?.adminPhone || '')
    } catch (error) {
      setMonthlyContactError(error.message || 'Nomor WhatsApp admin belum dapat dimuat.')
    } finally {
      setMonthlyContactLoading(false)
    }
  }

  const loadRecalculationPreview = async (date = recalculationDate) => {
    const requestID = ++recalculationRequest.current
    try {
      setRecalculationLoading(true)
      setRecalculationError('')
      const response = await todayCheckInRecalculationAPI.preview(date)
      if (requestID !== recalculationRequest.current) return
      setRecalculationPreview(response.data || null)
    } catch (error) {
      if (requestID !== recalculationRequest.current) return
      setRecalculationError(error.message || 'Pratinjau perbaikan status belum dapat dimuat.')
    } finally {
      if (requestID === recalculationRequest.current) setRecalculationLoading(false)
    }
  }

  const handleRecalculationDateChange = (date) => {
    setRecalculationDate(date)
    setRecalculationPreview(null)
    if (!date) {
      recalculationRequest.current += 1
      setRecalculationLoading(false)
      setRecalculationError('Pilih tanggal presensi yang ingin diperiksa.')
      return
    }
    loadRecalculationPreview(date)
  }

  const applyTodayCheckInRecalculation = async () => {
    if (!recalculationPreview?.changed || recalculationApplying || recalculationLoading || recalculationPreview.date !== recalculationDate) return
    const count = recalculationPreview.changed
    if (!window.confirm(`Sesuaikan status masuk tanggal ${recalculationPreview.date} untuk ${count} presensi? Jam masuk, jam pulang, GPS, izin, sakit, dan catatan manual tidak akan diubah.`)) return
    try {
      setRecalculationApplying(true)
      const response = await todayCheckInRecalculationAPI.apply(recalculationDate)
      showNotification(response.message || `${count} status masuk hari ini berhasil disesuaikan.`, 'success')
      await loadRecalculationPreview(recalculationDate)
    } catch (error) {
      showNotification('Gagal menyesuaikan status masuk: ' + (error.message || 'Silakan coba lagi.'), 'error')
    } finally {
      setRecalculationApplying(false)
    }
  }

  const loadHarian = async () => {
    try {
      const response = await pengaturanHarianAPI.getAll()
      setHarianList(response.data || [])
    } catch (error) {
      console.error('Failed to load pengaturan harian:', error)
    }
  }

  const handleHarianChange = (key, value) => {
    setHarianForm(prev => ({ ...prev, [key]: value }))
  }

  const handleHarianToggle = (key) => {
    setHarianForm(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleHarianSave = async () => {
    if (!harianForm.tanggal) {
      showNotification('Tanggal wajib diisi', 'error')
      return
    }
    if (harianForm.jam_pulang_khusus_aktif && !harianForm.jam_pulang_khusus) {
      showNotification('Jam pulang semua guru harus diisi saat diaktifkan', 'error')
      return
    }
    if (harianForm.jam_pulang_piket_khusus_aktif && !harianForm.jam_pulang_piket_khusus) {
      showNotification('Jam pulang khusus piket harus diisi saat diaktifkan', 'error')
      return
    }
    try {
      setSavingHarian(true)
      await pengaturanHarianAPI.upsert({
        tanggal: harianForm.tanggal,
        jam_pulang_khusus: harianForm.jam_pulang_khusus || '',
        jam_pulang_khusus_aktif: harianForm.jam_pulang_khusus_aktif ? 1 : 0,
        jam_pulang_piket_khusus: harianForm.jam_pulang_piket_khusus || '',
        jam_pulang_piket_khusus_aktif: harianForm.jam_pulang_piket_khusus_aktif ? 1 : 0,
        keterangan: harianForm.keterangan || '',
      })
      showNotification('Pengaturan harian berhasil disimpan!', 'success')
      await loadHarian()
    } catch (error) {
      showNotification('Gagal menyimpan pengaturan harian: ' + error.message, 'error')
    } finally {
      setSavingHarian(false)
    }
  }

  const handleHarianDelete = async (tanggal) => {
    if (!window.confirm(`Hapus pengaturan harian untuk tanggal ${tanggal}?`)) return
    try {
      await pengaturanHarianAPI.delete(tanggal)
      showNotification('Pengaturan harian dihapus', 'success')
      await loadHarian()
    } catch (error) {
      showNotification('Gagal menghapus: ' + error.message, 'error')
    }
  }

  const handleHarianEdit = (row) => {
    setHarianForm({
      tanggal: row.tanggal,
      jam_pulang_khusus: row.jam_pulang_khusus || '',
      jam_pulang_khusus_aktif: !!row.jam_pulang_khusus_aktif,
      jam_pulang_piket_khusus: row.jam_pulang_piket_khusus || '',
      jam_pulang_piket_khusus_aktif: !!row.jam_pulang_piket_khusus_aktif,
      keterangan: row.keterangan || '',
    })
    setSection('Jadwal')
    window.setTimeout(() => document.getElementById('daily-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const loadSettings = async () => {
    try {
      setLoading(true)
      setLoadError('')
      const response = await settingsAPI.getAll()
      setSettings((previous) => ({ ...previous, ...(response.data || {}) }))
    } catch (error) {
      setLoadError(error.message || 'Pengaturan belum dapat dimuat.')
      console.error('Failed to load settings:', error)
      showNotification('Gagal memuat pengaturan: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    // Feedback remains available until dismissed.
  }

  const saveMonthlyContact = async () => {
    try {
      setMonthlyContactSaving(true)
      setMonthlyContactError('')
      const response = await adminMonthlyAttendanceConfirmationAPI.updateContact(monthlyContact)
      setMonthlyContact(response.data?.adminPhone || '')
      showNotification('Nomor WhatsApp admin untuk koreksi rekap berhasil disimpan.', 'success')
    } catch (error) {
      setMonthlyContactError(error.message || 'Nomor WhatsApp admin gagal disimpan.')
    } finally {
      setMonthlyContactSaving(false)
    }
  }

  const handleSave = async (settingKey, overrideValue = null) => {
    try {
      setSaving(true)
      const valueToSave = overrideValue !== null ? overrideValue : settings[settingKey]
      await settingsAPI.update(settingKey, valueToSave)
      showNotification('Pengaturan berhasil disimpan!', 'success')
    } catch (error) {
      showNotification('Gagal menyimpan pengaturan: ' + error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const toggleSetting = (key) => {
    const newValue = settings[key] == '1' ? '0' : '1'
    handleChange(key, newValue)
    handleSave(key, newValue)
  }

  const toggleCSVNumber = (key, number, min, max, fallback = []) => {
    const next = csvNumbers(settings[key], min, max, fallback)
    if (next.has(number)) next.delete(number)
    else next.add(number)
    if (next.size === 0 && key === 'workday_days') next.add(6)
    const value = [...next].sort((a, b) => a - b).join(',')
    handleChange(key, value)
    void handleSave(key, value)
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
<PageHeader title="Pengaturan" description="Kelola aturan presensi dan operasional sekolah." />
      <div className="section-tabs" aria-label="Bagian pengaturan">{['Presensi', 'Jadwal', 'Lokasi', 'Lanjutan'].map((item) => <button type="button" key={item} aria-pressed={section === item} onClick={() => setSection(item)}>{item}</button>)}</div>
      {loadError && <Notice onRetry={loadSettings}>{loadError}</Notice>}
      {notification.show && <Notice tone={notification.type} onDismiss={() => setNotification({ show: false, message: '', type: '' })}>{notification.message}</Notice>}
<section hidden={section !== 'Jadwal' || !!loadError}>
      <div className="rounded-xl border border-emerald-200 bg-card p-5">
        <div className="mb-4"><h3 className="font-semibold">Hari Kerja Aktif PKBM</h3><p className="mt-1 text-sm text-muted-foreground">Kalender ini menjadi acuan presensi dan perhitungan alfa. Default PKBM Tunas Ilmu adalah Sabtu saja; hari libur, hari khusus, dan override guru tetap berlaku.</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {[{ day: 1, label: 'Senin' }, { day: 2, label: 'Selasa' }, { day: 3, label: 'Rabu' }, { day: 4, label: 'Kamis' }, { day: 5, label: 'Jumat' }, { day: 6, label: 'Sabtu' }, { day: 0, label: 'Minggu' }].map(({ day, label }) => {
            const active = csvNumbers(settings.workday_days, 0, 6, [6]).has(day)
            return <label key={day} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-border bg-background'}`}><input type="checkbox" checked={active} disabled={saving} onChange={() => toggleCSVNumber('workday_days', day, 0, 6, [6])} />{label}</label>
          })}
        </div>
      </div>
      <div className="rounded-xl border border-indigo-200 bg-card p-5">
        <div className="mb-4"><h3 className="font-semibold">Rotasi Piket Sabtu</h3><p className="mt-1 text-sm text-muted-foreground">Pekan dihitung dari tanggal 1–7 sebagai pekan pertama. Guru Pokjar dikecualikan otomatis.</p></div>
        <div className="mb-4 flex items-center justify-between rounded-lg bg-muted/50 p-3"><div><p className="text-sm font-medium">Aktifkan rotasi grup A/B</p><p className="text-xs text-muted-foreground">Acuan target jam masuk dan pulang piket.</p></div><button type="button" role="switch" aria-label="Rotasi piket Sabtu" aria-checked={settings.piket_rotation_enabled === '1'} disabled={saving} onClick={() => toggleSetting('piket_rotation_enabled')} className={`relative inline-flex h-7 w-12 items-center rounded-full ${settings.piket_rotation_enabled === '1' ? 'bg-indigo-600' : 'bg-slate-400'}`}><span className={`h-5 w-5 rounded-full bg-white transition-transform ${settings.piket_rotation_enabled === '1' ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[{ key: 'piket_group_a_weeks', label: 'Pekan Grup A', fallback: [1, 3] }, { key: 'piket_group_b_weeks', label: 'Pekan Grup B', fallback: [2, 4] }].map(({ key, label, fallback }) => <fieldset key={key}><legend className="mb-2 text-sm font-medium">{label}</legend><div className="flex gap-2">{[1, 2, 3, 4].map((week) => { const active = csvNumbers(settings[key], 1, 4, fallback).has(week); return <label key={week} className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border p-2 text-sm ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-border'}`}><input type="checkbox" checked={active} disabled={saving} onChange={() => toggleCSVNumber(key, week, 1, 4, fallback)} />{week}</label> })}</div></fieldset>)}
          <label className="grid gap-1 text-sm font-medium">Aturan pekan kelima<select className="ui-input" value={settings.piket_week5_mode} disabled={saving} onChange={(event) => { handleChange('piket_week5_mode', event.target.value); void handleSave('piket_week5_mode', event.target.value) }}><option value="all">Semua guru</option><option value="none">Tidak ada piket</option><option value="A">Grup A</option><option value="B">Grup B</option></select></label>
          <label className="grid gap-1 text-sm font-medium">Jam masuk piket<input className="ui-input" type="time" value={String(settings.piket_jam_masuk || '07:00').slice(0, 5)} disabled={saving} onChange={(event) => handleChange('piket_jam_masuk', event.target.value)} onBlur={() => void handleSave('piket_jam_masuk')} /></label>
          <label className="grid gap-1 text-sm font-medium">Jam pulang piket<input className="ui-input" type="time" value={String(settings.piket_jam_pulang || '13:00').slice(0, 5)} disabled={saving} onChange={(event) => handleChange('piket_jam_pulang', event.target.value)} onBlur={() => void handleSave('piket_jam_pulang')} /></label>
        </div>
      </div>
      {/* Presensi Akhir Pekan */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-emerald-500">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${
            settings.saturday_male_workday_enabled == '1' ||
            settings.saturday_female_workday_enabled == '1' ||
            settings.sunday_male_workday_enabled == '1' ||
            settings.sunday_female_workday_enabled == '1'
              ? 'bg-emerald-100'
              : 'bg-gray-100'
          }`}>
            <CalendarCheck className={`w-6 h-6 ${
              settings.saturday_male_workday_enabled == '1' ||
              settings.saturday_female_workday_enabled == '1' ||
              settings.sunday_male_workday_enabled == '1' ||
              settings.sunday_female_workday_enabled == '1'
                ? 'text-emerald-600'
                : 'text-gray-600'
            }`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Presensi Akhir Pekan</h3>
            <p className="text-sm text-gray-600 mb-4">
              Aktifkan sesuai jadwal kegiatan sekolah. Hari dan kelompok yang aktif akan bisa presensi dan ikut dihitung dalam rekap.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'saturday_male_workday_enabled', day: 'Sabtu', group: 'Ustadz / Guru Laki-laki' },
                { key: 'saturday_female_workday_enabled', day: 'Sabtu', group: 'Ustadzah / Guru Perempuan' },
                { key: 'sunday_male_workday_enabled', day: 'Minggu', group: 'Ustadz / Guru Laki-laki' },
                { key: 'sunday_female_workday_enabled', day: 'Minggu', group: 'Ustadzah / Guru Perempuan' }
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="font-bold text-gray-800">{item.day}</p>
                    <p className="text-xs text-gray-500">{item.group}</p>
                    <p className={`text-xs font-semibold mt-1 ${settings[item.key] == '1' ? 'text-emerald-600' : 'text-gray-500'}`}>
                      {settings[item.key] == '1' ? 'Dihitung hari masuk' : 'Libur'}
                    </p>
                  </div>
                  <button type="button" role="switch" aria-label={item.day + ' · ' + item.group} aria-checked={settings[item.key] == '1'}
                    onClick={() => toggleSetting(item.key)}
                    disabled={saving}
                    className={`relative inline-flex h-8 w-16 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                      settings[item.key] == '1' ? 'bg-emerald-600' : 'bg-gray-400'
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        settings[item.key] == '1' ? 'translate-x-9' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Presensi' || !!loadError}>
      {/* Visibilitas Tombol Hadir Manual */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${settings.button_enabled == '1' ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <ExternalLink className={`w-6 h-6 ${settings.button_enabled == '1' ? 'text-blue-600' : 'text-gray-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Tombol Hadir Manual</h3>
            <p className="text-sm text-gray-600 mb-4">
              Atur apakah tombol "HADIR" manual ditampilkan di halaman guru. Jika dinonaktifkan, guru wajib menggunakan QR Code.
            </p>

            <div className="flex items-center gap-4 mb-2">
              <button type="button" role="switch" aria-label="Presensi dengan tombol" aria-checked={settings.button_enabled == '1'}
                onClick={() => {
                  const newValue = settings.button_enabled == '1' ? '0' : '1'
                  handleChange('button_enabled', newValue)
                  handleSave('button_enabled', newValue)
                }}
                disabled={saving}
                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.button_enabled == '1' ? 'bg-blue-600' : 'bg-gray-400'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    settings.button_enabled == '1' ? 'translate-x-9' : 'translate-x-1'
                  }`}
                />
              </button>
              <div>
                <p className={`font-bold ${settings.button_enabled == '1' ? 'text-blue-600' : 'text-gray-600'}`}>
                  {settings.button_enabled == '1' ? 'TOMBOL DITAMPILKAN' : 'TOMBOL DISEMBUNYIKAN'}
                </p>
                <p className="text-xs text-gray-500">
                  {settings.button_enabled == '1'
                    ? 'Guru masih bisa klik tombol Hadir manual'
                    : 'Guru wajib scan QR Code untuk presensi (Tombol Hadir hilang)'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Presensi' || !!loadError}>
      {/* Jam Masuk Normal */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Clock className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Jam Masuk Normal</h3>
            <p className="text-sm text-gray-600 mb-4">
              Batas waktu masuk normal. Guru yang presensi setelah jam ini akan dianggap terlambat.
            </p>
            <div className="flex items-center gap-4">
              <input
                type="time"
                value={settings.jam_masuk_normal}
                onChange={(e) => handleChange('jam_masuk_normal', e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => handleSave('jam_masuk_normal')}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                <Save className="w-4 h-4" />
                Simpan
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Contoh: 07:20 berarti guru yang presensi jam 07:21 atau lebih akan dianggap terlambat
            </p>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Presensi' || !!loadError} aria-labelledby="perbaikan-status-masuk">
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" />
            </div>
            <div>
              <h3 id="perbaikan-status-masuk" className="text-base font-bold text-slate-900">Perbaiki status masuk per tanggal</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
                Gunakan setelah Jam Masuk Normal diperbaiki. Sistem menilai ulang presensi hadir pada tanggal yang dipilih dengan jam terbaru dan toleransi saat ini. Guru yang mendapat jadwal piket tetap memakai jam piket pada hari tersebut.
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Status hadir/terlambat dan keterangan otomatis “Terlambat … menit” dapat diperbarui. Jam masuk, jam pulang, lokasi GPS, izin, sakit, serta catatan manual tetap utuh. Pengaturan dan jadwal piket aktif saat ini dipakai untuk menghitung ulang tanggal tersebut.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              Tanggal presensi
              <input
                type="date"
                aria-label="Tanggal presensi untuk perbaikan status"
                value={recalculationDate}
                max={jakartaToday()}
                onChange={(event) => handleRecalculationDateChange(event.target.value)}
                disabled={recalculationApplying}
                className="min-h-11 rounded-lg border border-amber-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <button
              type="button"
              onClick={() => loadRecalculationPreview(recalculationDate)}
              disabled={recalculationLoading || recalculationApplying}
              className="inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${recalculationLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Perbarui pratinjau
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-amber-200 bg-white p-4" aria-live="polite">
          {recalculationLoading && <div className="flex items-center gap-3 text-sm text-slate-600"><RefreshCw className="h-4 w-4 animate-spin text-amber-700" aria-hidden="true" />Memeriksa dampak pengaturan tanggal {recalculationDate}…</div>}
          {!recalculationLoading && recalculationError && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-rose-700">
              <span>{recalculationError}</span>
              <button type="button" onClick={() => loadRecalculationPreview(recalculationDate)} className="font-semibold underline underline-offset-2">Coba lagi</button>
            </div>
          )}
          {!recalculationLoading && !recalculationError && recalculationPreview && (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {recalculationPreview.changed > 0
                      ? `${recalculationPreview.changed} dari ${recalculationPreview.processed} presensi hadir perlu disesuaikan.`
                      : 'Status dan keterangan keterlambatan pada tanggal ini sudah sesuai dengan pengaturan terbaru.'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Tanggal {recalculationPreview.date} · Jam normal {String(recalculationPreview.normal_target || '-').slice(0, 5)} WIB · Toleransi {recalculationPreview.tolerance_minutes || 15} menit
                  </p>
                </div>
                <button
                  type="button"
                  onClick={applyTodayCheckInRecalculation}
                  disabled={!recalculationPreview.changed || recalculationApplying || recalculationLoading || recalculationPreview.date !== recalculationDate}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {recalculationApplying ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                  {recalculationApplying ? 'Menyesuaikan status…' : 'Jalankan perbaikan status'}
                </button>
              </div>

              {recalculationPreview.changed > 0 && (
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                  <div className="hidden grid-cols-[minmax(0,1.4fr)_auto_auto_auto] items-center gap-3 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 sm:grid">
                    <span>Guru</span><span>Masuk / target</span><span>Status lama</span><span>Status baru</span>
                  </div>
                  {(recalculationPreview.items || []).filter((item) => item.changed).slice(0, 8).map((item) => (
                    <div key={item.id} className="grid gap-2 border-t border-slate-100 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto] sm:items-center sm:gap-3">
                      <span className="font-medium text-slate-800">{item.nama}</span>
                      <span className="text-slate-600">{String(item.jam_masuk || '-').slice(0, 5)} / {String(item.target || '-').slice(0, 5)} {item.target_label || ''}</span>
                      <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusTone(item.old_status)}`}>{statusLabel(item.old_status)}</span>
                      <span className="inline-flex items-center gap-1.5"><ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusTone(item.new_status)}`}>{statusLabel(item.new_status)}</span></span>
                      {item.note_changed && <span className="text-xs leading-5 text-slate-600 sm:col-span-full">{latenessNoteChange(item)}</span>}
                    </div>
                  ))}
                  {recalculationPreview.changed > 8 && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Dan {recalculationPreview.changed - 8} presensi lainnya akan disesuaikan.</p>}
                </div>
              )}
              {recalculationPreview.skipped_no_time > 0 && <p className="mt-3 text-xs text-slate-500">{recalculationPreview.skipped_no_time} catatan hadir dilewati karena tidak memiliki jam masuk yang valid.</p>}
            </>
          )}
        </div>
      </div>
</section>
<section hidden={section !== 'Presensi' || !!loadError}>
      {/* Jam Minimal Presensi Pulang */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-indigo-500">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-100 rounded-lg">
            <Clock className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Jam Minimal Presensi Pulang</h3>
            <p className="text-sm text-gray-600 mb-4">
              Batas jam paling awal guru bisa menekan tombol <strong>PRESENSI PULANG</strong> (tanpa scan QR).
              Sebelum jam ini, tombol pulang tidak bisa digunakan. Berlaku juga untuk presensi pulang via QR Scan.
            </p>
            <div className="flex items-center gap-4">
              <input
                type="time"
                value={settings.jam_min_pulang}
                onChange={(e) => handleChange('jam_min_pulang', e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => handleSave('jam_min_pulang')}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
              >
                <Save className="w-4 h-4" />
                Simpan
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Contoh: 12:30 berarti tombol PRESENSI PULANG baru aktif pukul 12:30 WIB. Ubah sesuai kebijakan sekolah.
            </p>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Jadwal' || !!loadError} id="daily-settings">
      {/* Pengaturan Pulang Harian Khusus (per-tanggal) */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-500">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100 rounded-lg">
            <CalendarCheck className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Pengaturan Pulang Harian Khusus</h3>
            <p className="text-sm text-gray-600 mb-4">
              Override jam minimal presensi pulang <strong>hanya untuk tanggal tertentu</strong>
              (mis. hari sekolah pulang lebih awal). Kedua field punya toggle on/off masing-masing.
              Saat <strong>OFF</strong> atau jam dikosongkan, kembali ke pengaturan global / jadwal piket.
            </p>

            <div className="space-y-4">
              {/* Tanggal */}
              <div>
                <label htmlFor="pengaturan-field-60" className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Tanggal</label>
                <input id="pengaturan-field-60" aria-label="Tanggal"
                  type="date"
                  value={harianForm.tanggal}
                  onChange={(e) => handleHarianChange('tanggal', e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Semua guru */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">Jam Pulang — Semua Guru</span>
                    <p className="text-xs text-gray-500">Menimpa "Jam Minimal Presensi Pulang" di atas untuk tanggal ini.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleHarianToggle('jam_pulang_khusus_aktif')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${harianForm.jam_pulang_khusus_aktif ? 'bg-amber-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${harianForm.jam_pulang_khusus_aktif ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <input
                  type="time"
                  value={harianForm.jam_pulang_khusus}
                  onChange={(e) => handleHarianChange('jam_pulang_khusus', e.target.value)}
                  disabled={!harianForm.jam_pulang_khusus_aktif}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>

              {/* Khusus piket */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">Jam Pulang — Khusus Guru Piket</span>
                    <p className="text-xs text-gray-500">Menimpa jam pulang piket (jadwal piket) untuk tanggal ini.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleHarianToggle('jam_pulang_piket_khusus_aktif')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${harianForm.jam_pulang_piket_khusus_aktif ? 'bg-amber-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${harianForm.jam_pulang_piket_khusus_aktif ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <input
                  type="time"
                  value={harianForm.jam_pulang_piket_khusus}
                  onChange={(e) => handleHarianChange('jam_pulang_piket_khusus', e.target.value)}
                  disabled={!harianForm.jam_pulang_piket_khusus_aktif}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>

              {/* Keterangan */}
              <div>
                <label htmlFor="pengaturan-field-61" className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Keterangan (opsional)</label>
                <input id="pengaturan-field-61" aria-label="Keterangan (opsional)"
                  type="text"
                  value={harianForm.keterangan}
                  onChange={(e) => handleHarianChange('keterangan', e.target.value)}
                  placeholder="Mis. Pulang awal karena acara sekolah"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                onClick={handleHarianSave}
                disabled={savingHarian}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-gray-400"
              >
                <Save className="w-4 h-4" />
                Simpan Pengaturan Harian
              </button>
            </div>

            {/* Daftar override tersimpan */}
            {harianList.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Override Tersimpan</h4>
                <div className="space-y-2">
                  {harianList.map((row) => (
                    <div key={row.tanggal} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-sm">
                        <div className="font-semibold text-gray-800">{row.tanggal}</div>
                        <div className="text-xs text-gray-600">
                          Semua guru: <span className={row.jam_pulang_khusus_aktif ? 'text-amber-600 font-semibold' : 'text-gray-400'}>
                            {row.jam_pulang_khusus_aktif ? (row.jam_pulang_khusus || '—') : 'OFF'}
                          </span>
                          {' • '}
                          Piket: <span className={row.jam_pulang_piket_khusus_aktif ? 'text-amber-600 font-semibold' : 'text-gray-400'}>
                            {row.jam_pulang_piket_khusus_aktif ? (row.jam_pulang_piket_khusus || '—') : 'OFF'}
                          </span>
                        </div>
                        {row.keterangan && <div className="text-xs text-gray-500 italic">{row.keterangan}</div>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleHarianEdit(row)}
                          className="px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleHarianDelete(row.tanggal)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3">
              Kasus jarang. Setelah tanggal berlalu, hapus baris agar tidak menumpuk. Field yang OFF / kosong diabaikan.
            </p>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Lokasi' || !!loadError}>
      {/* Tracking Lokasi Guru */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-emerald-500">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${settings.location_tracking_enabled == '1' ? 'bg-emerald-100' : 'bg-gray-100'}`}>
            <MapPin className={`w-6 h-6 ${settings.location_tracking_enabled == '1' ? 'text-emerald-600' : 'text-gray-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Tracking Lokasi Guru</h3>
            <p className="text-sm text-gray-600 mb-4">
              Tracking berjalan setelah guru presensi hadir dan berhenti otomatis setelah presensi pulang. Browser guru harus tetap membuka aplikasi.
            </p>

            <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
              <button type="button" role="switch" aria-label="Pemantauan lokasi" aria-checked={settings.location_tracking_enabled == '1'}
                onClick={() => {
                  const newValue = settings.location_tracking_enabled == '1' ? '0' : '1'
                  handleChange('location_tracking_enabled', newValue)
                  handleSave('location_tracking_enabled', newValue)
                }}
                disabled={saving}
                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  settings.location_tracking_enabled == '1' ? 'bg-emerald-600' : 'bg-gray-400'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    settings.location_tracking_enabled == '1' ? 'translate-x-9' : 'translate-x-1'
                  }`}
                />
              </button>
              <div>
                <p className={`font-bold ${settings.location_tracking_enabled == '1' ? 'text-emerald-600' : 'text-gray-600'}`}>
                  {settings.location_tracking_enabled == '1' ? 'TRACKING AKTIF' : 'TRACKING NONAKTIF'}
                </p>
                <p className="text-xs text-gray-500">
                  Interval {settings.location_tracking_interval_minutes || 15} menit, batas akurasi {settings.location_tracking_accuracy_limit || 100}m
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pengaturan-field-62" className="block text-sm font-medium text-gray-700 mb-2">Interval Tracking (menit)</label>
                <div className="flex gap-2">
                  <input id="pengaturan-field-62" aria-label="Interval Tracking (menit)"
                    type="number"
                    min="5"
                    max="60"
                    value={settings.location_tracking_interval_minutes || '15'}
                    onChange={(e) => handleChange('location_tracking_interval_minutes', e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => handleSave('location_tracking_interval_minutes')}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Simpan
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Disarankan 10-15 menit. Batas aplikasi: 5 sampai 60 menit.</p>
              </div>

              <div>
                <label htmlFor="pengaturan-field-63" className="block text-sm font-medium text-gray-700 mb-2">Batas Akurasi GPS Maksimum (meter)</label>
                <div className="flex gap-2">
                  <input id="pengaturan-field-63" aria-label="Batas Akurasi GPS Maksimum (meter)"
                    type="number"
                    min="20"
                    max="1000"
                    value={settings.location_tracking_accuracy_limit || '100'}
                    onChange={(e) => handleChange('location_tracking_accuracy_limit', e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => handleSave('location_tracking_accuracy_limit')}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Simpan
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Tracking ditolak jika akurasi GPS lebih buruk dari angka ini.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Jadwal' || !!loadError}>
      {/* Toggle Apel Senin */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-indigo-500">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${settings.apel_senin_enabled == '1' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
            <Save className={`w-6 h-6 ${settings.apel_senin_enabled == '1' ? 'text-indigo-600' : 'text-gray-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Status Apel Senin</h3>
            <p className="text-sm text-gray-600 mb-4">
              Aktifkan ini jika hari Senin besok ada Apel Pagi. Jika dinonaktifkan (misal saat UAS), batas masuk semua guru akan kembali ke jam normal.
            </p>

            <div className="flex items-center gap-4 mb-2">
              <button type="button" role="switch" aria-label="Presensi apel Senin" aria-checked={settings.apel_senin_enabled == '1'}
                onClick={() => {
                  const newValue = settings.apel_senin_enabled == '1' ? '0' : '1'
                  handleChange('apel_senin_enabled', newValue)
                  handleSave('apel_senin_enabled', newValue)
                }}
                disabled={saving}
                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  settings.apel_senin_enabled == '1' ? 'bg-indigo-600' : 'bg-gray-400'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    settings.apel_senin_enabled == '1' ? 'translate-x-9' : 'translate-x-1'
                  }`}
                />
              </button>
              <div>
                <p className={`font-bold ${settings.apel_senin_enabled == '1' ? 'text-indigo-600' : 'text-gray-600'}`}>
                  {settings.apel_senin_enabled == '1' ? 'APEL SENIN AKTIF' : 'APEL SENIN DITIADAKAN'}
                </p>
                <p className="text-xs text-gray-500">
                  {settings.apel_senin_enabled == '1'
                    ? 'Batas masuk: Piket 06:40, Non-Piket 07:00'
                    : 'Batas masuk: Piket 07:00, Non-Piket 07:20'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Lanjutan' || !!loadError}>
      <div className="mb-6 bg-white rounded-lg shadow p-6 border-l-4 border-emerald-500">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-emerald-100">
            <MessageCircle className="w-6 h-6 text-emerald-700" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">WhatsApp Admin untuk Koreksi Rekap</h3>
            <p className="text-sm text-gray-600 mb-4">Digunakan saat guru mengajukan koreksi rekap presensi bulanan. Nomor ini memakai kontak admin yang sama dengan integrasi, tanpa mengubah URL atau status integrasinya.</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label htmlFor="monthly-confirmation-admin-phone" className="sr-only">Nomor WhatsApp admin</label>
              <input
                id="monthly-confirmation-admin-phone"
                type="tel"
                inputMode="tel"
                value={monthlyContact}
                onChange={(event) => setMonthlyContact(event.target.value)}
                placeholder="Contoh: 081234567890"
                disabled={monthlyContactLoading || monthlyContactSaving}
                className="w-full flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <button
                type="button"
                onClick={saveMonthlyContact}
                disabled={monthlyContactLoading || monthlyContactSaving}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                {monthlyContactSaving ? 'Menyimpan...' : 'Simpan nomor'}
              </button>
            </div>
            {monthlyContactError ? <div className="mt-3"><Notice tone="error" onRetry={loadMonthlyContact}>{monthlyContactError}</Notice></div> : <p className="text-xs text-gray-500 mt-2">Masukkan nomor dengan awalan 08 atau kode negara 62. Guru akan diarahkan ke WhatsApp dengan pesan pengajuan yang sudah terisi.</p>}
          </div>
        </div>
      </div>
      {/* Mode Testing GPS */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${settings.mode_testing == '1' ? 'bg-orange-100' : 'bg-red-100'}`}>
            <TestTube className={`w-6 h-6 ${settings.mode_testing == '1' ? 'text-orange-600' : 'text-red-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Mode Testing GPS</h3>
            <p className="text-sm text-gray-600 mb-4">
              Aktifkan mode testing untuk menonaktifkan validasi GPS saat presensi hadir. Berguna untuk testing sistem.
            </p>

            {/* Toggle Switch */}
            <div className="flex items-center gap-4 mb-4">
              <button type="button" role="switch" aria-label="Mode testing" aria-checked={settings.mode_testing == '1'}
                onClick={() => {
                  const newValue = settings.mode_testing == '1' ? '0' : '1'
                  handleChange('mode_testing', newValue)
                  handleSave('mode_testing', newValue)
                }}
                disabled={saving}
                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.mode_testing == '1' ? 'bg-orange-500' : 'bg-red-500'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    settings.mode_testing == '1' ? 'translate-x-9' : 'translate-x-1'
                  }`}
                />
              </button>
              <div>
                <p className={`font-bold ${settings.mode_testing == '1' ? 'text-orange-600' : 'text-red-600'}`}>
                  {settings.mode_testing == '1' ? 'AKTIF (Testing Mode)' : 'NONAKTIF (Produksi)'}
                </p>
                <p className="text-xs text-gray-500">
                  {settings.mode_testing == '1'
                    ? 'Validasi GPS dinonaktifkan - Guru bisa presensi dari mana saja'
                    : 'Validasi GPS aktif - Guru harus di dalam radius sekolah'}
                </p>
              </div>
            </div>

            {/* Warning Box */}
            {settings.mode_testing == '1' ? (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800 font-semibold mb-1">⚠️ Mode Testing Aktif</p>
                <ul className="text-xs text-orange-700 space-y-1 list-disc list-inside">
                  <li>Guru bisa presensi hadir dari lokasi mana saja</li>
                  <li>Validasi radius GPS dinonaktifkan</li>
                  <li>Cocok untuk testing sistem atau demo</li>
                  <li>Nonaktifkan saat sudah siap produksi</li>
                </ul>
              </div>
            ) : (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800 font-semibold mb-1">✅ Mode Produksi Aktif</p>
                <ul className="text-xs text-green-700 space-y-1 list-disc list-inside">
                  <li>Validasi GPS aktif untuk presensi hadir</li>
                  <li>Guru harus berada dalam radius {settings.radius_gps}m dari sekolah</li>
                  <li>Presensi izin dan sakit tetap tidak perlu GPS</li>
                  <li>Sistem berjalan sesuai aturan sebenarnya</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Presensi' || !!loadError}>
      {/* Terlambat Piket Dianggap Terlambat */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${settings.piket_terlambat_adalah_terlambat == '1' ? 'bg-red-100' : 'bg-gray-100'}`}>
            <Clock className={`w-6 h-6 ${settings.piket_terlambat_adalah_terlambat == '1' ? 'text-red-600' : 'text-gray-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Terlambat Piket = Hadir Terlambat</h3>
            <p className="text-sm text-gray-600 mb-4">
              Atur apakah guru yang terlambat hadir piket akan dianggap sebagai "Hadir Terlambat" atau hanya mendapat warning saja.
            </p>

            {/* Toggle Switch */}
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={() => {
                  const newValue = settings.piket_terlambat_adalah_terlambat == '1' ? '0' : '1'
                  handleChange('piket_terlambat_adalah_terlambat', newValue)
                  handleSave('piket_terlambat_adalah_terlambat', newValue)
                }}
                disabled={saving}
                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.piket_terlambat_adalah_terlambat == '1' ? 'bg-red-500' : 'bg-gray-400'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    settings.piket_terlambat_adalah_terlambat == '1' ? 'translate-x-9' : 'translate-x-1'
                  }`}
                />
              </button>
              <div>
                <p className={`font-bold ${settings.piket_terlambat_adalah_terlambat == '1' ? 'text-red-600' : 'text-gray-600'}`}>
                  {settings.piket_terlambat_adalah_terlambat == '1' ? 'AKTIF - Ubah Status' : 'NONAKTIF - Warning Saja'}
                </p>
                <p className="text-xs text-gray-500">
                  {settings.piket_terlambat_adalah_terlambat == '1'
                    ? 'Terlambat piket akan mengubah status menjadi "Hadir Terlambat"'
                    : 'Terlambat piket hanya memberi warning tanpa mengubah status'}
                </p>
              </div>
            </div>

            {/* Info Box */}
            {settings.piket_terlambat_adalah_terlambat == '1' ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800 font-semibold mb-1">🔴 Mode Ketat Aktif</p>
                <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                  <li>Guru yang terlambat hadir piket akan tercatat sebagai "Hadir Terlambat"</li>
                  <li>Status akan muncul di statistik dan laporan</li>
                  <li>Tetap ada warning piket di pesan presensi</li>
                  <li>Cocok untuk sekolah dengan aturan piket yang ketat</li>
                </ul>
              </div>
            ) : (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-800 font-semibold mb-1">ℹ️ Mode Warning Saja</p>
                <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                  <li>Guru yang terlambat piket tetap tercatat sebagai "Hadir" (jika tidak terlambat masuk normal)</li>
                  <li>Hanya muncul warning piket di pesan presensi</li>
                  <li>Status "Hadir Terlambat" hanya untuk terlambat masuk normal</li>
                  <li>Cocok untuk sekolah yang lebih fleksibel dengan jadwal piket</li>
                </ul>
              </div>
            )}

            {/* Contoh Kasus */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-semibold mb-2">📝 Contoh Kasus:</p>
              <div className="text-xs text-blue-700 space-y-2">
                <div>
                  <p className="font-semibold">Guru A:</p>
                  <ul className="list-disc list-inside ml-2">
                    <li>Piket jam 07:00, presensi jam 07:30</li>
                    <li>Jam masuk normal: 07:20</li>
                    <li>Terlambat piket: 30 menit</li>
                    <li>Terlambat masuk: 10 menit (masih dalam toleransi)</li>
                  </ul>
                  <p className="mt-1 font-semibold">
                    {settings.piket_terlambat_adalah_terlambat === '1'
                      ? '→ Status: Hadir Terlambat (karena terlambat piket)'
                      : '→ Status: Hadir (hanya warning piket)'}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Guru B:</p>
                  <ul className="list-disc list-inside ml-2">
                    <li>Piket jam 07:00, presensi jam 07:40</li>
                    <li>Jam masuk normal: 07:20</li>
                    <li>Terlambat piket: 40 menit</li>
                    <li>Terlambat masuk: 20 menit (melebihi toleransi 15 menit)</li>
                  </ul>
                  <p className="mt-1 font-semibold">
                    → Status: Hadir Terlambat (terlambat masuk normal)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Presensi' || !!loadError}>
      {/* Toleransi Terlambat */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-yellow-100 rounded-lg">
            <Timer className="w-6 h-6 text-yellow-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Toleransi Keterlambatan</h3>
            <p className="text-sm text-gray-600 mb-4">
              Toleransi waktu terlambat dalam menit. Jika terlambat melebihi toleransi, akan ditandai khusus.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={settings.toleransi_terlambat}
                  onChange={(e) => handleChange('toleransi_terlambat', e.target.value)}
                  className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-600">menit</span>
              </div>
              <button
                onClick={() => handleSave('toleransi_terlambat')}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                <Save className="w-4 h-4" />
                Simpan
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Contoh: 15 menit berarti terlambat 1-15 menit = "Terlambat", lebih dari 15 menit = "Terlambat Parah"
            </p>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Lokasi' || !!loadError}>
      {/* Radius GPS */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-green-100 rounded-lg">
            <MapPin className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Radius Validasi GPS</h3>
            <p className="text-sm text-gray-600 mb-4">
              Jarak maksimal dari lokasi sekolah untuk bisa melakukan presensi (dalam meter).
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="50"
                  max="2000"
                  step="50"
                  value={settings.radius_gps}
                  onChange={(e) => handleChange('radius_gps', e.target.value)}
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-600">meter</span>
              </div>
              <button
                onClick={() => handleSave('radius_gps')}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                <Save className="w-4 h-4" />
                Simpan
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Contoh: 500 meter berarti guru harus berada dalam radius 500m dari sekolah
            </p>
          </div>
        </div>
      </div>

</section>
<section hidden={section !== 'Lokasi' || !!loadError}>
      {/* Lokasi Sekolah */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-100 rounded-lg">
            <School className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-gray-800">Lokasi Sekolah</h3>
              <button
                onClick={() => setShowPanduan(!showPanduan)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <ExternalLink className="w-4 h-4" />
                {showPanduan ? 'Sembunyikan' : 'Lihat'} Panduan
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Koordinat GPS lokasi sekolah. Digunakan untuk validasi presensi guru.
            </p>

            {/* Panduan */}
            {showPanduan && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-bold text-blue-800 mb-2">📍 Cara Mendapatkan Koordinat GPS:</h4>
                <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
                  <li>Buka <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google Maps</a></li>
                  <li>Cari lokasi sekolah Anda</li>
                  <li>Klik kanan pada titik lokasi sekolah</li>
                  <li>Klik angka koordinat yang muncul (contoh: -5.1477, 119.4327)</li>
                  <li>Koordinat akan otomatis tercopy</li>
                  <li>Paste di kolom Latitude dan Longitude di bawah</li>
                </ol>
                <div className="mt-3 p-3 bg-white rounded border border-blue-300">
                  <p className="text-xs text-blue-600 font-semibold mb-1">Format Koordinat:</p>
                  <p className="text-xs text-blue-700">
                    <strong>Latitude:</strong> -90 sampai 90 (contoh: -5.1477)<br/>
                    <strong>Longitude:</strong> -180 sampai 180 (contoh: 119.4327)
                  </p>
                </div>
              </div>
            )}

            {/* Nama Sekolah */}
            <div className="mb-4">
              <label htmlFor="pengaturan-field-64" className="block text-sm font-medium text-gray-700 mb-2">
                Nama Sekolah
              </label>
              <div className="flex items-center gap-4">
                <input id="pengaturan-field-64" aria-label="Nama Sekolah"
                  type="text"
                  value={settings.sekolah_nama}
                  onChange={(e) => handleChange('sekolah_nama', e.target.value)}
                  placeholder="Nama Sekolah"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => handleSave('sekolah_nama')}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  <Save className="w-4 h-4" />
                  Simpan
                </button>
              </div>
            </div>

            {/* Latitude */}
            <div className="mb-4">
              <label htmlFor="pengaturan-field-65" className="block text-sm font-medium text-gray-700 mb-2">
                Latitude (Garis Lintang)
              </label>
              <div className="flex items-center gap-4">
                <input id="pengaturan-field-65" aria-label="Latitude (Garis Lintang)"
                  type="number"
                  step="0.000001"
                  value={settings.sekolah_latitude}
                  onChange={(e) => handleChange('sekolah_latitude', e.target.value)}
                  placeholder="-5.1477"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => handleSave('sekolah_latitude')}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  <Save className="w-4 h-4" />
                  Simpan
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Contoh: -5.1477 (angka negatif untuk belahan bumi selatan)
              </p>
            </div>

            {/* Longitude */}
            <div className="mb-4">
              <label htmlFor="pengaturan-field-66" className="block text-sm font-medium text-gray-700 mb-2">
                Longitude (Garis Bujur)
              </label>
              <div className="flex items-center gap-4">
                <input id="pengaturan-field-66" aria-label="Longitude (Garis Bujur)"
                  type="number"
                  step="0.000001"
                  value={settings.sekolah_longitude}
                  onChange={(e) => handleChange('sekolah_longitude', e.target.value)}
                  placeholder="119.4327"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => handleSave('sekolah_longitude')}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  <Save className="w-4 h-4" />
                  Simpan
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Contoh: 119.4327 (angka positif untuk belahan bumi timur)
              </p>
            </div>

            {/* Link Google Maps */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700 mb-2">
                <strong>Lokasi saat ini:</strong>
              </p>
              <a
                href={`https://www.google.com/maps?q=${settings.sekolah_latitude},${settings.sekolah_longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
              >
                <Map className="w-4 h-4" />
                Lihat di Google Maps
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

</section>
      {/* Info Box */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <h4 className="font-bold text-blue-800 mb-2">ℹ️ Informasi Penting</h4>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li>Perubahan pengaturan akan langsung berlaku untuk presensi berikutnya</li>
          <li>Perbaikan status masuk hanya berlaku untuk satu tanggal yang dipilih; gunakan Koreksi Presensi untuk perubahan data lainnya</li>
          <li>Pastikan pengaturan sesuai dengan kebijakan sekolah</li>
          <li>Radius GPS terlalu kecil dapat menyebabkan guru kesulitan presensi</li>
          <li>Koordinat GPS harus akurat agar validasi presensi berjalan dengan baik</li>
          <li>Gunakan Google Maps untuk mendapatkan koordinat yang tepat</li>
        </ul>
      </div>


    </div>
  )
}

export default Pengaturan
