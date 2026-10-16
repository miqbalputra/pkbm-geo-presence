import { BrowserRouter as Router, Routes, Route, Navigate } from './router'
import { useState, useEffect, useRef, Component, Suspense, lazy } from 'react'
import { Download, X } from 'lucide-react'
import { authAPI } from './services/api'
import Login from './pages/Login'
import { ToastViewport, notify } from './components/ui/toast'

const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const GuruDashboard = lazy(() => import('./pages/GuruDashboard'))

function PageLoading() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )
}

const PWA_INSTALL_DISMISSED_KEY = 'pwa-install-dismissed-session'

function hasDismissedInstallPrompt() {
  try {
    return sessionStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function isRunningAsInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function getInstallInstructions() {
  const userAgent = navigator.userAgent || ''
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isIOS) {
    return 'Di Safari, ketuk tombol Bagikan lalu pilih “Tambahkan ke Layar Utama”.'
  }
  if (/Android/i.test(userAgent)) {
    return 'Buka menu ⋮ pada browser, lalu pilih “Install app” atau “Tambahkan ke layar utama”.'
  }
  if (/Safari/i.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR)/i.test(userAgent)) {
    return 'Di Safari macOS, buka menu File lalu pilih “Add to Dock”.'
  }
  return 'Di Chrome atau Edge, klik ikon Pasang pada bilah alamat atau pilih “Install Presensi PKBM” dari menu browser.'
}

