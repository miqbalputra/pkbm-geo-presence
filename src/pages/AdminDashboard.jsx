import { useState, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from '../components/admin/Sidebar'

const DashboardHome = lazy(() => import('../components/admin/DashboardHome'))
const DataGuru = lazy(() => import('../components/admin/DataGuru'))
const ArsipGuru = lazy(() => import('../components/admin/ArsipGuru'))
const EditPresensi = lazy(() => import('../components/admin/EditPresensi'))
const DownloadLaporan = lazy(() => import('../components/admin/DownloadLaporan'))
const LaporanPokjar = lazy(() => import('../components/admin/LaporanPokjar'))
const LogAktivitas = lazy(() => import('../components/admin/LogAktivitas'))
const HariLibur = lazy(() => import('../components/admin/HariLibur'))
const Pengaturan = lazy(() => import('../components/admin/Pengaturan'))
const JadwalPiket = lazy(() => import('../components/admin/JadwalPiket'))
const QRCodeGenerator = lazy(() => import('../components/admin/QRCodeGenerator'))
const ManualEntry = lazy(() => import('../components/admin/ManualEntry'))
const LokasiGeofence = lazy(() => import('../components/admin/LokasiGeofence'))
const LocationTracking = lazy(() => import('../components/admin/LocationTracking'))
const OverrideWeekend = lazy(() => import('../components/admin/OverrideWeekend'))
const OptionalWorkdays = lazy(() => import('../components/admin/OptionalWorkdays'))
const AIAgent = lazy(() => import('../components/admin/AIAgent'))

function SectionLoading() {
  return (
    <div className="min-h-[240px] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )
}

function AdminDashboard({ user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Restore path terakhir saat component mount (hanya sekali)
  useEffect(() => {
    if (!isInitialized) {
      const lastPath = localStorage.getItem('lastAdminPath')
      if (lastPath && lastPath !== location.pathname && lastPath.startsWith('/admin')) {
        navigate(lastPath, { replace: true })
      }
      setIsInitialized(true)
    }
  }, [isInitialized, location.pathname, navigate])

  // Simpan path terakhir ke localStorage setiap kali pindah halaman
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('lastAdminPath', location.pathname)
    }
  }, [location.pathname, isInitialized])

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        user={user}
        onLogout={onLogout}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm lg:hidden">
          <div className="px-4 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">Geo Presensi PKBM Tunas Ilmu</h1>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-600 hover:text-gray-800"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 lg:p-6">
          <Suspense fallback={<SectionLoading />}>
            <Routes>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/data-guru" element={<DataGuru />} />
              <Route path="/arsip-guru" element={<ArsipGuru />} />
              <Route path="/jadwal-piket" element={<JadwalPiket />} />
              <Route path="/edit-presensi" element={<EditPresensi user={user} />} />
              <Route path="/download-laporan" element={<DownloadLaporan />} />
              <Route path="/laporan-pokjar" element={<LaporanPokjar />} />
              <Route path="/hari-libur" element={<HariLibur user={user} />} />
              <Route path="/log-aktivitas" element={<LogAktivitas />} />
              <Route path="/pengaturan" element={<Pengaturan user={user} />} />
              <Route path="/qr-code" element={<QRCodeGenerator />} />
              <Route path="/manual-entry" element={<ManualEntry />} />
              <Route path="/lokasi-geofence" element={<LokasiGeofence user={user} />} />
              <Route path="/tracking-lokasi" element={<LocationTracking />} />
              <Route path="/override-weekend" element={<OverrideWeekend />} />
              <Route path="/hari-kerja-opsional" element={<OptionalWorkdays />} />
              <Route path="/ai-agent" element={<AIAgent />} />
              <Route path="*" element={<Navigate to="/admin" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default AdminDashboard
