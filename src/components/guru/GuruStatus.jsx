import { useState, useEffect, useCallback } from 'react'
import { UserCheck, UserX, FileText, AlertCircle, LogOut, RefreshCw, Clock } from 'lucide-react'
import { statusRekanAPI } from '../../services/api'

function GuruStatus() {
  const [statusList, setStatusList] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadStatus = useCallback(async () => {
    try {
      const response = await statusRekanAPI.getToday()
      setStatusList(response.data?.items || [])
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to load status:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    // Auto refresh setiap 30 detik
    const interval = setInterval(loadStatus, 30000)
    return () => clearInterval(interval)
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
          text: 'Hadir (Terlambat)',
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
          bg: 'bg-orange-50 dark:bg-orange-500/10',
          border: 'border-orange-200 dark:border-orange-500/20',
          badge: 'bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300',
          dot: 'bg-orange-500',
          iconColor: 'text-orange-600 dark:text-orange-400'
        }
      case 'sakit':
        return {
          icon: AlertCircle,
          text: 'Sakit',
          bg: 'bg-red-50 dark:bg-red-500/10',
          border: 'border-red-200 dark:border-red-500/20',
          badge: 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300',
          dot: 'bg-red-500',
          iconColor: 'text-red-600 dark:text-red-400'
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
          <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm">Memuat status rekan...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Status Rekan Guru</h2>
          {lastUpdated && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Diperbarui: {lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={() => { setLoading(true); loadStatus() }}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors text-sm font-semibold"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Ringkasan Statistik */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          { label: 'Hadir', count: summary.hadir, color: 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300' },
          { label: 'Terlambat', count: summary.terlambat, color: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300' },
          { label: 'Pulang', count: summary.pulang, color: 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300' },
          { label: 'Izin', count: summary.izin, color: 'bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300' },
          { label: 'Sakit', count: summary.sakit, color: 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300' },
          { label: 'Belum', count: summary.belum, color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
        ].map(item => (
          <div key={item.label} className={`${item.color} rounded-2xl p-3 text-center shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-transparent dark:border-slate-800`}>
            <p className="text-xl font-black">{item.count}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide leading-tight mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Daftar Guru */}
      {statusList.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-8 text-center text-slate-500 dark:text-slate-400">
          Tidak ada data rekan guru
        </div>
      ) : (
        <div className="space-y-2">
          {statusList.map((guru) => {
            const cfg = getStatusConfig(guru.statusFinal)
            const Icon = cfg.icon
            return (
              <div
                key={guru.id}
                className={`${cfg.bg} border ${cfg.border} rounded-2xl p-4 flex items-center gap-3 transition-colors`}
              >
                {/* Avatar inisial */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                  guru.statusFinal === 'belum' ? 'bg-slate-400 dark:bg-slate-600' :
                  guru.statusFinal === 'hadir' ? 'bg-green-500' :
                  guru.statusFinal === 'hadir_terlambat' ? 'bg-yellow-500' :
                  guru.statusFinal === 'sudah_pulang' ? 'bg-purple-500' :
                  guru.statusFinal === 'izin' ? 'bg-orange-500' :
                  guru.statusFinal === 'sakit' ? 'bg-red-500' : 'bg-blue-500'
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
                    <div className="flex items-center gap-3 mt-0.5">
                      {guru.jamMasuk && guru.jamMasuk !== '-' && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          ▶ Masuk: <span className="font-semibold text-slate-700 dark:text-slate-300">{guru.jamMasuk}</span>
                        </p>
                      )}
                      {guru.jamPulang && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          ◀ Pulang: <span className="font-semibold text-slate-700 dark:text-slate-300">{guru.jamPulang}</span>
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
      )}

      {/* Auto refresh info */}
      <p className="text-center text-xs text-slate-400 dark:text-slate-500 pb-2">
        🔄 Otomatis refresh setiap 30 detik
      </p>
    </div>
  )
}

export default GuruStatus
