import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bell, Check, CheckCircle2, Info, X } from 'lucide-react'
import { adminSummaryAPI } from '../../services/api'

type NotificationItem = {
  id: string
  title: string
  description: string
  tone: 'info' | 'warning' | 'danger' | 'success'
}

const READ_NOTIFICATIONS_KEY = 'gq-admin-read-notifications'

function readNotificationIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(READ_NOTIFICATIONS_KEY) || '[]')
    return new Set<string>(Array.isArray(stored) ? stored.filter((value) => typeof value === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function toneClasses(tone: NotificationItem['tone']) {
  switch (tone) {
    case 'danger':
      return { icon: AlertTriangle, iconClass: 'bg-rose-100 text-rose-600', marker: 'bg-rose-500' }
    case 'warning':
      return { icon: AlertTriangle, iconClass: 'bg-amber-100 text-amber-600', marker: 'bg-amber-500' }
    case 'success':
      return { icon: CheckCircle2, iconClass: 'bg-emerald-100 text-emerald-600', marker: 'bg-emerald-500' }
    default:
      return { icon: Info, iconClass: 'bg-blue-100 text-blue-600', marker: 'bg-blue-500' }
  }
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(() => readNotificationIds())
  const containerRef = useRef<HTMLDivElement>(null)

  const loadNotifications = async () => {
    try {
      setLoading(true)
      const response = await adminSummaryAPI.getDashboard('today')
      const data = response.data || {}
      const stats = data.stats || {}
      const missingCount = Array.isArray(data.belumPresensiHariIni) ? data.belumPresensiHariIni.length : 0
      const totalGuru = Number(data.totalGuru || 0)
      const nextItems: NotificationItem[] = []

      if (totalGuru === 0) {
        nextItems.push({
          id: 'no-teachers',
          title: 'Belum ada data guru',
          description: 'Tambahkan data guru agar pemantauan presensi dapat berjalan.',
          tone: 'info',
        })
      } else if (missingCount > 0) {
        nextItems.push({
          id: `missing-${missingCount}`,
          title: 'Presensi belum lengkap',
          description: `${missingCount} guru belum melakukan presensi hari ini.`,
          tone: 'warning',
        })
      }

      const alfaCount = Number(stats.alfa || 0)
      if (alfaCount > 0) {
        nextItems.push({
          id: `alfa-${alfaCount}`,
          title: 'Ada status alfa',
          description: `${alfaCount} guru tercatat alfa hari ini.`,
          tone: 'danger',
        })
      }

      const izinCount = Number(stats.izin || 0)
      const sakitCount = Number(stats.sakit || 0)
      if (izinCount + sakitCount > 0) {
        nextItems.push({
          id: `leave-${izinCount}-${sakitCount}`,
          title: 'Status izin/sakit hari ini',
          description: `${izinCount} izin dan ${sakitCount} sakit tercatat hari ini.`,
          tone: 'info',
        })
      }

      if (nextItems.length === 0) {
        nextItems.push({
          id: 'all-clear',
          title: 'Presensi terpantau',
          description: 'Tidak ada notifikasi perhatian untuk hari ini.',
          tone: 'success',
        })
      }

      setItems(nextItems)
    } catch (error) {
      console.warn('Gagal memuat notifikasi admin:', error)
      setItems([{
        id: 'notification-error',
        title: 'Notifikasi belum tersedia',
        description: 'Data notifikasi belum dapat dimuat. Coba lagi sebentar lagi.',
        tone: 'warning',
      }])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
    const refreshTimer = window.setInterval(loadNotifications, 60_000)
    return () => window.clearInterval(refreshTimer)
  }, [])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const unreadCount = useMemo(
    () => items.filter((item) => !readIds.has(item.id)).length,
    [items, readIds],
  )

  const markAllRead = () => {
    const next = new Set([...readIds, ...items.map((item) => item.id)])
    setReadIds(next)
    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify([...next]))
  }

  const markRead = (id: string) => {
    const next = new Set(readIds)
    next.add(id)
    setReadIds(next)
    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify([...next]))
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        aria-label="Notifikasi"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-xs font-bold leading-4 text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Daftar notifikasi"
          className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Notifikasi</h2>
              <p className="text-xs text-slate-400">Ringkasan presensi hari ini</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={markAllRead}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                title="Tandai semua sudah dibaca"
                aria-label="Tandai semua sudah dibaca"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Tutup notifikasi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {loading && items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">Memuat notifikasi...</div>
            ) : items.map((item) => {
              const tone = toneClasses(item.tone)
              const Icon = tone.icon
              const isUnread = !readIds.has(item.id)
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => markRead(item.id)}
                  className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-slate-50 ${isUnread ? 'bg-blue-50/50' : ''}`}
                >
                  <span className={`mt-0.5 rounded-lg p-2 ${tone.iconClass}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      {item.title}
                      {isUnread && <span className={`h-1.5 w-1.5 rounded-full ${tone.marker}`} />}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
