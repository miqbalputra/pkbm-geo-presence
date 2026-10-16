import { useState, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from '../router'
import { CalendarDays, ChevronRight, Menu, Moon, Sun } from 'lucide-react'
import Sidebar from '../components/admin/Sidebar'
import NotificationBell from '../components/admin/NotificationBell'
import { useTheme, readPreference as readStorage, savePreference } from '../hooks/useTheme'

const Analitik = lazy(() => import('../components/admin/Analitik'))
const DashboardHome = lazy(() => import('../components/admin/DashboardHome'))
const DataGuru = lazy(() => import('../components/admin/DataGuru'))
const ArsipGuru = lazy(() => import('../components/admin/ArsipGuru'))
const EditPresensi = lazy(() => import('../components/admin/EditPresensi'))
const DownloadLaporan = lazy(() => import('../components/admin/DownloadLaporan'))
const LogAktivitas = lazy(() => import('../components/admin/LogAktivitas'))
const HariLibur = lazy(() => import('../components/admin/HariLibur'))
const Pengaturan = lazy(() => import('../components/admin/Pengaturan'))
const JadwalPiket = lazy(() => import('../components/admin/JadwalPiket'))
const RotasiPiket = lazy(() => import('../components/admin/RotasiPiket'))
const LaporanPokjar = lazy(() => import('../components/admin/LaporanPokjar'))
const QRCodeGenerator = lazy(() => import('../components/admin/QRCodeGenerator'))
const ManualEntry = lazy(() => import('../components/admin/ManualEntry'))
const LokasiGeofence = lazy(() => import('../components/admin/LokasiGeofence'))
const LocationTracking = lazy(() => import('../components/admin/LocationTracking'))
const OverrideWeekend = lazy(() => import('../components/admin/OverrideWeekend'))
const OptionalWorkdays = lazy(() => import('../components/admin/OptionalWorkdays'))
const AIAgent = lazy(() => import('../components/admin/AIAgent'))
const BackupPemulihan = lazy(() => import('../components/admin/BackupPemulihan'))

function SectionLoading() {
  return (
    <div className="flex min-h-[280px] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 motion-reduce:animate-none" />
        Memuat halaman...
      </div>
    </div>
  )
}

function AdminDashboard({ user, onLogout, installBanner }) {
  const { theme, toggle } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // V2 starts expanded so menu labels are visible by default. The previous
  // icon-only preference is intentionally not carried over.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStorage('admin-sidebar-collapsed-v2', '0') === '1')
  const location = useLocation()

  const sectionLabels = {
    '/admin': 'Dashboard',
    '/admin/analitik': 'Analitik',
    '/admin/data-guru': 'Data Guru',
    '/admin/arsip-guru': 'Arsip Guru',
    '/admin/jadwal-piket': 'Jadwal Piket',
    '/admin/rotasi-piket': 'Rotasi Piket Sabtu',
    '/admin/laporan-pokjar': 'Laporan Pokjar',
    '/admin/edit-presensi': 'Koreksi Presensi',
    '/admin/download-laporan': 'Laporan',
    '/admin/hari-libur': 'Hari Libur',
    '/admin/log-aktivitas': 'Log Aktivitas',
    '/admin/pengaturan': 'Pengaturan',
    '/admin/qr-code': 'QR Code Presensi',
    '/admin/manual-entry': 'Presensi Manual',
    '/admin/lokasi-geofence': 'Lokasi & Geofence',
    '/admin/tracking-lokasi': 'Pemantauan Lokasi',
    '/admin/override-weekend': 'Jadwal Akhir Pekan',
    '/admin/hari-kerja-opsional': 'Hari Kerja Opsional',
    '/admin/ai-agent': 'AI Agent',
    '/admin/backup': 'Backup & Pemulihan',
  }
  const activeSection = sectionLabels[location.pathname] || 'Manajemen'
  const firstName = (user?.nama || 'Admin').split(' ')[0]
  const todayLabel = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  useEffect(() => {
    savePreference('admin-sidebar-collapsed-v2', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setSidebarCollapsed((collapsed) => !collapsed)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  return (
    <div className="academy-dashboard flex h-dvh text-slate-800">
      <a href="#admin-main-content" className="guru-skip-link">Lewati ke konten utama</a>
      <Sidebar
        user={user}
        onLogout={onLogout}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-200 ${sidebarCollapsed ? 'lg:ml-0' : ''}`}>
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:hidden" aria-label="Buka menu">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="hidden items-center gap-2 text-sm text-slate-400 sm:flex">
                <span>Admin</span><ChevronRight className="h-4 w-4" aria-hidden="true" /><span className="font-semibold text-slate-700">{activeSection}</span>
              </div>
              <div className="min-w-0 sm:hidden">
                <p className="truncate text-xs font-semibold text-slate-500">{activeSection}</p>
                <h1 className="truncate text-sm font-bold text-slate-900">Presensi PKBM</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 md:flex">
                <CalendarDays className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                <span>{todayLabel}</span>
              </div>
              <NotificationBell />
              <button type="button" onClick={toggle} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'} aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <div className="hidden min-w-0 sm:block">
                <p className="max-w-32 truncate text-xs font-semibold text-slate-800">{user?.nama || firstName}</p>
                <p className="text-xs text-slate-400">Administrator</p>
              </div>
            </div>
          </div>
        </header>

        <main id="admin-main-content" tabIndex={-1} key={location.pathname} className="flex-1 overflow-x-hidden overflow-y-auto p-4 outline-none sm:p-6 lg:p-8">
          {location.pathname === '/admin/pengaturan' && installBanner}
          <div className="mx-auto w-full max-w-[1600px]">
            <Suspense fallback={<SectionLoading />}>
              <Routes>
                <Route path="/" element={<DashboardHome />} />
                <Route path="/analitik" element={<Analitik />} />
                <Route path="/data-guru" element={<DataGuru />} />
                <Route path="/arsip-guru" element={<ArsipGuru />} />
                <Route path="/jadwal-piket" element={<JadwalPiket />} />
                <Route path="/rotasi-piket" element={<RotasiPiket />} />
                <Route path="/laporan-pokjar" element={<LaporanPokjar />} />
                <Route path="/edit-presensi" element={<EditPresensi user={user} />} />
                <Route path="/download-laporan" element={<DownloadLaporan />} />
                <Route path="/hari-libur" element={<HariLibur user={user} />} />
                <Route path="/log-aktivitas" element={<LogAktivitas />} />
                <Route path="/pengaturan" element={<Pengaturan />} />
                <Route path="/qr-code" element={<QRCodeGenerator />} />
                <Route path="/manual-entry" element={<ManualEntry />} />
                <Route path="/lokasi-geofence" element={<LokasiGeofence user={user} />} />
                <Route path="/tracking-lokasi" element={<LocationTracking />} />
                <Route path="/override-weekend" element={<OverrideWeekend />} />
                <Route path="/hari-kerja-opsional" element={<OptionalWorkdays />} />
                <Route path="/ai-agent" element={<AIAgent />} />
                <Route path="/backup" element={<BackupPemulihan />} />
                <Route path="*" element={<Navigate to="/admin" />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminDashboard
