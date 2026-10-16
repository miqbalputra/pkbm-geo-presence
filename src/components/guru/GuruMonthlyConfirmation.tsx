import { useEffect, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Clock3, MessageCircle } from 'lucide-react'
import { monthlyAttendanceConfirmationAPI } from '../../services/api'
import { AppDialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { Notice } from '../ui/page'

const statusLabels: Record<string, string> = {
  hadir: 'Hadir',
  hadir_terlambat: 'Hadir terlambat',
  hadir_izin_terlambat: 'Hadir terlambat',
  izin: 'Izin',
  sakit: 'Sakit',
  alfa: 'Alfa',
  libur: 'Libur',
  libur_override: 'Libur khusus',
}

const statusTone: Record<string, string> = {
  hadir: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  hadir_terlambat: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  hadir_izin_terlambat: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  izin: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  sakit: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  alfa: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  libur: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  libur_override: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
}

function formatDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T12:00:00`))
}

function formatDeadline(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta', timeZoneName: 'short' }).format(new Date(value))
}

function formatTime(value?: string) {
  return value && value !== '-' ? String(value).slice(0, 5) : '-'
}

function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (days > 0) return `${days}h ${hours}j ${minutes}m`
  return `${hours}j ${minutes}m ${remainder}d`
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${statusTone[status] || statusTone.libur}`}>{statusLabels[status] || status || '-'}</span>
}

