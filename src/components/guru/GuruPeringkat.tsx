import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trophy } from 'lucide-react'
import { guruRankingAPI } from '../../services/api'
import { EmptyState, Notice, PageLoading } from '../ui/page'

type RankingItem = {
  rank: number
  id: number | string
  nama: string
  jabatan?: string
  skor: number
  persentaseKehadiran: number
  persentaseTepatWaktu: number
  persentasePulang: number
  hadir: number
  tepatWaktu: number
  terlambat: number
  checkoutLengkap: number
  lupaCheckout: number
  lemburMenit: number
  bonusLembur: number
  totalHariKerja: number
}

type RankingResponse = {
  period: {
    label: string
    startDate: string
    endDate: string
  }
  items: RankingItem[]
  myRank: RankingItem | null
}

const podiumStyles: Record<number, { card: string; rank: string; icon: string }> = {
  1: {
    card: 'border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10',
    rank: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    icon: 'text-amber-500 dark:text-amber-300',
  },
  2: {
    card: 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/70',
    rank: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    icon: 'text-slate-500 dark:text-slate-300',
  },
  3: {
    card: 'border-orange-200 bg-orange-50/70 dark:border-orange-500/30 dark:bg-orange-500/10',
    rank: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    icon: 'text-orange-600 dark:text-orange-300',
  },
}

function formatDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function formatPeriod(startValue?: string, endValue?: string) {
  if (!startValue || !endValue) return `${formatDate(startValue)} – ${formatDate(endValue)}`
  const start = new Date(`${startValue}T00:00:00`)
  const end = new Date(`${endValue}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${formatDate(startValue)} – ${formatDate(endValue)}`

  const monthYear = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(end)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${monthYear}`
  }

  const shortDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
  const endLabel = start.getFullYear() === end.getFullYear()
    ? `${shortDate.format(end)} ${end.getFullYear()}`
    : formatDate(endValue)
  return `${shortDate.format(start)} – ${endLabel}`
}

function formatScore(value?: number) {
  const score = Number(value)
  return Number.isFinite(score) ? score.toFixed(1) : '0.0'
}

function formatPercent(value?: number) {
  const percentage = Number(value)
  return Number.isFinite(percentage) ? `${percentage.toFixed(1)}%` : '0.0%'
}

function formatOvertimeBonus(value?: number) {
  const bonus = Number(value)
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number.isFinite(bonus) ? bonus : 0)
  return `+${formatted} poin`
}

function formatJabatan(value?: string) {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.filter(Boolean).join(', ')
  } catch {
    // Legacy records can contain a plain text jabatan.
  }
  return value
}

function GuruPeringkat({ user }) {
  const [data, setData] = useState<RankingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const loadRanking = useCallback(async () => {
    setError('')
    setRefreshing(true)
    try {
      const response = await guruRankingAPI.getMonthly()
      setData(response.data || null)
    } catch (loadError) {
      setError(loadError?.message || 'Peringkat guru belum dapat dimuat.')
      console.error('Failed to load guru ranking:', loadError)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadRanking()
  }, [loadRanking])

  if (loading) return <PageLoading />
  if (error) return <Notice onRetry={loadRanking}>{error}</Notice>

  const items = Array.isArray(data?.items) ? data.items : []
  const myRank = data?.myRank || null
  const myRankOutsideTopTen = myRank && myRank.rank > 10

  return (
    <div className="space-y-5 pb-2">
      <section className="guru-surface p-4 sm:p-6" aria-labelledby="guru-ranking-title">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-normal text-amber-600 dark:text-amber-400">Kedisiplinan presensi</p>
            <h2 id="guru-ranking-title" className="mt-1 whitespace-nowrap text-xl font-bold text-slate-800 dark:text-slate-100">Peringkat Bulan Ini</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatPeriod(data?.period?.startDate, data?.period?.endDate)}</p>
          </div>
          <button
            type="button"
            onClick={loadRanking}
            disabled={refreshing}
            aria-label="Perbarui peringkat guru"
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20 dark:focus-visible:ring-offset-slate-900"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {refreshing ? 'Memuat...' : 'Perbarui'}
          </button>
        </div>
      </section>

      {items.length === 0 ? (
        <section className="guru-surface">
          <EmptyState title="Belum ada data peringkat" description="Peringkat akan muncul setelah data presensi bulan ini tersedia." />
        </section>
      ) : (
        <section className="guru-surface overflow-hidden" aria-label="Top 10 peringkat kedisiplinan guru">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Top 10 Guru</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Hadir, tepat waktu, checkout, dan bonus lembur.</p>
          </div>
          <div className="space-y-2 p-3 sm:p-4">
            {items.map((item) => {
              const rank = Number(item.rank)
              const podium = podiumStyles[rank]
              const isCurrentUser = String(item.id) === String(user?.id)
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-colors sm:p-4 ${podium?.card || 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40'} ${isCurrentUser ? 'ring-2 ring-blue-500/60 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
                >
                  <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl font-black ${podium?.rank || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`} aria-label={`Peringkat ${rank}`}>
                    {podium ? <><Trophy className={`h-4 w-4 ${podium.icon}`} aria-hidden="true" /><span className="text-[10px] leading-none">#{rank}</span></> : rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{item.nama}</p>
                      {isCurrentUser && <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Anda</span>}
                    </div>
                    {item.jabatan && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{formatJabatan(item.jabatan)}</p>}
                    <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400 sm:grid-cols-4 sm:gap-1.5">
                      <span className="min-w-0"><span className="block truncate">Hadir</span><strong className="block whitespace-nowrap text-slate-700 dark:text-slate-200">{formatPercent(item.persentaseKehadiran)}</strong></span>
                      <span className="min-w-0"><span className="block truncate">Tepat</span><strong className="block whitespace-nowrap text-slate-700 dark:text-slate-200">{formatPercent(item.persentaseTepatWaktu)}</strong></span>
                      <span className="min-w-0"><span className="block truncate">Checkout</span><strong className="block whitespace-nowrap text-slate-700 dark:text-slate-200">{formatPercent(item.persentasePulang)}</strong></span>
                      <span className="min-w-0"><span className="block truncate">Lembur</span><strong className="block whitespace-nowrap text-amber-700 dark:text-amber-300">{formatOvertimeBonus(item.bonusLembur)}</strong></span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Skor</p>
                    <p className="text-base font-black tabular-nums text-slate-800 dark:text-slate-100">{formatScore(item.skor)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {myRankOutsideTopTen && (
        <section className="guru-surface border-blue-200 bg-blue-50/60 p-5 dark:border-blue-500/30 dark:bg-blue-500/10" aria-label="Posisi saya">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">Posisi Saya</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">{myRank.nama}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Belum masuk Top 10 bulan ini</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-black tabular-nums text-blue-700 dark:text-blue-300">#{myRank.rank}</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Skor {formatScore(myRank.skor)}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-xs dark:bg-slate-900/30">
            <span className="text-slate-500 dark:text-slate-400">Bonus lembur</span>
            <strong className="tabular-nums text-amber-700 dark:text-amber-300">{formatOvertimeBonus(myRank.bonusLembur)}</strong>
          </div>
        </section>
      )}
    </div>
  )
}

export default GuruPeringkat
