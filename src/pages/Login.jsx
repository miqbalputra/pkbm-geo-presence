import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Info, X, ChevronRight, Globe, MessageCircle, Mail, Sun, Moon } from 'lucide-react'
import { authAPI, activityAPI, configAPI } from '../services/api'

// Fallback build-time client id (opsional). Sumber utama adalah API /google_config.php
const FALLBACK_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

const GOOGLE_CLIENT_ID_CACHE_KEY = 'gq-google-client-id'
const GOOGLE_OAUTH_STATE_KEY = 'gq-google-oauth-state'
const GOOGLE_OAUTH_NONCE_KEY = 'gq-google-oauth-nonce'

const randomToken = () => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function startGoogleRedirect(clientId) {
  const state = randomToken()
  const nonce = randomToken()
  sessionStorage.setItem(GOOGLE_OAUTH_STATE_KEY, state)
  sessionStorage.setItem(GOOGLE_OAUTH_NONCE_KEY, nonce)

  const redirectUri = `${window.location.origin}/login`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state,
    prompt: 'select_account',
  })

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

function loadGoogleIdentityScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google)
      return
    }

    const existing = document.querySelector('script[data-gis="1"]')
    if (existing && !window.google?.accounts?.id) {
      // Pada PWA/mobile kadang script tag lama tersisa, tetapi object google
      // tidak pernah tersedia. Buat ulang agar tidak menunggu event load yang
      // sudah lewat / gagal diam-diam.
      existing.remove()
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.setAttribute('data-gis', '1')
    script.onload = () => resolve(window.google)
    script.onerror = () => reject(new Error('GIS script failed to load'))
    document.head.appendChild(script)
  })
}

