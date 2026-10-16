import { useCallback, useEffect, useState } from 'react'
import { Check, ClipboardCheck, RefreshCw, X } from 'lucide-react'
import { attendanceRevisionAPI } from '../../services/api'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { EmptyState, Notice, PageHeader, PageLoading } from '../ui/page'

type RevisionRequest = {
  id: number
  user_id: number
  nama_guru?: string
  is_pokjar?: boolean
  tanggal: string
  original_status: string
  original_jam_masuk?: string | null
  original_jam_hadir?: string | null
  original_jam_pulang?: string | null
  original_keterangan?: string | null
  proposed_status: string
  proposed_jam_masuk?: string | null
  proposed_jam_pulang?: string | null
  proposed_keterangan?: string | null
  alasan: string
  status: 'pending' | 'approved' | 'rejected'
  admin_note?: string | null
  created_at: string
}

const labels: Record<string, string> = {
  hadir: 'Hadir',
  hadir_terlambat: 'Hadir terlambat',
  hadir_izin_terlambat: 'Hadir, izin terlambat',
  izin: 'Izin',
  sakit: 'Sakit',
}

function dateLabel(value?: string) {
  if (!value) return 'Tanggal tidak tersedia'
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
}

function timeLabel(value?: string | null) {
  return value ? String(value).slice(0, 5) : '—'
}

function statusBadge(status: RevisionRequest['status']) {
  if (status === 'approved') return <Badge variant="success">Disetujui</Badge>
  if (status === 'rejected') return <Badge variant="danger">Ditolak</Badge>
  return <Badge variant="warning">Menunggu</Badge>
}