function ReminderBanner({ confirmation, onReview }: { confirmation: any; onReview: () => void }) {
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const deadline = new Date(confirmation?.deadlineAt || 0).getTime()
  const overdue = confirmation?.isOverdue || !Number.isFinite(deadline) || currentTime >= deadline

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const correctionRequested = confirmation?.status === 'correction_requested'
  return <section className={`mb-4 rounded-xl border p-3 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4 ${overdue ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10' : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'}`} role="status" aria-live="polite">
    <div className="flex min-w-0 items-start gap-3">
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${overdue ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200'}`}><Clock3 className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${overdue ? 'text-rose-900 dark:text-rose-100' : 'text-amber-900 dark:text-amber-100'}`}>{correctionRequested ? 'Pengajuan koreksi sudah tercatat' : 'Konfirmasi rekap presensi menunggu'}</p>
        <p className={`mt-0.5 text-xs leading-relaxed ${overdue ? 'text-rose-800 dark:text-rose-200' : 'text-amber-800 dark:text-amber-200'}`}>{overdue ? 'Tenggat konfirmasi telah lewat. Mohon segera meninjau rekap presensi.' : `Konfirmasi ${confirmation?.period?.label || 'bulan sebelumnya'} sebelum ${formatDeadline(confirmation?.deadlineAt)} · sisa ${formatRemaining(deadline - currentTime)}.`}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Presensi bulan berjalan tetap tersedia.</p>
      </div>
    </div>
    <Button type="button" variant={overdue ? 'outline' : 'secondary'} className="mt-3 w-full shrink-0 sm:mt-0 sm:w-auto" onClick={onReview}>Tinjau rekap</Button>
  </section>
}

export default function GuruMonthlyConfirmation({ onDialogStateChange }: { onDialogStateChange?: (open: boolean, ready: boolean) => void } = {}) {
  const [confirmation, setConfirmation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState('')
  const [actionError, setActionError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    onDialogStateChange?.(dialogOpen, !loading)
  }, [dialogOpen, loading, onDialogStateChange])

  const loadConfirmation = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await monthlyAttendanceConfirmationAPI.getMine()
      const data = response.data || { needsConfirmation: false }
      setConfirmation(data)
      setDialogOpen(Boolean(data.needsConfirmation ?? data.required))
    } catch (failure) {
      setConfirmation(null)
      setError(failure.message || 'Status konfirmasi rekap belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    monthlyAttendanceConfirmationAPI.getMine()
      .then((response) => {
        if (ignore) return
        const data = response.data || { needsConfirmation: false }
        setConfirmation(data)
        setDialogOpen(Boolean(data.needsConfirmation ?? data.required))
      })
      .catch((failure) => { if (!ignore) setError(failure.message || 'Status konfirmasi rekap belum dapat dimuat.') })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [])

  const handleConfirm = async () => {
    setAction('confirm')
    setActionError('')
    try {
      const response = await monthlyAttendanceConfirmationAPI.confirm()
      const updated = response.data || { needsConfirmation: false }
      setConfirmation(updated)
      window.dispatchEvent(new CustomEvent('guru-monthly-confirmation-updated', { detail: updated }))
      setDialogOpen(false)
    } catch (failure) {
      setActionError(failure.message || 'Rekap presensi belum dapat disetujui.')
    } finally {
      setAction('')
    }
  }

  const handleCorrection = async () => {
    const correctionUrl = confirmation?.correctionWhatsAppUrl
    if (!correctionUrl) {
      setActionError('Nomor WhatsApp admin belum diatur. Hubungi administrator untuk melengkapinya.')
      return
    }
    const popup = window.open('', '_blank')
    setAction('correction')
    setActionError('')
    try {
      const response = await monthlyAttendanceConfirmationAPI.requestCorrection()
      const updated = { ...confirmation, ...(response.data || {}), needsConfirmation: true, required: true }
      setConfirmation(updated)
      window.dispatchEvent(new CustomEvent('guru-monthly-confirmation-updated', { detail: updated }))
      const destination = response.data?.correctionWhatsAppUrl || correctionUrl
      if (popup) {
        popup.opener = null
        popup.location.assign(destination)
      } else {
        window.location.assign(destination)
      }
    } catch (failure) {
      popup?.close()
      setActionError(failure.message || 'Pengajuan koreksi belum dapat dicatat.')
    } finally {
      setAction('')
    }
  }

  const needsConfirmation = Boolean(confirmation?.needsConfirmation ?? confirmation?.required)
  if (loading) return null
  if (error) return <Notice onRetry={loadConfirmation}>{error}</Notice>
  if (!needsConfirmation) return null

  const busy = Boolean(action)
  const summary = confirmation?.summary || {}
  const rows = Array.isArray(confirmation?.rows) ? confirmation.rows : []
  const correctionUnavailable = !confirmation?.correctionWhatsAppUrl

  return <>
    <ReminderBanner confirmation={confirmation} onReview={() => setDialogOpen(true)} />
    <AppDialog open={dialogOpen} onOpenChange={setDialogOpen} busy={busy} title="Konfirmasi Rekap Presensi" description={`Tinjau data ${confirmation?.period?.label || 'bulan sebelumnya'} untuk kebutuhan rekap penggajian.`} className="max-w-4xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Rekap mencakup {formatDate(confirmation?.period?.startDate)} – {formatDate(confirmation?.period?.endDate)}. Persetujuan Anda dicatat sebagai bukti konfirmasi penggajian.
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ['Hari kerja', summary.total_hari], ['Hadir', summary.hadir], ['Izin', summary.izin], ['Sakit', summary.sakit], ['Alfa', summary.alfa],
          ].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-muted/60 p-2.5 text-center"><p className="text-lg font-bold tabular-nums">{Number(value) || 0}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>)}
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2"><p className="text-xs font-semibold text-foreground">Daftar presensi bulan lalu · {rows.length} tanggal</p></div>
          <div className="max-h-[38vh] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-background text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">Tanggal</th><th className="px-3 py-2 font-semibold">Masuk</th><th className="px-3 py-2 font-semibold">Pulang</th><th className="px-3 py-2 font-semibold">Status</th><th className="hidden px-3 py-2 font-semibold sm:table-cell">Keterangan</th></tr></thead>
              <tbody className="divide-y divide-border">{rows.map((row: any) => <tr key={row.tanggal}><td className="whitespace-nowrap px-3 py-2 font-medium">{formatDate(row.tanggal)}</td><td className="px-3 py-2 tabular-nums">{formatTime(row.jam_masuk)}</td><td className="px-3 py-2 tabular-nums">{formatTime(row.jam_pulang)}</td><td className="px-3 py-2"><StatusBadge status={row.status} /></td><td className="hidden max-w-56 truncate px-3 py-2 text-muted-foreground sm:table-cell">{row.keterangan || '-'}</td></tr>)}</tbody>
            </table>
          </div>
        </div>

        {actionError && <Notice tone="error" onDismiss={() => setActionError('')}>{actionError}</Notice>}
        {confirmation?.status === 'correction_requested' && <Notice tone="warning">Pengajuan koreksi sudah dicatat. Rekap tetap menunggu persetujuan Anda setelah data selesai diperiksa.</Notice>}
        {correctionUnavailable && <Notice tone="warning">Nomor WhatsApp admin belum diatur. Tombol Pengajuan Koreksi akan tersedia setelah admin melengkapinya di Pengaturan.</Notice>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={busy}>Nanti</Button>
          <Button type="button" variant="outline" onClick={handleCorrection} disabled={busy || correctionUnavailable}><MessageCircle aria-hidden="true" />{action === 'correction' ? 'Mencatat...' : 'Ajukan Koreksi'}</Button>
          <Button type="button" onClick={handleConfirm} disabled={busy}><CheckCircle2 aria-hidden="true" />{action === 'confirm' ? 'Menyimpan...' : 'Setuju'}</Button>
        </div>
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"><ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Presensi bulan berjalan tetap dapat digunakan. Rekap tetap tercatat sebagai konfirmasi meskipun admin kemudian melakukan koreksi data.</p>
      </div>
    </AppDialog>
  </>
}
