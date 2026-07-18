import { useState, useEffect, Suspense, lazy } from 'react'
import { Home, History, Users, LogOut, BarChart3, Sun, Moon, UserCog } from 'lucide-react'
import GuruHome from '../components/guru/GuruHome'
import GuruAkun from '../components/guru/GuruAkun'

const GuruRiwayat = lazy(() => import('../components/guru/GuruRiwayat'))
const GuruStatus = lazy(() => import('../components/guru/GuruStatus'))
const GuruStatistik = lazy(() => import('../components/guru/GuruStatistik'))

  function TabLoading() {
  return (
    <div className="min-h-[220px] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-200 dark:border-slate-700 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin" />
    </div>
  )
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('gq-theme') || 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    try {
      localStorage.setItem('gq-theme', theme)
    } catch {
      // ignore storage errors
    }
  }, [theme])

  const toggle = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  return { theme, toggle }
}

function GuruDashboard({ user, onLogout }) {
  const { theme, toggle } = useTheme()

  // Restore tab terakhir dari localStorage
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('lastGuruTab') || 'home'
  })

  // Simpan tab terakhir ke localStorage setiap kali berubah
  useEffect(() => {
    localStorage.setItem('lastGuruTab', activeTab)
  }, [activeTab])

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'riwayat', label: 'Riwayat', icon: History },
    { id: 'status', label: 'Status', icon: Users },
    { id: 'statistik', label: 'Statistik', icon: BarChart3 },
    { id: 'akun', label: 'Akun', icon: UserCog }
  ]

  const firstName = (user?.nama || 'Guru').split(' ')[0]
  const avatarInitial = (user?.nama || 'G').charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28 transition-colors">
      {/* Personalized Header */}
      <header className="sticky top-0 z-40 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm px-5 pt-5 pb-3 transition-colors">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Geo Presensi PKBM Tunas Ilmu</p>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Assalamu'alaikum <span className="text-blue-700 dark:text-blue-400">{firstName}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
              {avatarInitial}
            </div>
            <button
              onClick={toggle}
              className="p-2.5 text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-slate-900 rounded-full transition-colors"
              title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
              aria-label={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={onLogout}
              className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/30 rounded-full transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-5">
        {activeTab === 'home' && <GuruHome user={user} onChangeTab={setActiveTab} />}
        {activeTab === 'akun' && <GuruAkun user={user} />}
        {activeTab !== 'home' && activeTab !== 'akun' && (
          <Suspense fallback={<TabLoading />}>
            {activeTab === 'riwayat' && <GuruRiwayat user={user} />}
            {activeTab === 'status' && <GuruStatus user={user} />}
            {activeTab === 'statistik' && <GuruStatistik user={user} />}
          </Suspense>
        )}
      </main>

      {/* Floating Pill Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-[22rem]">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 shadow-[0_12px_40px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)] rounded-full p-1.5 flex items-center justify-between transition-colors mx-auto">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-0 flex flex-col sm:flex-row items-center justify-center gap-1 px-1 sm:px-2 py-2 rounded-full text-[10px] sm:text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-slate-900 dark:bg-indigo-500 text-white shadow-md'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <tab.icon className={`w-4 h-4 ${isActive ? 'text-white' : ''}`} />
                <span className="truncate">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default GuruDashboard