// Muat script Google Identity Services & render tombolnya
function useGoogleSignIn(clientId, onCredential, onRendered) {
  const containerRef = useRef(null)
  const callbackRef = useRef(onCredential)
  callbackRef.current = onCredential
  const renderedRef = useRef(onRendered)
  renderedRef.current = onRendered

  useEffect(() => {
    if (!clientId || !containerRef.current) return undefined

    let cancelled = false
    let retryCount = 0
    const MAX_RETRIES = 5

    // Hitung lebar container untuk render button yang responsif (mencegah
    // button gagal render di layar mobile yang sempit)
    const getButtonWidth = () => {
      if (!containerRef.current) return 280
      const w = containerRef.current.clientWidth
      // Minimum 200, maksimum 400 — pastikan muat di layar HP
      return Math.max(200, Math.min(400, w))
    }

    const renderButton = () => {
      if (cancelled || !window.google?.accounts?.id || !containerRef.current) return

      // Reset kontainer sebelum render (mencegah duplikasi button)
      containerRef.current.innerHTML = ''

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => callbackRef.current?.(resp),
      })
      window.google.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: getButtonWidth(),
        locale: 'id',
      })

      // Cek apakah button benar-benar ter-render (memiliki iframe/child).
      // Pada mobile/PWA, GIS terkadang gagal render diam-diam. Retry jika kosong.
      setTimeout(() => {
        if (cancelled) return
        const hasContent = containerRef.current && containerRef.current.children.length > 0
        const hasHeight = containerRef.current && containerRef.current.offsetHeight > 0
        if ((!hasContent || !hasHeight) && retryCount < MAX_RETRIES) {
          retryCount++
          console.warn(`GIS button render retry ${retryCount}/${MAX_RETRIES}`)
          renderButton()
        } else if (hasContent && hasHeight) {
          renderedRef.current?.(true)
        }
      }, 800)
    }

    const loadAndRender = () => {
      if (window.google?.accounts?.id) {
        renderButton()
      } else {
        loadGoogleIdentityScript()
          .then(renderButton)
          .catch((err) => console.error(err))
      }
    }

    // Small delay to ensure container is laid out (penting di mobile)
    const timer = setTimeout(loadAndRender, 100)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [clientId])

  return containerRef
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('gq-theme') || 'light' }
    catch { return 'light' }
  })
  const navigate = useNavigate()

  const [googleClientId, setGoogleClientId] = useState(() => {
    try {
      return FALLBACK_GOOGLE_CLIENT_ID || localStorage.getItem(GOOGLE_CLIENT_ID_CACHE_KEY) || ''
    } catch {
      return FALLBACK_GOOGLE_CLIENT_ID
    }
  })
  const [googleConfigLoading, setGoogleConfigLoading] = useState(false)
  const [googleFallback, setGoogleFallback] = useState(true)
  const googleRenderedRef = useRef(false)

  const loadGoogleClientId = async ({ silent = true } = {}) => {
    if (googleClientId) return googleClientId
    setGoogleConfigLoading(true)
    let lastError = null

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await configAPI.getGoogleConfig()
        const id = res?.data?.googleClientId || ''
        if (id) {
          setGoogleClientId(id)
          try { localStorage.setItem(GOOGLE_CLIENT_ID_CACHE_KEY, id) } catch {}
          setGoogleConfigLoading(false)
          return id
        }
      } catch (err) {
        lastError = err
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 700))
    }

    setGoogleConfigLoading(false)
    if (!silent) {
      setError(lastError?.message || 'Konfigurasi Google Login belum tersedia. Silakan coba lagi.')
    }
    return ''
  }

  // Ambil Google Client ID dari backend (runtime, tidak perlu build arg) dengan retry.
  useEffect(() => {
    loadGoogleClientId({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGoogleCredential = async (resp) => {
    const credential = resp?.credential || resp?.id_token
    if (!credential) return
    setLoading(true)
    setError('')
    try {
      const response = await authAPI.googleLogin(credential)
      const user = response.data
      onLogin(user)
      try {
        await activityAPI.create({ user: user.nama, aktivitas: 'Login (Google)', status: 'Sukses' })
      } catch (logError) {
        console.error('Failed to log activity:', logError)
      }
      navigate(user.role === 'guru' ? '/guru' : '/admin')
    } catch (err) {
      setError(err.message || 'Login Google gagal.')
    } finally {
      setLoading(false)
    }
  }

  // Terima callback dari mode OAuth redirect mobile/PWA.
  useEffect(() => {
    const hash = window.location.hash || ''
    if (!hash.includes('id_token=')) return

    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const idToken = params.get('id_token')
    const state = params.get('state')
    const expectedState = sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY)

    // Bersihkan fragment agar token tidak tertinggal di URL.
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search)

    if (!idToken) return
    if (expectedState && state !== expectedState) {
      setError('Validasi login Google gagal. Silakan coba lagi.')
      return
    }

    sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY)
    sessionStorage.removeItem(GOOGLE_OAUTH_NONCE_KEY)
    handleGoogleCredential({ credential: idToken })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const googleEnabled = !!googleClientId
  const showGoogleSection = true
  const googleContainerRef = useGoogleSignIn(googleClientId, handleGoogleCredential, (rendered) => {
    googleRenderedRef.current = rendered
    if (rendered) setGoogleFallback(false)
  })

  // Fallback: jika GIS button tidak ter-render dalam 6 detik (umum di mobile/PWA),
  // tampilkan tombol Google manual yang memanggil One Tap prompt.
  useEffect(() => {
    if (!googleEnabled) return
    const timer = setTimeout(() => {
      if (!googleRenderedRef.current) {
        console.warn('GIS button not rendered after 6s — showing fallback')
        setGoogleFallback(true)
      }
    }, 6000)
    return () => clearTimeout(timer)
  }, [googleEnabled])

  // Handler untuk tombol custom Google. Tombol ini selalu tampil, sehingga di
  // mobile/PWA user tetap melihat opsi Google walaupun iframe GIS gagal render.
  const handleGoogleFallback = async () => {
    setError('')
    const clientId = await loadGoogleClientId({ silent: false })
    if (!clientId) return

    try {
      await loadGoogleIdentityScript()
      if (!window.google?.accounts?.id) {
        startGoogleRedirect(clientId)
        return
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => handleGoogleCredential(resp),
        cancel_on_tap_outside: false,
      })
      window.google.accounts.id.prompt((notification) => {
        if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
          // Mobile/PWA sering memblokir One Tap. Pakai redirect agar tetap jalan.
          startGoogleRedirect(clientId)
        }
      })
    } catch (err) {
      console.error('Google GIS script failed, using redirect fallback:', err)
      startGoogleRedirect(clientId)
    }
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem('gq-theme', next) } catch {}
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  const changelog = [
    {
      version: 'v1.0.1',
      date: 'Juli 2026',
      stable: true,
      features: [
        'Mode Presensi Pokjar — presensi sederhana untuk guru 3 Pokjar binaan (Lentera Qalbu, Umar bin Khattab, Nashirus Sunnah): cukup Hadir / Sakit / Izin (+ keterangan), klik murni tanpa GPS & tanpa jam terikat',
        'Laporan Pokjar — laporan Excel khusus per Pokjar dengan ringkasan Hadir/Sakit/Izin + detail presensi',
        'Tag Pokjar di Data Guru — penugasan guru ke Pokjar lewat modal guru, ditampilkan sebagai kolom & badge di tabel',
        'Icon PWA baru (icon_pwa.png) — ikon aplikasi & favicon diperbarui, Service Worker v16 memaksa refresh cache',
        'Hardening keamanan — berhenti melacak file debug yang membocorkan data guru tanpa autentikasi'
      ]
    },
    {
      version: 'v1.0.0',
      date: 'Juli 2026',
      stable: true,
      features: [
        'Peluncuran Geo Presensi PKBM Tunas Ilmu — rebranding total dari aplikasi lama',
        'Hari kerja hanya Sabtu (dapat dikonfigurasi admin) — sesuai jadwal kegiatan PKBM',
        'Presensi Geolocation (GPS) + Geofencing radius sekolah, didukung scan QR Code',
        'PWA — aplikasi dapat di-install di HP, sesi login 30 hari + heartbeat otomatis',
        'Tanda tangan digital per akun guru — disimpan sekali di menu Akun, admin lihat sebagai bukti',
        'Rotasi Piket dwi-pekanan per bulan — Grup A (pekan 1 & 3), Grup B (pekan 2 & 4), pekan ke-5 semua guru (dapat diatur)',
        'Presensi pulang dengan jam minimum, izin pulang awal, dan deteksi lupa pulang',
        'Login dengan Google — akun dicocokkan otomatis berdasarkan email guru',
        'Menu Akun Guru — update data diri, ganti password mandiri, dan tanda tangan digital',
        'Dashboard admin: Data Guru & Arsip Guru (import/export Excel), Edit Presensi, Presensi Manual, Hari Libur, Hari Kerja Opsional, Override Weekend, Log Aktivitas, Lokasi & Geofence, Tracking Lokasi, QR Code, Pengaturan, AI Agent',
        'Laporan & leaderboard adaptif — perhitungan hari kerja otomatis mengikuti jadwal Sabtu',
        'Dark Mode & Light Mode di seluruh halaman'
      ]
    }
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authAPI.login(username, password)
      const user = response.data

      onLogin(user)

      try {
        await activityAPI.create({
          user: user.nama,
          aktivitas: 'Login',
          status: 'Sukses'
        })
      } catch (logError) {
        console.error('Failed to log activity:', logError)
      }

      navigate(user.role === 'guru' ? '/guru' : '/admin')
    } catch (err) {
      setError(err.message || 'Username atau password salah')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="fixed top-5 right-5 z-50 p-2.5 text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-slate-900 rounded-full transition-colors"
        title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
        aria-label={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-8 w-full max-w-md transition-colors">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl mb-4">
            <LogIn className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Geo Presensi PKBM Tunas Ilmu</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">Sistem Presensi Geolocation & QR Code</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent outline-none transition-colors"
              placeholder="Masukkan username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent outline-none transition-colors"
              placeholder="Masukkan password"
              required
            />
          </div>

          {error && (
            <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 dark:bg-indigo-500 text-white py-3.5 rounded-2xl font-bold text-base hover:bg-indigo-700 dark:hover:bg-indigo-400 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 transition-all shadow-sm"
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </button>

          {/* Login Google */}
          {showGoogleSection && (
            <>
              <div className="flex items-center gap-3 my-1" aria-hidden="true">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">atau masuk dengan</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>
              {/* Container untuk GIS button resmi. Jika gagal render di mobile/PWA,
                  tombol custom di bawah tetap tersedia. */}
              {googleEnabled && <div className="flex justify-center min-h-[44px]" ref={googleContainerRef} />}
              {(googleFallback || !googleEnabled) && (
                <button
                  type="button"
                  onClick={handleGoogleFallback}
                  disabled={loading || googleConfigLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 mt-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-2xl font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {googleConfigLoading ? 'Menyiapkan Google...' : 'Masuk dengan Google'}
                </button>
              )}
            </>
          )}
        </form>

        {/* Info Link */}
        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setShowInfo(true)}
            className="w-full flex items-center justify-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold transition-colors group"
          >
            <Info className="w-4 h-4 group-hover:scale-110 transition-transform" />
            Tentang Aplikasi & Update
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          <p className="mb-1">Supported by SistemFlow</p>
          <p>
            Hak Cipta &copy; 2026{' '}
            <a
              href="https://sistemflow.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 dark:text-indigo-400 hover:underline"
            >
              SistemFlow.com
            </a>
          </p>
        </div>
      </div>

      {/* MODAL INFO APLIKASI */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col animate-scale-up border border-slate-100 dark:border-slate-800">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-indigo-600 dark:bg-indigo-500 text-white">
              <div>
                <h2 className="text-xl font-bold">Informasi Aplikasi</h2>
                <p className="text-indigo-100 dark:text-indigo-200 text-xs mt-0.5">PKBM Tunas Ilmu Version Control</p>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {/* Developer Info */}
              <section>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-600 dark:bg-indigo-400 rounded-full"></span>
                  Pengembang
                </h3>
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 flex items-center gap-4 border border-slate-100 dark:border-slate-700">
                  <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-100 dark:shadow-none">
                    MI
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-800 dark:text-slate-100">M. Iqbal Putra</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3">Fullstack Developer & Systems Analyst</p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href="https://wa.me/6281390292177"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 transition-colors shadow-sm"
                      >
                        <MessageCircle className="w-3 h-3" />
                        WhatsApp
                      </a>
                      <a
                        href="mailto:iqbalmarketist@gmail.com"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-[10px] font-bold rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 transition-colors shadow-sm"
                      >
                        <Mail className="w-3 h-3" />
                        Email
                      </a>
                      <a
                        href="https://sistemflow.com"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white text-[10px] font-bold rounded-lg hover:bg-indigo-600 transition-colors shadow-sm"
                      >
                        <Globe className="w-3 h-3" />
                        Website
                      </a>
                    </div>
                  </div>
                </div>
              </section>

              {/* Changelog */}
              <section>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-600 dark:bg-indigo-400 rounded-full"></span>
                  Changelog Update
                </h3>
                <div className="space-y-4">
                  {changelog.map((item, idx) => (
                    <div key={idx} className={`relative pl-6 border-l-2 pb-2 ${item.stable ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-indigo-100 dark:border-indigo-500/20'}`}>
                      <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white dark:border-slate-900 ${item.stable ? 'bg-emerald-200 dark:bg-emerald-500/30' : 'bg-indigo-100 dark:bg-indigo-500/20'}`}></div>
                      <div className="flex items-baseline justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-white text-[10px] font-bold rounded-full ${item.stable ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-indigo-600 dark:bg-indigo-500'}`}>
                            {item.version}
                          </span>
                          {item.stable && (
                            <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-200 dark:border-emerald-500/20">
                              STABLE
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{item.date}</span>
                      </div>
                      <ul className="space-y-2">
                        {item.features.map((feature, fIdx) => (
                          <li key={fIdx} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                            <ChevronRight className={`w-3 h-3 mt-0.5 shrink-0 ${item.stable ? 'text-emerald-400 dark:text-emerald-500' : 'text-indigo-400 dark:text-indigo-500'}`} />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Footer Modal */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 text-center">
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                Aplikasi ini dirancang khusus untuk meningkatkan kedisiplinan dan efisiensi manajemen kehadiran guru.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Login