// ─── Error Boundary: mencegah white screen akibat uncaught error di child ───
type ErrorBoundaryProps = { children?: React.ReactNode }
type ErrorBoundaryState = { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare state: ErrorBoundaryState

  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('🔴 ErrorBoundary caught:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#f9fafb', padding: '24px', fontFamily: 'sans-serif'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 20, marginBottom: 8 }}>
            Terjadi Kesalahan
          </h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
            Aplikasi mengalami error. Silakan muat ulang halaman.
          </p>
          <p style={{ color: '#9ca3af', fontSize: 11, marginBottom: 24, maxWidth: 400, textAlign: 'center', wordBreak: 'break-word' }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#3b82f6', color: 'white', border: 'none',
              borderRadius: 8, padding: '12px 24px', fontWeight: 'bold',
              fontSize: 14, cursor: 'pointer'
            }}
          >
            🔄 Muat Ulang Halaman
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const [user, setUser] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const inactivityTimerRef = useRef(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [appInstalled, setAppInstalled] = useState(false)
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30 menit dalam milidetik

  // Didefinisikan sebelum useEffect agar bisa dipakai di dalam syncSession
  const persistUser = (userData) => {
    const existingUser = JSON.parse(localStorage.getItem('user') || '{}')
    const loginAt = existingUser.loginAt || userData.loginAt || Date.now()
    const userWithTimestamp = { ...existingUser, ...userData, loginAt }
    // Never persist legacy remember/access tokens in browser storage.
    delete userWithTimestamp.rememberToken

    setUser(userWithTimestamp)
    localStorage.setItem('user', JSON.stringify(userWithTimestamp))
    return userWithTimestamp
  }

  const handleLogin = (userData) => {
    persistUser({ ...userData, loginAt: Date.now() })
  }

  const handleLogout = () => {
    authAPI.logout().catch(() => {})
    setUser(null)
    localStorage.removeItem('user')
  }

  useEffect(() => {
    const syncSession = async () => {
      const savedUser = localStorage.getItem('user')
      if (savedUser) {
        try {
          // 1. LANGSUNG set user dari localStorage agar nama & data tersedia saat render pertama
          //    Ini mencegah nama "?" di mobile saat halaman di-refresh
          const localUser = JSON.parse(savedUser)
          if (localUser && localUser.role) {
            setUser(localUser)
          }

          // Semua role dipulihkan melalui refresh token HttpOnly dari backend Go.
          if (localUser && localUser.role === 'guru') {
            try {
              const session = await authAPI.checkSession()
              if (session.success && session.data) {
                persistUser({
                  ...localUser,
                  id: session.data.id || session.data.user_id || localUser.id,
                  user_id: session.data.user_id || localUser.user_id,
                  username: session.data.username || localUser.username,
                  role: session.data.role || localUser.role,
                  nama: session.data.nama || localUser.nama
                })
                return
              }
              handleLogout()
            } catch (restoreError) {
              console.warn('Session restore failed:', restoreError)
              handleLogout()
            }
            return
          }

          // 2. Untuk Admin/Kepala Sekolah: Verifikasi sesi dengan backend
          const response = await authAPI.checkSession()
          if (response.success && response.data) {
            // Merge: prioritaskan data API, tapi fallback ke localStorage untuk field yang mungkin kosong
            const mergedUser = { ...localUser, ...response.data }
            // Pastikan nama tidak hilang
            if (!mergedUser.nama && localUser.nama) {
              mergedUser.nama = localUser.nama
            }
            setUser(mergedUser)
            localStorage.setItem('user', JSON.stringify(mergedUser))
          } else {
            handleLogout()
          }
        } catch (err) {
          // Jika API gagal, user sudah ter-set dari localStorage di atas — biarkan saja
          console.warn('Session sync failed:', err)
          handleLogout()
        }
      }
    }

    void syncSession().finally(() => setSessionLoading(false))

  }, [])

  useEffect(() => {
    if (isRunningAsInstalledApp()) {
      setAppInstalled(true)
      return undefined
    }

    const showTimer = hasDismissedInstallPrompt()
      ? undefined
      : window.setTimeout(() => {
        if (!hasDismissedInstallPrompt()) setShowInstallPrompt(true)
      }, 5000)

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
      setShowInstallHelp(false)
      if (!hasDismissedInstallPrompt()) setShowInstallPrompt(true)
    }

    const handleAppInstalled = () => {
      setAppInstalled(true)
      setDeferredPrompt(null)
      setShowInstallPrompt(false)
      setShowInstallHelp(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      if (showTimer !== undefined) window.clearTimeout(showTimer)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Auto-logout setelah 30 menit tidak ada aktivitas (Hanya untuk Admin/Kepala Sekolah)
  useEffect(() => {
    // JIKA GURU, tidak perlu timer inaktivitas agar awet 30 hari
    if (!user || user.role === 'guru') return

    const resetTimer = () => {
      // Clear timer yang ada
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }

      // Set timer baru
      inactivityTimerRef.current = setTimeout(() => {
        handleLogout()
        notify('Sesi Anda telah berakhir karena tidak ada aktivitas selama 30 menit. Silakan masuk kembali.')
      }, INACTIVITY_TIMEOUT)
    }

    // Event yang menandakan user masih aktif
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']

    // Reset timer setiap ada aktivitas
    events.forEach(event => {
      document.addEventListener(event, resetTimer)
    })

    // Mulai timer pertama kali
    resetTimer()

    // Cleanup
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
      events.forEach(event => {
        document.removeEventListener(event, resetTimer)
      })
    }
  }, [user])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowInstallHelp((visible) => !visible)
      return
    }

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setAppInstalled(true)
      try { sessionStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1') } catch { /* Ignore unavailable storage. */ }
      setShowInstallPrompt(false)
      setShowInstallHelp(false)
    } catch (error) {
      console.warn('Install prompt could not be opened:', error)
      setShowInstallHelp(true)
    }
    setDeferredPrompt(null);
  }

  const dismissInstallPrompt = () => {
    setShowInstallPrompt(false)
    setShowInstallHelp(false)
    try { sessionStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1') } catch { /* Ignore unavailable storage. */ }
  }

  return (
    <ErrorBoundary>
      <Router>
        <ToastViewport />
        <Suspense fallback={<PageLoading />}>
          {sessionLoading ? <PageLoading /> : <Routes>
            <Route path="/login" element={
              user ? <Navigate to={user.role === 'guru' ? '/guru' : '/admin'} /> : <Login onLogin={handleLogin} />
            } />
            <Route path="/admin/*" element={
              user && (user.role === 'admin' || user.role === 'kepala_sekolah') ?
              <AdminDashboard user={user} onLogout={handleLogout} /> :
              <Navigate to="/login" />
            } />
            <Route path="/guru/*" element={
              user && user.role === 'guru' ?
              <GuruDashboard user={user} onLogout={handleLogout} /> :
              <Navigate to="/login" />
            } />
            <Route path="/" element={<Navigate to="/login" />} />
          </Routes>}
        </Suspense>
        {showInstallPrompt && !appInstalled && <aside
          className={`fixed left-3 right-3 z-[80] mx-auto max-w-md rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl ${user?.role === 'guru' ? 'bottom-24 sm:bottom-5' : 'bottom-5'} sm:left-auto sm:right-5`}
          aria-label="Ajakan memasang Presensi PKBM"
        >
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Pasang Presensi PKBM</p>
              <p className="mt-1 text-xs text-muted-foreground">Buka presensi lebih mudah dari layar utama perangkat.</p>
            </div>
            <button type="button" aria-label="Tutup ajakan pemasangan" onClick={dismissInstallPrompt} className="ui-icon-button -mr-2 -mt-2 h-10 w-10">
              <X className="h-5 w-5" />
            </button>
          </div>
          {showInstallHelp && <p role="status" className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">{getInstallInstructions()}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={handleInstallClick} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              {deferredPrompt ? 'Pasang sekarang' : showInstallHelp ? 'Sembunyikan petunjuk' : 'Cara pasang'}
            </button>
          </div>
        </aside>}

      </Router>
    </ErrorBoundary>
  )
}

export default App
