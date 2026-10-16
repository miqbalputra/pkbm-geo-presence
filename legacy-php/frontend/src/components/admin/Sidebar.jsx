import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Edit, Activity, Download, Calendar, Settings, CalendarCheck, LogOut, X, QrCode, UserPlus, Map, MapPin, CalendarX, CalendarPlus, Archive, Bot } from 'lucide-react'

function Sidebar({ user, onLogout, isOpen, setIsOpen }) {
  const menuItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/data-guru', icon: Users, label: 'Data Guru' },
    { path: '/admin/arsip-guru', icon: Archive, label: 'Arsip Guru', isNew: true },
    { path: '/admin/jadwal-piket', icon: CalendarCheck, label: 'Rotasi Piket' },
    { path: '/admin/edit-presensi', icon: Edit, label: 'Edit Presensi' },
    { path: '/admin/download-laporan', icon: Download, label: 'Download Laporan' },
    { path: '/admin/laporan-pokjar', icon: Download, label: 'Laporan Pokjar', isNew: true },
    { path: '/admin/hari-libur', icon: Calendar, label: 'Hari Libur' },
    { path: '/admin/override-weekend', icon: CalendarX, label: 'Override Weekend', isNew: true },
    { path: '/admin/hari-kerja-opsional', icon: CalendarPlus, label: 'Hari Kerja Opsional', isNew: true },
    { path: '/admin/log-aktivitas', icon: Activity, label: 'Log Aktivitas' },
    { path: '/admin/lokasi-geofence', icon: Map, label: 'Lokasi & Geofence', isNew: true },
    { path: '/admin/tracking-lokasi', icon: MapPin, label: 'Tracking Lokasi', isNew: true },
    { path: '/admin/qr-code', icon: QrCode, label: 'QR Code Presensi' },
    { path: '/admin/manual-entry', icon: UserPlus, label: 'Presensi Manual', isNew: true },
    { path: '/admin/pengaturan', icon: Settings, label: 'Pengaturan' },
    { path: '/admin/ai-agent', icon: Bot, label: 'AI Agent' }
  ]

  return (
    <>
      {/* Overlay untuk mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-64 bg-blue-900 text-white transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col h-screen
      `}>
        {/* Header - Fixed */}
        <div className="flex-shrink-0 p-6 border-b border-blue-800 bg-blue-900">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Geo Presensi PKBM Tunas Ilmu</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="lg:hidden text-white hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-blue-300 text-sm mt-2">{user.nama}</p>
          <p className="text-blue-400 text-xs capitalize">{user.role.replace('_', ' ')}</p>
        </div>

        {/* Menu - Scrollable dengan background biru */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2 bg-blue-900">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) => `
                flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors
                ${isActive
                  ? 'bg-blue-800 text-white'
                  : 'text-blue-100 hover:bg-blue-800 hover:text-white'
                }
              `}
            >
              <item.icon className="w-5 h-5" />
              <span className="flex-1">{item.label}</span>
              {item.isNew && (
                <span className="px-2 py-0.5 text-xs font-bold bg-green-500 text-white rounded-full">
                  New
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Logout - Fixed at Bottom */}
        <div className="flex-shrink-0 p-4 border-t border-blue-800 bg-blue-900">
          <button
            onClick={onLogout}
            className="flex items-center space-x-3 px-4 py-3 rounded-lg w-full text-white hover:bg-red-600 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  )
}

export default Sidebar
