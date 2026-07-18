import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef, Component, Suspense } from 'react'
import { Download, X } from 'lucide-react'
import { users as initialUsers } from './data/dummyData'
import { authAPI } from './services/api'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import GuruDashboard from './pages/GuruDashboard'

function PageLoading() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )
}

// ─── Error Boundary: mencegah white screen akibat uncaught error di child ───
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
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
  const inactivityTimerRef = useRef(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30 menit dalam milidetik
  const GURU_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000 // 30 hari dalam milidetik

  // Didefinisikan sebelum useEffect agar bisa dipakai di dalam syncSession
  const persistUser = (userData) => {
    const existingUser = JSON.parse(localStorage.getItem('user') || '{}')
    const loginAt = existingUser.loginAt || userData.loginAt || Date.now()
    const rememberToken = userData.rememberToken || existingUser.rememberToken
    const userWithTimestamp = { ...existingUser, ...userData, loginAt }
    if (rememberToken) {
      userWithTimestamp.rememberToken = rememberToken
    }

    setUser(userWithTimestamp)
    localStorage.setItem('user', JSON.stringify(userWithTimestamp))
    return userWithTimestamp
  }

  const handleLogin = (userData) => {
    persistUser({ ...userData, loginAt: Date.now() })
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('user')
  }

  useEffect(() => {
    // Initialize users in localStorage if not exists
    if (!localStorage.getItem('users')) {
      localStorage.setItem('users', JSON.stringify(initialUsers))
    }
    
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

          // Jika guru, cek apakah 30 hari belum lewat sebelum panggil backend
          if (localUser && localUser.role === 'guru') {
            const loginAt = localUser.loginAt
            if (loginAt && (Date.now() - loginAt) >= GURU_30_DAYS_MS) {
              // 30 hari sudah lewat, paksa logout
              handleLogout()
              return
            }
            // Masih dalam 30 hari: tidak perlu cek backend session, langsung biarkan login
            // (session PHP di server mungkin sudah expire, tapi localStorage masih valid)
            if (!localUser.loginAt) {
              // Jika belum ada loginAt (user lama), tambahkan sekarang agar periodenya terhitung
              persistUser({ ...localUser, loginAt: Date.now() })
            }

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
            } catch (_) {
              // Session PHP mungkin hilang setelah browser tidur/redeploy; coba pulihkan dari token 30 hari.
            }

            if (localUser.rememberToken) {
              try {
                const restored = await authAPI.restoreSession(localUser.rememberToken)
                if (restored.success && restored.data) {
                  persistUser(restored.data)
                }
              } catch (restoreError) {
                console.warn('Guru session restore failed:', restoreError)
              }
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
          console.warn('Session sync failed, using local data:', err)
        }
      }
    }

    syncSession()

    // PWA Logic: Catch install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt after 5 seconds if not installed yet
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 5000);
    });

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
        alert('Sesi Anda telah berakhir karena tidak ada aktivitas selama 30 menit. Silakan login kembali.')
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
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  }

  return (
    <ErrorBoundary>
      <Router>
        <Suspense fallback={<PageLoading />}>
          <Routes>
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
          </Routes>
        </Suspense>

        {/* PWA Install Popup */}
        {showInstallPrompt && (
          <div className="fixed bottom-20 left-4 right-4 z-50 animate-bounce">
            <div className="bg-white rounded-2xl shadow-2xl p-4 flex items-center justify-between border-2 border-blue-500">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Download className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 text-sm">Pasang Geo Presensi PKBM Tunas Ilmu</h4>
                  <p className="text-xs text-gray-500">Akses lebih cepat & mudah!</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleInstallClick}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  PASANG
                </button>
                <button
                  onClick={() => setShowInstallPrompt(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Router>
    </ErrorBoundary>
  )
}

export default App
