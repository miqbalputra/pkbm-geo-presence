import { Notice } from '../ui/page'
import { useState, useEffect, useCallback, useRef } from 'react'
import { UserCheck, UserX, FileText, AlertCircle, LogIn, LogOut, RefreshCw, Clock, Users } from 'lucide-react'
import { statusRekanAPI } from '../../services/api'

function GuruStatus() {
  const requestRef = useRef(0)
  const [loadError, setLoadError] = useState('')
  const [statusList, setStatusList] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadStatus = useCallback(async () => {
    const request = ++requestRef.current
    setLoadError('')
    try {
      const response = await statusRekanAPI.getToday()
      if (request !== requestRef.current) return
      setStatusList(response.data?.items || [])
      setLastUpdated(new Date())
    } catch (error) {
      if (request !== requestRef.current) return
      setLoadError(error.message || 'Status rekan belum dapat dimuat.')
      console.error('Failed to load status:', error)
    } finally {
      if (request !== requestRef.current) return
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    // Auto refresh setiap 30 detik
    const interval = setInterval(loadStatus, 30000)
    return () => { clearInterval(interval); requestRef.current++ }
  }, [loadStatus])

  const getStatusConfig = (statusFinal) => {
    switch (statusFinal) {
      case 'hadir':
        return {
          icon: UserCheck,
          text: 'Hadir',
          bg: 'bg-green-50 dark:bg-green-500/10',
          border: 'border-green-200 dark:border-green-500/20',
          badge: 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300',
          dot: 'bg-green-500',
          iconColor: 'text-green-600 dark:text-green-400'
        }
      case 'hadir_terlambat':
        return {
          icon: Clock,
          text: 'Hadir Terlambat',
          bg: 'bg-yellow-50 dark:bg-yellow-500/10',
          border: 'border-yellow-200 dark:border-yellow-500/20',
          badge: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300',
          dot: 'bg-yellow-500',
          iconColor: 'text-yellow-600 dark:text-yellow-400'
        }
      case 'hadir_izin_terlambat':
        return {
          icon: UserCheck,
          text: 'Izin Terlambat',
          bg: 'bg-blue-50 dark:bg-blue-500/10',
          border: 'border-blue-200 dark:border-blue-500/20',
          badge: 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300',
          dot: 'bg-blue-500',
          iconColor: 'text-blue-600 dark:text-blue-400'
        }
      case 'sudah_pulang':
        return {
          icon: LogOut,
          text: 'Sudah Pulang',
          bg: 'bg-purple-50 dark:bg-purple-500/10',
          border: 'border-purple-200 dark:border-purple-500/20',
          badge: 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300',
          dot: 'bg-purple-500',
          iconColor: 'text-purple-600 dark:text-purple-400'
        }
      case 'izin':
        return {
          icon: FileText,
          text: 'Izin',
          bg: 'bg-blue-50 dark:bg-blue-500/10',
          border: 'border-blue-200 dark:border-blue-500/20',
          badge: 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300',
          dot: 'bg-blue-500',
          iconColor: 'text-blue-600 dark:text-blue-400'
        }
      case 'sakit':
        return {
          icon: AlertCircle,
          text: 'Sakit',
          bg: 'bg-rose-50 dark:bg-rose-500/10',
          border: 'border-rose-200 dark:border-rose-500/20',
          badge: 'bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300',
          dot: 'bg-rose-500',
          iconColor: 'text-rose-600 dark:text-rose-400'
        }
      default:
        return {
          icon: UserX,
          text: 'Belum Absen',
          bg: 'bg-slate-50 dark:bg-slate-800/60',
          border: 'border-slate-200 dark:border-slate-700',
          badge: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
          dot: 'bg-slate-400 dark:bg-slate-500',
          iconColor: 'text-slate-400 dark:text-slate-400'
        }
    }
  }

  // Ringkasan jumlah per status
  const summary = {
    hadir: statusList.filter(g => g.statusFinal === 'hadir').length,
    terlambat: statusList.filter(g => g.statusFinal === 'hadir_terlambat').length,
    pulang: statusList.filter(g => g.statusFinal === 'sudah_pulang').length,
    izin: statusList.filter(g => g.statusFinal === 'izin').length,
    sakit: statusList.filter(g => g.statusFinal === 'sakit').length,
    belum: statusList.filter(g => g.statusFinal === 'belum').length,
  }

  if (loadError) return <Notice onRetry={loadStatus}>{loadError}</Notice>

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" aria-live="polite" aria-label="Memuat status rekan guru">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
          <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm">Memuat status rekan...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-2">
      {/* Header */}
      <section className="guru-surface p-5 sm:p-6" aria-labelledby="rekan-status-title">
        <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-normal text-blue-600 dark:text-blue-400">Kehadiran hari ini</p>
          <h2 id="rekan-status-title" className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">Status Rekan Guru</h2>
          {lastUpdated && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500" aria-live="polite">
              Terakhir diperbarui {lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setRefreshing(true); loadStatus() }}
          disabled={refreshing}
          aria-label="Perbarui status rekan guru"
          className="flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 dark:focus-visible:ring-offset-slate-900"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshing ? 'Memuat...' : 'Perbarui'}
        </button>
        </div>
      </section>

      {/* Ringkasan Statistik */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6" aria-label="Ringkasan status rekan guru">
        {[
          { label: 'Hadir', count: summary.hadir, color: 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300' },
          { label: 'Terlambat', count: summary.terlambat, color: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300' },
          { label: 'Pulang', count: summary.pulang, color: 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300' },
          { label: 'Izin', count: summary.izin, color: 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300' },
          { label: 'Sakit', count: summary.sakit, color: 'bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300' },
          { label: 'Belum', count: summary.belum, color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
        ].map(item => (
          <div key={item.label} className={`${item.color} rounded-xl border border-transparent p-3.5 text-center dark:border-slate-800`}>
            <p className="text-2xl font-black tracking-tight">{item.count}</p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide leading-tight">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Daftar Guru */}
      {statusList.length === 0 ? (
        <div className="guru-surface p-10 text-center text-slate-500 dark:text-slate-400">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"><Users className="h-6 w-6" aria-hidden="true" /></span>
          <p className="mt-4 text-sm font-semibold">Tidak ada data rekan guru</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Coba perbarui data beberapa saat lagi.</p>
        </div>
      ) : (
        <section className="guru-surface overflow-hidden" aria-label="Daftar status rekan guru">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Daftar kehadiran</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{statusList.length} rekan terpantau hari ini</p>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" title="Data diperbarui otomatis" />
          </div>
          <div className="space-y-2 p-3 sm:p-4">
          {statusList.map((guru) => {
            const cfg = getStatusConfig(guru.statusFinal)
            const Icon = cfg.icon
            const lateMinutes = Number(guru.lateMinutes)
            const hasLateMinutes = Number.isFinite(lateMinutes) && lateMinutes > 0
            return (
              <div
                key={guru.id}
                className={`${cfg.bg} border ${cfg.border} flex items-center gap-3 rounded-xl p-3.5 transition-colors sm:p-4`}
              >
                {/* Avatar inisial */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                  guru.statusFinal === 'belum' ? 'bg-slate-400 dark:bg-slate-600' :
                  guru.statusFinal === 'hadir' ? 'bg-green-500' :
                  guru.statusFinal === 'hadir_terlambat' ? 'bg-yellow-500' :
                  guru.statusFinal === 'sudah_pulang' ? 'bg-purple-500' :
                  guru.statusFinal === 'izin' ? 'bg-blue-500' :
                  guru.statusFinal === 'sakit' ? 'bg-rose-500' : 'bg-blue-500'
                }`}>
                  {guru.nama?.charAt(0)?.toUpperCase() || '?'}
                </div>

                {/* Info guru */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{guru.nama}</p>
                  {guru.jabatan && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan}
                    </p>
                  )}
                  {/* Tampilkan jam masuk / pulang */}
                  {guru.statusFinal !== 'belum' && guru.statusFinal !== 'izin' && guru.statusFinal !== 'sakit' && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {guru.jamMasuk && guru.jamMasuk !== '-' && (
                        <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <LogIn className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Masuk: <span className="font-semibold text-slate-700 dark:text-slate-300">{guru.jamMasuk}</span>
                        </p>
                      )}
                      {guru.jamPulang && (
                        <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <LogOut className="h-3 w-3 text-violet-600 dark:text-violet-400" aria-hidden="true" /> Pulang: <span className="font-semibold text-slate-700 dark:text-slate-300">{guru.jamPulang}</span>
                        </p>
                      )}
                      {hasLateMinutes && (
                        <p className="flex items-center gap-1 whitespace-nowrap text-xs text-amber-700 dark:text-amber-300">
                          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" /> Terlambat: <span className="font-semibold whitespace-nowrap">{lateMinutes} menit</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Badge status */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${cfg.badge} shrink-0`}>
                  <Icon className={`w-3.5 h-3.5 ${cfg.iconColor}`} />
                  <span className="text-xs font-bold whitespace-nowrap">{cfg.text}</span>
                </div>
              </div>
            )
          })}
          </div>
        </section>
      )}

      {/* Auto refresh info */}
      <p className="flex items-center justify-center gap-2 pb-2 text-center text-xs text-slate-400 dark:text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" /> Diperbarui otomatis setiap 30 detik
      </p>
    </div>
  )
}

export default GuruStatus
