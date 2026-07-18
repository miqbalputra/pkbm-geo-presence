import { useState, useEffect } from 'react'
import { Save, Clock, MapPin, Timer, Map, School, ExternalLink, TestTube, CalendarCheck, Users, KeyRound, Lock, User, Eye, EyeOff, Loader2, ShieldCheck, CheckCircle2, UserCog } from 'lucide-react'
import { settingsAPI, adminProfileAPI, kepalaSekolahAPI } from '../../services/api'

function Pengaturan({ user }) {
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

  // --- State Akun Admin (ubah username & password) ---
  const [account, setAccount] = useState({ username: '', nama: '', email: '' })
  const [acctForm, setAcctForm] = useState({ passwordLama: '', usernameBaru: '', passwordBaru: '', konfirmasiBaru: '' })
  const [acctErrors, setAcctErrors] = useState({})
  const [acctSaving, setAcctSaving] = useState(false)
  const [acctMessage, setAcctMessage] = useState({ type: '', text: '' })
  const [showAcctPw, setShowAcctPw] = useState({ lama: false, baru: false, konfirmasi: false })

  // --- State Akun Kepala Sekolah (dikelola Admin) ---
  const [kepsek, setKepsek] = useState(null)            // akun KS saat ini atau null
  const [kepsekLoading, setKepsekLoading] = useState(true)
  const [kepsekForm, setKepsekForm] = useState({
    adminPassword: '', username: '', nama: '', email: '',
    passwordBaru: '', konfirmasiBaru: ''
  })
  const [kepsekErrors, setKepsekErrors] = useState({})
  const [kepsekSaving, setKepsekSaving] = useState(false)
  const [kepsekMessage, setKepsekMessage] = useState({ type: '', text: '' })
  const [showKepsekPw, setShowKepsekPw] = useState({ admin: false, baru: false, konfirmasi: false })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await settingsAPI.getAll()
      setSettings(response.data)

      // Muat juga info akun admin yang sedang login (untuk form ubah kredensial).
      try {
        const acctRes = await adminProfileAPI.getAccount()
        const acct = acctRes.data || {}
        setAccount({ username: acct.username || '', nama: acct.nama || '', email: acct.email || '' })
        setAcctForm(prev => ({ ...prev, usernameBaru: acct.username || '' }))
      } catch (acctErr) {
        // Tidak fatal — form akun tetap tampil, hanya username awal kosong.
        console.error('Failed to load admin account:', acctErr)
      }

      // Muat akun Kepala Sekolah (hanya untuk Admin).
      if (user?.role === 'admin') {
        try {
          const ksRes = await kepalaSekolahAPI.getAccount()
          const ks = ksRes.data || null
          setKepsek(ks)
          if (ks) {
            setKepsekForm(prev => ({ ...prev, username: ks.username || '', nama: ks.nama || '', email: ks.email || '' }))
          }
        } catch (ksErr) {
          console.error('Failed to load kepala sekolah account:', ksErr)
        } finally {
          setKepsekLoading(false)
        }
      } else {
        setKepsekLoading(false)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      showNotification('Gagal memuat pengaturan: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000)
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

  // Parse CSV setting (e.g. "6" or "1,3") into a Set of numbers
  const parseCsvNumbers = (csv) => {
    if (!csv) return new Set()
    return new Set(String(csv).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)))
  }

  // Toggle a number's membership in a CSV setting and persist it
  const toggleCsvNumber = (key, num) => {
    const set = parseCsvNumbers(settings[key])
    if (set.has(num)) {
      set.delete(num)
    } else {
      set.add(num)
    }
    // Sort ascending with a stable order; keep numbers as-is
    const newValue = Array.from(set).sort((a, b) => a - b).join(',')
    handleChange(key, newValue)
    handleSave(key, newValue)
  }

  // --- Handler Akun Admin ---
  const handleAcctChange = (field) => (e) => {
    setAcctForm(prev => ({ ...prev, [field]: e.target.value }))
    setAcctErrors(prev => ({ ...prev, [field]: '' }))
    setAcctMessage({ type: '', text: '' })
  }

  const toggleAcctPw = (field) => () => {
    setShowAcctPw(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const hasAcctChanges = () => {
    return (
      acctForm.usernameBaru.trim() !== account.username ||
      !!acctForm.passwordLama ||
      !!acctForm.passwordBaru ||
      !!acctForm.konfirmasiBaru
    )
  }

  const validateAcct = () => {
    const errs = {}
    if (!acctForm.passwordLama) errs.passwordLama = 'Password saat ini harus diisi.'

    const uname = acctForm.usernameBaru.trim()
    if (uname && uname !== account.username) {
      if (uname.length < 3) errs.usernameBaru = 'Username minimal 3 karakter.'
      else if (uname.length > 50) errs.usernameBaru = 'Username maksimal 50 karakter.'
      else if (!/^[A-Za-z0-9._-]+$/.test(uname)) errs.usernameBaru = 'Hanya huruf, angka, titik, underscore, dan tanda hubung.'
    }

    if (acctForm.passwordBaru || acctForm.konfirmasiBaru) {
      if (!acctForm.passwordBaru) {
        errs.passwordBaru = 'Password baru harus diisi.'
      } else if (acctForm.passwordBaru.length < 6) {
        errs.passwordBaru = 'Password baru minimal 6 karakter.'
      }
      if (!acctForm.konfirmasiBaru) {
        errs.konfirmasiBaru = 'Konfirmasi password harus diisi.'
      } else if (acctForm.passwordBaru !== acctForm.konfirmasiBaru) {
        errs.konfirmasiBaru = 'Konfirmasi password tidak cocok.'
      } else if (acctForm.passwordBaru === acctForm.passwordLama) {
        errs.passwordBaru = 'Password baru tidak boleh sama dengan password saat ini.'
      }
    }

    // Minimal ada satu perubahan (username atau password).
    if (uname === account.username && !acctForm.passwordBaru) {
      errs.general = 'Tidak ada perubahan. Ubah username atau isi password baru.'
    }

    setAcctErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSaveAccount = async (e) => {
    e.preventDefault()
    setAcctMessage({ type: '', text: '' })
    if (!validateAcct()) return

    setAcctSaving(true)
    try {
      const res = await adminProfileAPI.changeCredentials({
        passwordLama: acctForm.passwordLama,
        usernameBaru: acctForm.usernameBaru.trim(),
        passwordBaru: acctForm.passwordBaru,
        konfirmasiBaru: acctForm.konfirmasiBaru,
      })
      const data = res.data || {}
      if (data.username) {
        setAccount(prev => ({ ...prev, username: data.username }))
        setAcctForm(prev => ({ ...prev, usernameBaru: data.username }))
      }
      // Kosongkan field password setelah sukses.
      setAcctForm(prev => ({ ...prev, passwordLama: '', passwordBaru: '', konfirmasiBaru: '' }))
      setAcctMessage({ type: 'success', text: res.message || 'Akun berhasil diperbarui.' })
    } catch (err) {
      setAcctMessage({ type: 'error', text: 'Gagal memperbarui akun: ' + err.message })
    } finally {
      setAcctSaving(false)
    }
  }

  // --- Handler Akun Kepala Sekolah ---
  const handleKepsekChange = (field) => (e) => {
    setKepsekForm(prev => ({ ...prev, [field]: e.target.value }))
    setKepsekErrors(prev => ({ ...prev, [field]: '' }))
    setKepsekMessage({ type: '', text: '' })
  }

  const toggleKepsekPw = (field) => () => {
    setShowKepsekPw(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const isKepsekCreate = !kepsek

  const validateKepsek = () => {
    const errs = {}
    if (!kepsekForm.adminPassword) errs.adminPassword = 'Password Admin saat ini harus diisi untuk konfirmasi.'

    const uname = kepsekForm.username.trim()
    if (!uname) errs.username = 'Username wajib diisi.'
    else if (uname.length < 3) errs.username = 'Username minimal 3 karakter.'
    else if (uname.length > 50) errs.username = 'Username maksimal 50 karakter.'
    else if (!/^[A-Za-z0-9._-]+$/.test(uname)) errs.username = 'Hanya huruf, angka, titik, underscore, dan tanda hubung.'

    if (!kepsekForm.nama.trim()) errs.nama = 'Nama wajib diisi.'

    if (kepsekForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kepsekForm.email)) {
      errs.email = 'Format email tidak valid.'
    }

    // Saat membuat akun baru, password wajib. Saat update, password opsional.
    if (isKepsekCreate || kepsekForm.passwordBaru || kepsekForm.konfirmasiBaru) {
      if (!kepsekForm.passwordBaru) {
        errs.passwordBaru = isKepsekCreate ? 'Password awal wajib diisi.' : 'Password baru harus diisi.'
      } else if (kepsekForm.passwordBaru.length < 6) {
        errs.passwordBaru = 'Password minimal 6 karakter.'
      }
      if (!kepsekForm.konfirmasiBaru) {
        errs.konfirmasiBaru = 'Konfirmasi password harus diisi.'
      } else if (kepsekForm.passwordBaru !== kepsekForm.konfirmasiBaru) {
        errs.konfirmasiBaru = 'Konfirmasi password tidak cocok.'
      }
    }

    setKepsekErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSaveKepsek = async (e) => {
    e.preventDefault()
    setKepsekMessage({ type: '', text: '' })
    if (!validateKepsek()) return

    setKepsekSaving(true)
    try {
      const res = await kepalaSekolahAPI.save({
        passwordLama: kepsekForm.adminPassword,
        username: kepsekForm.username.trim(),
        nama: kepsekForm.nama.trim(),
        email: kepsekForm.email.trim(),
        passwordBaru: kepsekForm.passwordBaru,
        konfirmasiBaru: kepsekForm.konfirmasiBaru,
      })
      const ks = res.data || null
      setKepsek(ks)
      if (ks) {
        setKepsekForm(prev => ({
          ...prev,
          username: ks.username || '',
          nama: ks.nama || '',
          email: ks.email || '',
          adminPassword: '', passwordBaru: '', konfirmasiBaru: ''
        }))
      }
      setKepsekMessage({ type: 'success', text: res.message || 'Akun Kepala Sekolah berhasil disimpan.' })
    } catch (err) {
      setKepsekMessage({ type: 'error', text: 'Gagal menyimpan akun Kepala Sekolah: ' + err.message })
    } finally {
      setKepsekSaving(false)
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Pengaturan Sistem</h1>
      </div>

      {/* Akun Admin - Ubah Username & Password */}
      <form onSubmit={handleSaveAccount} className="bg-white rounded-lg shadow p-6 border-l-4 border-indigo-500 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-500" /> Keamanan Akun Admin
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Ubah username dan password admin Anda. Setiap perubahan wajib mengonfirmasi password saat ini.
          </p>
        </div>

        {/* Info akun saat ini */}
        <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center font-bold shrink-0">
            {(account.nama || account.username || 'A').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{account.nama || 'Admin'}</p>
            <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
              <User className="w-3 h-3" /> Username saat ini: <span className="font-semibold text-gray-700">{account.username || '-'}</span>
            </p>
          </div>
        </div>

        {/* Pesan */}
        {acctMessage.text && (
          <div className={`flex items-start gap-2 p-3 rounded-lg text-sm font-medium ${
            acctMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            {acctMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : null}
            <span className="whitespace-pre-line">{acctMessage.text}</span>
          </div>
        )}
        {acctErrors.general && !acctMessage.text && (
          <div className="flex items-start gap-2 p-3 rounded-lg text-sm font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <span>{acctErrors.general}</span>
          </div>
        )}

        {/* Password saat ini */}
        <div>
          <label htmlFor="acctPasswordLama" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
            <Lock className="w-4 h-4 text-indigo-500" /> Password Saat Ini
          </label>
          <div className="relative">
            <input
              id="acctPasswordLama"
              type={showAcctPw.lama ? 'text' : 'password'}
              value={acctForm.passwordLama}
              onChange={handleAcctChange('passwordLama')}
              autoComplete="current-password"
              placeholder="Wajib diisi untuk konfirmasi"
              className={`w-full px-4 py-2.5 pr-11 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-colors ${
                acctErrors.passwordLama ? 'border-rose-400' : 'border-gray-300'
              }`}
            />
            <button type="button" onClick={toggleAcctPw('lama')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showAcctPw.lama ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {acctErrors.passwordLama && <p className="text-xs text-rose-500 mt-1">{acctErrors.passwordLama}</p>}
        </div>

        {/* Username baru */}
        <div>
          <label htmlFor="acctUsernameBaru" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
            <User className="w-4 h-4 text-indigo-500" /> Username Baru
          </label>
          <input
            id="acctUsernameBaru"
            type="text"
            value={acctForm.usernameBaru}
            onChange={handleAcctChange('usernameBaru')}
            autoComplete="username"
            placeholder="Minimal 3 karakter (huruf, angka, . _ -)"
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-colors ${
              acctErrors.usernameBaru ? 'border-rose-400' : 'border-gray-300'
            }`}
          />
          {acctErrors.usernameBaru && <p className="text-xs text-rose-500 mt-1">{acctErrors.usernameBaru}</p>}
          <p className="text-xs text-gray-400 mt-1">ⓘ Kosongkan jika tidak ingin mengubah username. Isi jika sama dengan username saat ini = tidak ada perubahan.</p>
        </div>

        {/* Password baru */}
        <div>
          <label htmlFor="acctPasswordBaru" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
            <KeyRound className="w-4 h-4 text-indigo-500" /> Password Baru
          </label>
          <div className="relative">
            <input
              id="acctPasswordBaru"
              type={showAcctPw.baru ? 'text' : 'password'}
              value={acctForm.passwordBaru}
              onChange={handleAcctChange('passwordBaru')}
              autoComplete="new-password"
              placeholder="Minimal 6 karakter (opsional)"
              className={`w-full px-4 py-2.5 pr-11 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-colors ${
                acctErrors.passwordBaru ? 'border-rose-400' : 'border-gray-300'
              }`}
            />
            <button type="button" onClick={toggleAcctPw('baru')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showAcctPw.baru ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {acctErrors.passwordBaru && <p className="text-xs text-rose-500 mt-1">{acctErrors.passwordBaru}</p>}
        </div>

        {/* Konfirmasi password baru */}
        <div>
          <label htmlFor="acctKonfirmasiBaru" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
            <CheckCircle2 className="w-4 h-4 text-indigo-500" /> Ulangi Password Baru
          </label>
          <div className="relative">
            <input
              id="acctKonfirmasiBaru"
              type={showAcctPw.konfirmasi ? 'text' : 'password'}
              value={acctForm.konfirmasiBaru}
              onChange={handleAcctChange('konfirmasiBaru')}
              autoComplete="new-password"
              placeholder="Ketik ulang password baru"
              className={`w-full px-4 py-2.5 pr-11 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-colors ${
                acctErrors.konfirmasiBaru ? 'border-rose-400' : 'border-gray-300'
              }`}
            />
            <button type="button" onClick={toggleAcctPw('konfirmasi')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showAcctPw.konfirmasi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {acctErrors.konfirmasiBaru && <p className="text-xs text-rose-500 mt-1">{acctErrors.konfirmasiBaru}</p>}
        </div>

        {/* Tombol simpan */}
        <button
          type="submit"
          disabled={acctSaving || !hasAcctChanges()}
          className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {acctSaving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
          ) : (
            <><Save className="w-4 h-4" /> Simpan Perubahan Akun</>
          )}
        </button>
        {!hasAcctChanges() && !acctSaving && (
          <p className="text-center text-xs text-gray-400">Belum ada perubahan yang perlu disimpan.</p>
        )}
      </form>

      {/* Akun Kepala Sekolah - dikelola Admin */}
      {user?.role === 'admin' && (
        <form onSubmit={handleSaveKepsek} className="bg-white rounded-lg shadow p-6 border-l-4 border-sky-500 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <UserCog className="w-5 h-5 text-sky-500" /> Akun Kepala Sekolah
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Buat atau perbarui akun Kepala Sekolah. Hak aksesnya sama dengan Admin. Setiap penyimpanan wajib
              mengonfirmasi password Admin saat ini.
            </p>
          </div>

          {/* Status akun */}
          <div className={`flex items-center gap-3 p-3 rounded-lg ${kepsek ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <div className={`w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold shrink-0 ${
              kepsek ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-amber-500 to-orange-600'
            }`}>
              {(kepsek?.nama || kepsek?.username || 'K').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              {kepsekLoading ? (
                <p className="text-sm text-gray-500">Memuat data akun…</p>
              ) : kepsek ? (
                <>
                  <p className="text-sm font-semibold text-gray-800 truncate">{kepsek.nama || 'Kepala Sekolah'}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                    <User className="w-3 h-3" /> Username: <span className="font-semibold text-gray-700">{kepsek.username || '-'}</span>
                    {kepsek.email ? <span className="truncate">· {kepsek.email}</span> : null}
                  </p>
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ Akun sudah ada — perbarui data/password di bawah.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-800">Belum ada akun Kepala Sekolah</p>
                  <p className="text-xs text-amber-600 font-medium">Isi formulir di bawah untuk membuat akun baru.</p>
                </>
              )}
            </div>
          </div>

          {/* Pesan */}
          {kepsekMessage.text && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm font-medium ${
              kepsekMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {kepsekMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : null}
              <span className="whitespace-pre-line">{kepsekMessage.text}</span>
            </div>
          )}

          {/* Password Admin (konfirmasi) */}
          <div>
            <label htmlFor="kepsekAdminPw" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
              <Lock className="w-4 h-4 text-sky-500" /> Password Admin Saat Ini
            </label>
            <div className="relative">
              <input
                id="kepsekAdminPw"
                type={showKepsekPw.admin ? 'text' : 'password'}
                value={kepsekForm.adminPassword}
                onChange={handleKepsekChange('adminPassword')}
                autoComplete="current-password"
                placeholder="Wajib diisi untuk konfirmasi"
                className={`w-full px-4 py-2.5 pr-11 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-colors ${
                  kepsekErrors.adminPassword ? 'border-rose-400' : 'border-gray-300'
                }`}
              />
              <button type="button" onClick={toggleKepsekPw('admin')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showKepsekPw.admin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {kepsekErrors.adminPassword && <p className="text-xs text-rose-500 mt-1">{kepsekErrors.adminPassword}</p>}
          </div>

          {/* Nama */}
          <div>
            <label htmlFor="kepsekNama" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
              <User className="w-4 h-4 text-sky-500" /> Nama Kepala Sekolah
            </label>
            <input
              id="kepsekNama"
              type="text"
              value={kepsekForm.nama}
              onChange={handleKepsekChange('nama')}
              placeholder="Contoh: Drs. Ahmad Yusuf, M.Pd."
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-colors ${
                kepsekErrors.nama ? 'border-rose-400' : 'border-gray-300'
              }`}
            />
            {kepsekErrors.nama && <p className="text-xs text-rose-500 mt-1">{kepsekErrors.nama}</p>}
          </div>

          {/* Username */}
          <div>
            <label htmlFor="kepsekUsername" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
              <User className="w-4 h-4 text-sky-500" /> Username
            </label>
            <input
              id="kepsekUsername"
              type="text"
              value={kepsekForm.username}
              onChange={handleKepsekChange('username')}
              autoComplete="username"
              placeholder="Minimal 3 karakter (huruf, angka, . _ -)"
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-colors ${
                kepsekErrors.username ? 'border-rose-400' : 'border-gray-300'
              }`}
            />
            {kepsekErrors.username && <p className="text-xs text-rose-500 mt-1">{kepsekErrors.username}</p>}
          </div>

          {/* Email (opsional) */}
          <div>
            <label htmlFor="kepsekEmail" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
              <User className="w-4 h-4 text-sky-500" /> Email <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              id="kepsekEmail"
              type="email"
              value={kepsekForm.email}
              onChange={handleKepsekChange('email')}
              autoComplete="email"
              placeholder="kepsek@sekolah.sch.id"
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-colors ${
                kepsekErrors.email ? 'border-rose-400' : 'border-gray-300'
              }`}
            />
            {kepsekErrors.email && <p className="text-xs text-rose-500 mt-1">{kepsekErrors.email}</p>}
          </div>

          {/* Password baru */}
          <div>
            <label htmlFor="kepsekPwBaru" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
              <KeyRound className="w-4 h-4 text-sky-500" /> {isKepsekCreate ? 'Password Awal' : 'Password Baru'} <span className="text-gray-400 font-normal">{isKepsekCreate ? '' : '(opsional)'}</span>
            </label>
            <div className="relative">
              <input
                id="kepsekPwBaru"
                type={showKepsekPw.baru ? 'text' : 'password'}
                value={kepsekForm.passwordBaru}
                onChange={handleKepsekChange('passwordBaru')}
                autoComplete="new-password"
                placeholder={isKepsekCreate ? 'Minimal 6 karakter' : 'Kosongkan jika tidak ingin mengubah password'}
                className={`w-full px-4 py-2.5 pr-11 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-colors ${
                  kepsekErrors.passwordBaru ? 'border-rose-400' : 'border-gray-300'
                }`}
              />
              <button type="button" onClick={toggleKepsekPw('baru')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showKepsekPw.baru ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {kepsekErrors.passwordBaru && <p className="text-xs text-rose-500 mt-1">{kepsekErrors.passwordBaru}</p>}
          </div>

          {/* Konfirmasi password */}
          <div>
            <label htmlFor="kepsekKonfirmasi" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
              <CheckCircle2 className="w-4 h-4 text-sky-500" /> Ulangi Password
            </label>
            <div className="relative">
              <input
                id="kepsekKonfirmasi"
                type={showKepsekPw.konfirmasi ? 'text' : 'password'}
                value={kepsekForm.konfirmasiBaru}
                onChange={handleKepsekChange('konfirmasiBaru')}
                autoComplete="new-password"
                placeholder="Ketik ulang password"
                className={`w-full px-4 py-2.5 pr-11 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-colors ${
                  kepsekErrors.konfirmasiBaru ? 'border-rose-400' : 'border-gray-300'
                }`}
              />
              <button type="button" onClick={toggleKepsekPw('konfirmasi')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showKepsekPw.konfirmasi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {kepsekErrors.konfirmasiBaru && <p className="text-xs text-rose-500 mt-1">{kepsekErrors.konfirmasiBaru}</p>}
          </div>

          {/* Tombol simpan */}
          <button
            type="submit"
            disabled={kepsekSaving}
            className="w-full bg-sky-600 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {kepsekSaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
            ) : (
              <><Save className="w-4 h-4" /> {isKepsekCreate ? 'Buat Akun Kepala Sekolah' : 'Simpan Perubahan Akun'}</>
            )}
          </button>
          <p className="text-center text-xs text-gray-400">
            ⓘ Kepala Sekolah bisa login dengan username & password ini, dan memiliki hak akses yang sama dengan Admin.
          </p>
        </form>
      )}

      {/* Hari Kerja Aktif */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-emerald-500">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${parseCsvNumbers(settings.workday_days).size > 0 ? 'bg-emerald-100' : 'bg-gray-100'}`}>
            <CalendarCheck className={`w-6 h-6 ${parseCsvNumbers(settings.workday_days).size > 0 ? 'text-emerald-600' : 'text-gray-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Hari Kerja Aktif</h3>
            <p className="text-sm text-gray-600 mb-4">
              Centang hari yang aktif untuk presensi. PKBM Tunas Ilmu default: Sabtu saja.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              {[
                { num: 1, label: 'Senin' },
                { num: 2, label: 'Selasa' },
                { num: 3, label: 'Rabu' },
                { num: 4, label: 'Kamis' },
                { num: 5, label: 'Jumat' },
                { num: 6, label: 'Sabtu' },
                { num: 0, label: 'Minggu' }
              ].map(day => {
                const checked = parseCsvNumbers(settings.workday_days).has(day.num)
                return (
                  <label
                    key={day.num}
                    className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer select-none transition-colors ${
                      checked ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                    } ${saving ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCsvNumber('workday_days', day.num)}
                      className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                    />
                    <span className={`text-sm font-medium ${checked ? 'text-emerald-700' : 'text-gray-700'}`}>
                      {day.label}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Konfigurasi Rotasi Piket Sabtu */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-indigo-500">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${settings.piket_rotation_enabled == '1' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
            <Users className={`w-6 h-6 ${settings.piket_rotation_enabled == '1' ? 'text-indigo-600' : 'text-gray-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Konfigurasi Rotasi Piket Sabtu</h3>
            <p className="text-sm text-gray-600 mb-4">
              Guru grup A piket Sabtu pekan yang dicentang, grup B di pekan lainnya. Pekan dihitung dari tanggal dalam bulan (1-7=pekan 1, dst).
            </p>

            {/* Toggle Rotasi Piket */}
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => {
                  const newValue = settings.piket_rotation_enabled == '1' ? '0' : '1'
                  handleChange('piket_rotation_enabled', newValue)
                  handleSave('piket_rotation_enabled', newValue)
                }}
                disabled={saving}
                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  settings.piket_rotation_enabled == '1' ? 'bg-indigo-600' : 'bg-gray-400'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    settings.piket_rotation_enabled == '1' ? 'translate-x-9' : 'translate-x-1'
                  }`}
                />
              </button>
              <div>
                <p className={`font-bold ${settings.piket_rotation_enabled == '1' ? 'text-indigo-600' : 'text-gray-600'}`}>
                  {settings.piket_rotation_enabled == '1' ? 'ROTASI PIKET AKTIF' : 'ROTASI PIKET NONAKTIF'}
                </p>
                <p className="text-xs text-gray-500">
                  {settings.piket_rotation_enabled == '1'
                    ? 'Guru dibagi rotasi grup A/B berdasarkan pekan Sabtu'
                    : 'Rotasi piket Sabtu dinonaktifkan'}
                </p>
              </div>
            </div>

            {/* Grup A & B - checkboxes pekan 1-4 (pekan ke-5 diatur terpisah oleh Mode Pekan ke-5) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {[
                { key: 'piket_group_a_weeks', label: 'Grup A piket pekan', color: 'blue' },
                { key: 'piket_group_b_weeks', label: 'Grup B piket pekan', color: 'indigo' }
              ].map(group => {
                const selected = parseCsvNumbers(settings[group.key])
                return (
                  <div key={group.key}>
                    <p className="block text-sm font-medium text-gray-700 mb-2">{group.label}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map(week => {
                        const checked = selected.has(week)
                        const colorClasses = group.color === 'blue'
                          ? (checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50')
                          : (checked ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50')
                        const textClasses = group.color === 'blue'
                          ? (checked ? 'text-blue-700' : 'text-gray-700')
                          : (checked ? 'text-indigo-700' : 'text-gray-700')
                        return (
                          <label
                            key={week}
                            className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-3 cursor-pointer select-none transition-colors ${colorClasses} ${saving ? 'opacity-60 pointer-events-none' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCsvNumber(group.key, week)}
                              className={`w-4 h-4 border-gray-300 rounded ${group.color === 'blue' ? 'text-blue-600 focus:ring-blue-500' : 'text-indigo-600 focus:ring-indigo-500'}`}
                            />
                            <span className={`text-xs font-medium ${textClasses}`}>Pekan {week}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pekan ke-5 mode */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Pekan ke-5 (jika ada Sabtu ke-5)</label>
              <div className="flex items-center gap-4">
                <select
                  value={settings.piket_week5_mode || 'all'}
                  onChange={(e) => {
                    handleChange('piket_week5_mode', e.target.value)
                    handleSave('piket_week5_mode', e.target.value)
                  }}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="all">Semua guru</option>
                  <option value="none">Tidak ada</option>
                  <option value="A">Grup A</option>
                  <option value="B">Grup B</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Menentukan grup mana yang piket bila dalam satu bulan terdapat Sabtu ke-5.
              </p>
            </div>

            {/* Jam Masuk & Jam Pulang Piket */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Jam Masuk Piket</label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={settings.piket_jam_masuk || '07:00'}
                    onChange={(e) => handleChange('piket_jam_masuk', e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => handleSave('piket_jam_masuk')}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
                  >
                    <Save className="w-4 h-4" />
                    Simpan
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Contoh: 07:00</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Jam Pulang Piket</label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={settings.piket_jam_pulang || '13:00'}
                    onChange={(e) => handleChange('piket_jam_pulang', e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => handleSave('piket_jam_pulang')}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
                  >
                    <Save className="w-4 h-4" />
                    Simpan
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Contoh: 13:00</p>
              </div>
            </div>
          </div>
        </div>
      </div>

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
              <button
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
              <button
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Interval Tracking (menit)</label>
                <div className="flex gap-2">
                  <input
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Batas Akurasi GPS Maksimum (meter)</label>
                <div className="flex gap-2">
                  <input
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
              <button
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
              <button
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nama Sekolah
              </label>
              <div className="flex items-center gap-4">
                <input
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Latitude (Garis Lintang)
              </label>
              <div className="flex items-center gap-4">
                <input
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Longitude (Garis Bujur)
              </label>
              <div className="flex items-center gap-4">
                <input
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

      {/* Info Box */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <h4 className="font-bold text-blue-800 mb-2">ℹ️ Informasi Penting</h4>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li>Perubahan pengaturan akan langsung berlaku untuk presensi berikutnya</li>
          <li>Presensi yang sudah tercatat tidak akan berubah</li>
          <li>Pastikan pengaturan sesuai dengan kebijakan sekolah</li>
          <li>Radius GPS terlalu kecil dapat menyebabkan guru kesulitan presensi</li>
          <li>Koordinat GPS harus akurat agar validasi presensi berjalan dengan baik</li>
          <li>Gunakan Google Maps untuk mendapatkan koordinat yang tepat</li>
        </ul>
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

export default Pengaturan
