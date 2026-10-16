import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { NavLink, useLocation } from '../../router'
import { attendanceRevisionAPI } from '../../services/api'
import { Activity, Archive, ArchiveRestore, BarChart3, Bot, Calendar, CalendarCheck, CalendarPlus, CalendarX, ChevronDown, ClipboardCheck, Download, Edit, LayoutDashboard, LogOut, Map, MapPin, PanelLeftClose, PanelLeftOpen, QrCode, School, Settings, UserPlus, Users, X, RotateCw } from 'lucide-react'

const groups = [
  { label: 'Utama', items: [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/download-laporan', icon: Download, label: 'Laporan' },
    { path: '/admin/laporan-pokjar', icon: School, label: 'Laporan Pokjar' },
    { path: '/admin/analitik', icon: BarChart3, label: 'Analitik' },
  ] },
  { label: 'Presensi', items: [
    { path: '/admin/edit-presensi', icon: Edit, label: 'Koreksi Presensi' },
    { path: '/admin/revisi-presensi', icon: ClipboardCheck, label: 'Pengajuan Revisi' },
    { path: '/admin/manual-entry', icon: UserPlus, label: 'Presensi Manual' },
    { path: '/admin/qr-code', icon: QrCode, label: 'QR Code' },
  ] },
  { label: 'Guru', items: [
    { path: '/admin/data-guru', icon: Users, label: 'Data Guru' },
    { path: '/admin/arsip-guru', icon: Archive, label: 'Arsip Guru' },
    { path: '/admin/jadwal-piket', icon: CalendarCheck, label: 'Jadwal Piket' },
    { path: '/admin/rotasi-piket', icon: RotateCw, label: 'Rotasi Piket Sabtu' },
  ] },
  { label: 'Operasional', items: [
    { path: '/admin/hari-libur', icon: Calendar, label: 'Hari Libur' },
    { path: '/admin/override-weekend', icon: CalendarX, label: 'Jadwal Akhir Pekan' },
    { path: '/admin/hari-kerja-opsional', icon: CalendarPlus, label: 'Hari Kerja Opsional' },
    { path: '/admin/lokasi-geofence', icon: Map, label: 'Lokasi Presensi' },
    { path: '/admin/tracking-lokasi', icon: MapPin, label: 'Pemantauan Lokasi' },
  ] },
  { label: 'Sistem', items: [
    { path: '/admin/pengaturan', icon: Settings, label: 'Pengaturan' },
    { path: '/admin/log-aktivitas', icon: Activity, label: 'Log Aktivitas' },
    { path: '/admin/backup', icon: ArchiveRestore, label: 'Backup & Pemulihan' },
    { path: '/admin/ai-agent', icon: Bot, label: 'AI Agent' },
  ] },
]

export default function Sidebar({ user, onLogout, isOpen, setIsOpen, collapsed, onToggleCollapse }) {
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState(['Utama', 'Presensi'])
  const [pendingRevisionCount, setPendingRevisionCount] = useState(0)

  useEffect(() => {
    let mounted = true
    const refreshPendingRevisions = async () => {
      try {
        const response = await attendanceRevisionAPI.getAll({ status: 'pending' })
        if (mounted) setPendingRevisionCount(Array.isArray(response.data) ? response.data.length : 0)
      } catch {
        // Keep the last known count if the request cannot be refreshed.
      }
    }
    void refreshPendingRevisions()
    const timer = window.setInterval(refreshPendingRevisions, 60_000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const current = groups.find((group) => group.items.some((item) => item.path === pathname))
    if (current) setExpanded((previous) => previous.includes(current.label) ? previous : [...previous, current.label])
    setIsOpen(false)
  }, [pathname, setIsOpen])

  const contents = (compact: boolean, mobile = false) => <>
    <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <NavLink to="/admin" end className="flex min-w-0 items-center gap-3 rounded-lg" title="Dashboard">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><School className="h-5 w-5" aria-hidden="true" /></span>
        {!compact && <span className="min-w-0"><span className="block text-sm font-semibold text-foreground">Presensi PKBM</span><span className="block text-xs text-muted-foreground">PKBM Tunas Ilmu</span></span>}
      </NavLink>
      {mobile ? <Dialog.Close className="ui-icon-button" aria-label="Tutup menu"><X className="h-5 w-5" /></Dialog.Close> : !compact && <button type="button" className="ui-icon-button" onClick={onToggleCollapse} aria-label="Ciutkan sidebar"><PanelLeftClose className="h-4 w-4" /></button>}
    </div>
    <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-label="Menu utama">
      {groups.map((group) => {
        const open = expanded.includes(group.label)
        const id = `${mobile ? 'mobile' : 'desktop'}-menu-${group.label}`
        return <div key={group.label}>
          {!compact && <button type="button" className="flex min-h-11 w-full items-center justify-between px-3 text-xs font-semibold text-muted-foreground" aria-expanded={open} aria-controls={id} onClick={() => setExpanded((previous) => open ? previous.filter((label) => label !== group.label) : [...previous, group.label])}>{group.label}<ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" /></button>}
          <div id={id} hidden={!compact && !open} className="space-y-1">
            {group.items.map((item) => {
              const showRevisionCount = item.path === '/admin/revisi-presensi' && pendingRevisionCount > 0
              const compactTitle = showRevisionCount ? `${item.label} (${pendingRevisionCount} menunggu)` : item.label
              return <NavLink key={item.path} to={item.path} end={item.path === '/admin'} title={compact ? compactTitle : undefined} aria-label={compact ? compactTitle : undefined} className={({ isActive }) => `sidebar-link ${compact ? 'justify-center px-0' : ''} ${isActive ? 'is-active' : ''}`}>
                <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span className={compact ? 'sr-only' : 'truncate'}>{item.label}</span>
                {!compact && showRevisionCount && <span className="ml-auto min-w-5 rounded-full bg-amber-100 px-1.5 text-center text-[10px] font-bold leading-5 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">{pendingRevisionCount > 99 ? '99+' : pendingRevisionCount}</span>}
              </NavLink>
            })}
          </div>
        </div>
      })}
    </nav>
    <div className="shrink-0 space-y-2 border-t border-border p-3">
      {compact && <button type="button" className="ui-icon-button w-full" onClick={onToggleCollapse} aria-label="Lebarkan sidebar"><PanelLeftOpen className="h-5 w-5" /></button>}
      {!compact && <div className="flex items-center gap-3 px-2 py-1"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{(user?.nama || 'A').slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.nama || 'Admin'}</p><p className="text-xs text-muted-foreground">{user?.role === 'kepala_sekolah' ? 'Kepala sekolah' : 'Administrator'}</p></div></div>}
      <button type="button" className={`sidebar-link w-full ${compact ? 'justify-center' : ''}`} onClick={onLogout} aria-label="Keluar"><LogOut className="h-[18px] w-[18px]" aria-hidden="true" />{!compact && 'Keluar'}</button>
    </div>
  </>

  return <>
    <aside className={`academy-sidebar hidden h-dvh shrink-0 flex-col border-r border-border lg:flex ${collapsed ? 'w-20' : 'w-64'}`} aria-label="Navigasi admin">{contents(collapsed)}</aside>
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Portal><Dialog.Overlay className="ui-dialog-overlay lg:hidden" /><Dialog.Content className="academy-sidebar fixed inset-y-0 left-0 z-[75] flex w-[min(20rem,90vw)] flex-col shadow-xl lg:hidden">
        <Dialog.Title className="sr-only">Menu admin</Dialog.Title><Dialog.Description className="sr-only">Pilih halaman yang ingin dibuka.</Dialog.Description>{contents(false, true)}
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </>
}