export default function AttendanceRevisionRequests() {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [requests, setRequests] = useState<RevisionRequest[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const invalidPokjarProposal = (request: RevisionRequest) => request.is_pokjar && (
    !['hadir', 'izin', 'sakit'].includes(request.proposed_status) ||
    Boolean((request.proposed_jam_pulang || '').trim())
  )

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await attendanceRevisionAPI.getAll(filter === 'all' ? {} : { status: filter })
      setRequests(Array.isArray(response.data) ? response.data : [])
    } catch (failure) {
      setError(failure.message || 'Daftar pengajuan belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { void loadRequests() }, [loadRequests])

  const review = async (request: RevisionRequest, decision: 'approve' | 'reject') => {
    if (busyId !== null) return
    const note = (notes[request.id] || '').trim()
    if (decision === 'reject' && note.length < 5) {
      setActionError('Isi alasan penolakan minimal 5 karakter agar guru tahu tindak lanjutnya.')
      return
    }
    setBusyId(request.id)
    setActionError('')
    setNotice('')
    try {
      const response = decision === 'approve'
        ? await attendanceRevisionAPI.approve(request.id, note)
        : await attendanceRevisionAPI.reject(request.id, note)
      const updated = response.data as RevisionRequest
      setRequests((current) => filter !== 'all' && filter !== updated.status
        ? current.filter((item) => item.id !== request.id)
        : current.map((item) => item.id === request.id ? updated : item))
      setNotice(decision === 'approve' ? 'Revisi disetujui dan diterapkan ke catatan presensi.' : 'Pengajuan revisi ditolak dan alasan dikirim ke riwayat guru.')
    } catch (failure) {
      setActionError(failure.message || 'Keputusan belum berhasil disimpan.')
    } finally {
      setBusyId(null)
    }
  }

  const filters = [
    { id: 'pending', label: 'Menunggu' },
    { id: 'approved', label: 'Disetujui' },
    { id: 'rejected', label: 'Ditolak' },
    { id: 'all', label: 'Semua' },
  ] as const

  return <div className="space-y-5">
    <PageHeader title="Pengajuan revisi presensi" description="Tinjau perubahan yang diajukan guru. Persetujuan akan langsung memperbarui catatan presensi dan membuat jejak audit." actions={<Button type="button" variant="outline" onClick={() => void loadRequests()} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />Muat ulang</Button>} />
    <div className="flex flex-wrap gap-2" aria-label="Filter pengajuan revisi">{filters.map((item) => <Button key={item.id} type="button" size="sm" variant={filter === item.id ? 'default' : 'outline'} onClick={() => setFilter(item.id)}>{item.label}</Button>)}</div>
    {error && <Notice onRetry={loadRequests}>{error}</Notice>}
    {actionError && <Notice tone="error" onDismiss={() => setActionError('')}>{actionError}</Notice>}
    {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
    {loading ? <PageLoading /> : requests.length ? <div className="space-y-4">{requests.map((request) => <Card key={request.id} className="gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{request.nama_guru || 'Guru'} · {dateLabel(request.tanggal)}</h2><p className="mt-1 text-xs text-muted-foreground">Diajukan {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(request.created_at))}{request.is_pokjar ? ' · Pokjar, tanpa presensi pulang' : ''}</p></div>{statusBadge(request.status)}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-border bg-muted/40 p-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catatan saat ini</h3><p className="mt-2 text-sm font-semibold">{labels[request.original_status] || request.original_status}</p><p className="mt-1 text-sm tabular-nums">Masuk {timeLabel(request.original_jam_masuk || request.original_jam_hadir)}{request.is_pokjar ? ' · tanpa jam pulang' : ` · Pulang ${timeLabel(request.original_jam_pulang)}`}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.original_keterangan || 'Tanpa keterangan'}</p></section>
        <section className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/20"><h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Usulan guru</h3><p className="mt-2 text-sm font-semibold">{labels[request.proposed_status] || request.proposed_status}</p><p className="mt-1 text-sm tabular-nums">Masuk {timeLabel(request.proposed_jam_masuk)}{request.is_pokjar ? ' · tanpa jam pulang' : ` · Pulang ${timeLabel(request.proposed_jam_pulang)}`}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.proposed_keterangan || 'Tanpa keterangan'}</p></section>
      </div>
      <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs font-semibold text-muted-foreground">Alasan guru</p><p className="mt-1 whitespace-pre-wrap text-sm">{request.alasan}</p></div>
      {request.status === 'pending' && invalidPokjarProposal(request) && <Notice tone="error">Pokjar hanya menggunakan status Hadir, Izin, atau Sakit tanpa jam pulang. Pengajuan ini tidak dapat disetujui; tolak dengan catatan kepada guru.</Notice>}
      {request.admin_note && <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs font-semibold text-muted-foreground">Catatan admin</p><p className="mt-1 whitespace-pre-wrap text-sm">{request.admin_note}</p></div>}
      {request.status === 'pending' && <div className="space-y-3 border-t border-border pt-4">
        <label className="grid gap-1.5 text-sm font-medium">Catatan keputusan admin<textarea className="academy-input min-h-20 resize-y px-3 py-2" value={notes[request.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} maxLength={1000} placeholder="Wajib diisi jika pengajuan ditolak." /></label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="text-rose-700 hover:text-rose-800" disabled={busyId !== null || (notes[request.id] || '').trim().length < 5} onClick={() => void review(request, 'reject')}>{busyId === request.id ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}Tolak pengajuan</Button><Button type="button" disabled={busyId !== null || invalidPokjarProposal(request)} onClick={() => void review(request, 'approve')}>{busyId === request.id ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}Setujui & terapkan</Button></div>
      </div>}
    </Card>)}</div> : <Card><EmptyState title="Tidak ada pengajuan pada filter ini" description={filter === 'pending' ? 'Pengajuan baru dari guru akan muncul di sini.' : 'Ubah filter untuk melihat pengajuan lainnya.'} /></Card>}
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Sebelum menyetujui, cocokkan tanggal, catatan saat ini, usulan guru, dan alasan. Sistem menolak persetujuan jika catatan presensi berubah sejak pengajuan dibuat.</div>
  </div>
}
