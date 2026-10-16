import { useCallback, useEffect, useState, Suspense, lazy } from 'react'
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  History,
  Home,
  LogOut,
  Moon,
  School,
  Sun,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react'
import { useLocation, useNavigate } from '../router'
import { useTheme, readPreference as readStorage, savePreference } from '../hooks/useTheme'
import GuruHome from '../components/guru/GuruHome'
import GuruAkun from '../components/guru/GuruAkun'
import GuruMonthlyConfirmation from '../components/guru/GuruMonthlyConfirmation'
import GuruGmailReminder from '../components/guru/GuruGmailReminder'

const GuruRiwayat = lazy(() => import('../components/guru/GuruRiwayat'))
const GuruStatus = lazy(() => import('../components/guru/GuruStatus'))
const GuruPeringkat = lazy(() => import('../components/guru/GuruPeringkat'))
const GuruStatistik = lazy(() => import('../components/guru/GuruStatistik'))
const GuruAttendanceRevisions = lazy(() => import('../components/guru/GuruAttendanceRevisions'))

function TabLoading() {
  return (
    <div className="flex min-h-[280px] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400" />
        Memuat halaman...
      </div>
    </div>
  )
}

function GuruDashboard({ user, onLogout }) {
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const activeTab = pathname.split('/')[2] || 'home'
  const setActiveTab = (tab: string) => navigate(tab === 'home' ? '/guru' : '/guru/' + tab)
  // Start with descriptive labels visible on desktop. The earlier icon-only
  // preference is reset once because it made the menu hard to scan.
  const [sidebarOpen, setSidebarOpen] = useState(() => readStorage('guru-sidebar-expanded-v2', '1') === '1')
  const [monthlyDialogState, setMonthlyDialogState] = useState({ open: false, ready: false })
  const [revisionDateToOpen, setRevisionDateToOpen] = useState<string | null>(null)
  const [gmailComplete, setGmailComplete] = useState(false)
  const handleMonthlyDialogStateChange = useCallback((open: boolean, ready: boolean) => {
    setMonthlyDialogState({ open, ready })
  }, [])
  const handleGmailStatusChange = useCallback((complete: boolean) => {
    setGmailComplete(complete)
  }, [])
  const openRevisionForDate = useCallback((date: string) => {
    setRevisionDateToOpen(date)
    navigate('/guru/revisi')
  }, [navigate])
  const clearRevisionDate = useCallback(() => setRevisionDateToOpen(null), [])

  const tabs = [
    { id: 'home', label: 'Beranda', icon: Home },
    { id: 'riwayat', label: 'Riwayat', icon: History },
    { id: 'revisi', label: 'Revisi Presensi', icon: ClipboardCheck },
    { id: 'status', label: 'Rekan', icon: Users },
    { id: 'peringkat', label: 'Peringkat', icon: Trophy },
    { id: 'statistik', label: 'Statistik', icon: BarChart3 },
    { id: 'akun', label: 'Akun', icon: UserCog },
  ]

  const firstName = (user?.nama || 'Guru').split(' ')[0]
  const avatarInitial = (user?.nama || 'G').charAt(0).toUpperCase()
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || 'Beranda'
  const todayLabel = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  useEffect(() => {
    if (!['home', 'riwayat', 'revisi', 'status', 'peringkat', 'statistik', 'akun'].includes(activeTab)) navigate('/guru', { replace: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [activeTab, navigate])

  useEffect(() => {
    savePreference('guru-sidebar-expanded-v2', sidebarOpen ? '1' : '0')
  }, [sidebarOpen])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setSidebarOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const renderNavItem = (tab: typeof tabs[number]) => {
    const isActive = activeTab === tab.id
    return (
      <button
        type="button"
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        aria-current={isActive ? 'page' : undefined}
        title={!sidebarOpen ? tab.label : undefined}
        className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        } ${!sidebarOpen ? 'justify-center px-2' : ''}`}
      >
        <tab.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-accent-foreground' : 'text-slate-400'}`} aria-hidden="true" />
        <span className={sidebarOpen ? 'truncate' : 'sr-only'}>{tab.label}</span>
      </button>
    )
  }

  return (
    <div className="academy-dashboard guru-dashboard min-h-screen text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a href="#guru-main-content" className="guru-skip-link">Lewati ke konten utama</a>

      <aside className={`academy-sidebar fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-border transition-[width] duration-200 lg:flex ${sidebarOpen ? 'w-64' : 'w-[4.5rem]'}`} aria-label="Navigasi guru">
        <div className={`flex h-16 items-center border-b border-border ${sidebarOpen ? 'justify-between px-4' : 'justify-center'}`}>
          <button type="button" onClick={() => setActiveTab('home')} className={`flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${!sidebarOpen ? 'justify-center' : ''}`} title="Beranda">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/40"><School className="h-5 w-5" aria-hidden="true" /></span>
            <span className={sidebarOpen ? 'min-w-0' : 'sr-only'}>
              <span className="block text-xs font-bold uppercase tracking-normal text-primary">Portal Guru</span>
              <span className="block truncate text-sm font-semibold text-foreground">PKBM Tunas Ilmu</span>
            </span>
          </button>
          {sidebarOpen && (
            <button type="button" onClick={() => setSidebarOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" aria-label="Ciutkan sidebar" title="Ciutkan sidebar (Ctrl+B)">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-between p-3">
          <div className="space-y-6">
            <div>
              <p className={`mb-2 px-3 text-xs font-bold uppercase tracking-normal text-slate-500 ${!sidebarOpen ? 'sr-only' : ''}`}>Presensi</p>
              <div className="space-y-1">{tabs.slice(0, 6).map(renderNavItem)}</div>
            </div>
            <div>
              <p className={`mb-2 px-3 text-xs font-bold uppercase tracking-normal text-slate-500 ${!sidebarOpen ? 'sr-only' : ''}`}>Akun</p>
              <div className="space-y-1">{tabs.slice(6).map(renderNavItem)}</div>
            </div>
          </div>
          {!sidebarOpen && (
            <button type="button" onClick={() => setSidebarOpen(true)} className="flex h-10 w-full items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" aria-label="Lebarkan sidebar" title="Lebarkan sidebar (Ctrl+B)">
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className={`border-t border-border p-3 ${!sidebarOpen ? 'flex justify-center' : ''}`}>
          <div className={`flex items-center gap-3 ${!sidebarOpen ? 'justify-center' : ''}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{avatarInitial}</span>
            <div className={sidebarOpen ? 'min-w-0' : 'sr-only'}>
              <p className="truncate text-xs font-semibold text-foreground">{user?.nama || 'Guru'}</p>
              <p className="truncate text-xs text-slate-400">{user?.username || 'Akun guru'}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className={`min-w-0 transition-[padding] duration-200 ${sidebarOpen ? 'lg:pl-64' : 'lg:pl-[4.5rem]'}`}>
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{activeTabLabel}</p>
                <h1 className="truncate text-base font-bold text-slate-900 dark:text-slate-100 sm:text-lg">Presensi PKBM</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 sm:flex">
                <CalendarDays className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" aria-hidden="true" />
                <span>{todayLabel}</span>
              </div>
              <button type="button" onClick={toggle} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-amber-400" title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'} aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button type="button" onClick={onLogout} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-slate-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-400" title="Keluar" aria-label="Keluar">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main id="guru-main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 pb-28 pt-4 outline-none sm:px-6 lg:px-8 lg:pb-12">
          <GuruMonthlyConfirmation onDialogStateChange={handleMonthlyDialogStateChange} onRequestRevision={openRevisionForDate} />
          {!user?.pokjar && <GuruGmailReminder user={user} activeTab={activeTab} blocked={!monthlyDialogState.ready || monthlyDialogState.open} onGmailStatusChange={handleGmailStatusChange} />}
          <div key={activeTab} className="animate-fade-in">
            {activeTab === 'home' && <GuruHome user={user} onChangeTab={setActiveTab} gmailComplete={gmailComplete} />}
            {activeTab === 'akun' && <GuruAkun user={user} onGmailStatusChange={handleGmailStatusChange} />}
            {activeTab !== 'home' && activeTab !== 'akun' && (
              <Suspense fallback={<TabLoading />}>
                {activeTab === 'riwayat' && <GuruRiwayat user={user} />}
                {activeTab === 'revisi' && <GuruAttendanceRevisions user={user} requestDate={revisionDateToOpen} onRequestDateHandled={clearRevisionDate} />}
                {activeTab === 'status' && <GuruStatus />}
                {activeTab === 'peringkat' && <GuruPeringkat user={user} />}
                {activeTab === 'statistik' && <GuruStatistik user={user} />}
              </Suspense>
            )}
          </div>
        </main>

        <nav aria-label="Navigasi dashboard guru" className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
          <div className="border-t border-slate-200 bg-white px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 dark:border-slate-800 dark:bg-slate-950">
            <div className="mx-auto grid max-w-md grid-cols-7 gap-0.5">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} aria-current={isActive ? 'page' : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0 py-1 text-[10px] font-semibold leading-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:text-xs ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'}`}>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${isActive ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400' : ''}`}><tab.icon className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="max-w-full truncate text-center">{tab.id === 'revisi' ? 'Revisi' : tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}

export default GuruDashboard
