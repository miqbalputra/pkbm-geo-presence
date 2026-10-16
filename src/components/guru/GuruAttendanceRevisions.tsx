import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ClipboardCheck, Clock3, FileClock, Plus, RefreshCw } from 'lucide-react'
import { attendanceRevisionAPI, presensiAPI } from '../../services/api'
import { AppDialog } from '../ui/dialog'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { EmptyState, Notice, PageHeader, PageLoading } from '../ui/page'

type AttendanceRow = {
  id: number
  tanggal: string
  status: string
  jam_masuk?: string | null
  jam_hadir?: string | null
  jam_pulang?: string | null
  keterangan?: string | null
}

type RevisionRequest = {
  id: number
  attendance_id: number
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
  is_pokjar?: boolean
  alasan: string
  status: 'pending' | 'approved' | 'rejected'
  admin_note?: string | null
  created_at: string
}

const statuses = [
  { value: 'hadir', label: 'Hadir' },
  { value: 'hadir_terlambat', label: 'Hadir terlambat' },
  { value: 'hadir_izin_terlambat', label: 'Hadir, izin terlambat' },
  { value: 'izin', label: 'Izin' },
  { value: 'sakit', label: 'Sakit' },
]

const statusNames = Object.fromEntries(statuses.map((status) => [status.value, status.label])) as Record<string, string>
const presentStatuses = new Set(['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'])

function dateLabel(value?: string) {
  if (!value) return 'Tanggal tidak tersedia'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date)
}

function timeValue(value?: string | null) {
  return value && value !== '-' ? String(value).slice(0, 5) : ''
}

function displayTime(value?: string | null) {
  return timeValue(value) || '—'
}

function statusLabel(status?: string) {
  return statusNames[status || ''] || status || '—'
}

function requestStatus(status: RevisionRequest['status']) {
  if (status === 'approved') return { label: 'Disetujui', variant: 'success' as const }
  if (status === 'rejected') return { label: 'Ditolak', variant: 'danger' as const }
  return { label: 'Menunggu admin', variant: 'warning' as const }
}

const emptyForm = {
  attendanceId: '',
  status: 'hadir',
  jamMasuk: '',
  jamPulang: '',
  keterangan: '',
  alasan: '',
}

export default function GuruAttendanceRevisions({ user }: { user?: { pokjar?: string | null } }) {
  const isPokjar = Boolean(String(user?.pokjar || '').trim())
  const availableStatuses = isPokjar ? statuses.filter((status) => ['hadir', 'izin', 'sakit'].includes(status.value)) : statuses
  const [records, setRecords] = useState<AttendanceRow[]>([])
  const [requests, setRequests] = useState<RevisionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [success, setSuccess] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [attendanceResponse, requestResponse] = await Promise.all([
        presensiAPI.getAll(),
        attendanceRevisionAPI.getAll(),
      ])
      setRecords(Array.isArray(attendanceResponse.data) ? attendanceResponse.data : [])
      setRequests(Array.isArray(requestResponse.data) ? requestResponse.data : [])
    } catch (failure) {
      setError(failure.message || 'Data pengajuan revisi belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  const selectedAttendance = useMemo(
    () => records.find((record) => String(record.id) === form.attendanceId),
    [records, form.attendanceId],
  )
  const pendingAttendanceIds = useMemo(
    () => new Set(requests.filter((request) => request.status === 'pending').map((request) => request.attendance_id)),
    [requests],
  )
  const availableRecords = useMemo(
    () => records.filter((record) => !pendingAttendanceIds.has(record.id)),
    [records, pendingAttendanceIds],
  )

  const openRequest = () => {
    const firstAvailable = availableRecords[0]
    if (!firstAvailable) return
    setForm({
      ...emptyForm,
      attendanceId: String(firstAvailable.id),
      status: availableStatuses.some((item) => item.value === firstAvailable.status) ? firstAvailable.status : 'hadir',
      jamMasuk: timeValue(firstAvailable.jam_masuk || firstAvailable.jam_hadir),
      jamPulang: timeValue(firstAvailable.jam_pulang),
      keterangan: firstAvailable.keterangan || '',
    })
    setDialogError('')
    setSuccess('')
    setDialogOpen(true)
  }

  const selectAttendance = (attendanceId: string) => {
    const record = records.find((item) => String(item.id) === attendanceId)
    if (!record) return setForm((current) => ({ ...current, attendanceId }))
    setForm((current) => ({
      ...current,
      attendanceId,
      status: availableStatuses.some((item) => item.value === record.status) ? record.status : 'hadir',
      jamMasuk: timeValue(record.jam_masuk || record.jam_hadir),
      jamPulang: timeValue(record.jam_pulang),
      keterangan: record.keterangan || '',
    }))
  }

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedAttendance || saving) return
    setSaving(true)
    setDialogError('')
    setSuccess('')
    try {
      const response = await attendanceRevisionAPI.create({
        attendance_id: Number(form.attendanceId),
        proposed_status: form.status,
        proposed_jam_masuk: presentStatuses.has(form.status) ? form.jamMasuk : '',
        proposed_jam_pulang: presentStatuses.has(form.status) && !isPokjar ? form.jamPulang : '',
        proposed_keterangan: form.keterangan,
        alasan: form.alasan,
      })
      setRequests((current) => [response.data, ...current])
      setDialogOpen(false)
      setSuccess('Pengajuan revisi sudah dikirim dan menunggu persetujuan admin.')
      setForm(emptyForm)
    } catch (failure) {
      setDialogError(failure.message || 'Pengajuan revisi belum berhasil dikirim.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-5">
    <PageHeader
      title="Revisi presensi"
      description="Ajukan perubahan untuk catatan presensi yang keliru. Perubahan hanya diterapkan setelah disetujui admin."
      actions={<Button type="button" onClick={openRequest} disabled={loading || availableRecords.length === 0}><Plus aria-hidden="true" />Ajukan revisi</Button>}
    />

    {error && <Notice onRetry={loadData}>{error}</Notice>}
    {success && <Notice tone="success" onDismiss={() => setSuccess('')}>{success}</Notice>}

    {loading ? <PageLoading /> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-2 p-4"><p className="text-xs text-muted-foreground">Total pengajuan</p><p className="text-2xl font-semibold tabular-nums">{requests.length}</p></Card>
        <Card className="gap-2 p-4"><p className="text-xs text-muted-foreground">Menunggu admin</p><p className="text-2xl font-semibold tabular-nums">{requests.filter((request) => request.status === 'pending').length}</p></Card>
        <Card className="gap-2 p-4"><p className="text-xs text-muted-foreground">Catatan dapat direvisi</p><p className="text-2xl font-semibold tabular-nums">{availableRecords.length}</p></Card>
      </div>

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div><h2 className="font-semibold">Riwayat pengajuan</h2><p className="mt-1 text-xs text-muted-foreground">Status dan keputusan admin tampil di sini.</p></div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />Muat ulang</Button>
        </div>
        {requests.length ? <div className="divide-y divide-border">{requests.map((request) => {
          const status = requestStatus(request.status)
          return <article key={request.id} className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><FileClock className="h-4 w-4 text-primary" aria-hidden="true" /><h3 className="text-sm font-semibold">{dateLabel(request.tanggal)}</h3></div><Badge variant={status.variant}>{status.label}</Badge></div>
            <div className="grid gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
              <div><p className="text-xs font-semibold text-muted-foreground">Catatan awal</p><p className="mt-1">{statusLabel(request.original_status)} · Masuk {displayTime(request.original_jam_masuk || request.original_jam_hadir)}{isPokjar ? ' · tanpa jam pulang' : ` / Pulang ${displayTime(request.original_jam_pulang)}`}</p></div>
              <div><p className="text-xs font-semibold text-muted-foreground">Usulan</p><p className="mt-1 font-medium">{statusLabel(request.proposed_status)} · Masuk {displayTime(request.proposed_jam_masuk)}{isPokjar ? ' · tanpa jam pulang' : ` / Pulang ${displayTime(request.proposed_jam_pulang)}`}</p></div>
            </div>
            <div className="space-y-1 text-sm"><p><span className="font-semibold">Alasan:</span> {request.alasan}</p>{request.proposed_keterangan && <p><span className="font-semibold">Keterangan usulan:</span> {request.proposed_keterangan}</p>}{request.admin_note && <p className={request.status === 'rejected' ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground'}><span className="font-semibold">Catatan admin:</span> {request.admin_note}</p>}</div>
          </article>
        })}</div> : <EmptyState title="Belum ada pengajuan revisi" description="Jika ada catatan presensi yang keliru, ajukan dari tombol di atas." />}
      </Card>
      {records.length === 0 && <EmptyState title="Belum ada catatan presensi" description="Pengajuan revisi dapat dibuat setelah ada catatan presensi pada riwayat Anda." />}
    </>}

    <AppDialog open={dialogOpen} onOpenChange={setDialogOpen} busy={saving} title="Ajukan revisi presensi" description="Pilih catatan dan isi nilai yang benar. Catatan resmi tidak berubah sebelum admin menyetujui." className="max-w-2xl">
      <form onSubmit={submitRequest} className="space-y-4">
        {dialogError && <Notice tone="error">{dialogError}</Notice>}
        <label className="grid gap-1.5 text-sm font-medium">Catatan presensi
          <select className="academy-input min-h-11 px-3" value={form.attendanceId} onChange={(event) => selectAttendance(event.target.value)} required>
            {records.map((record) => <option key={record.id} value={record.id} disabled={pendingAttendanceIds.has(record.id)}>{dateLabel(record.tanggal)} · {statusLabel(record.status)}{pendingAttendanceIds.has(record.id) ? ' · menunggu admin' : ''}</option>)}
          </select>
        </label>
        {selectedAttendance && <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />Saat ini: {statusLabel(selectedAttendance.status)}, masuk {displayTime(selectedAttendance.jam_masuk || selectedAttendance.jam_hadir)}{isPokjar ? ' · tanpa jam pulang' : ` · pulang ${displayTime(selectedAttendance.jam_pulang)}`}</p>}
        <label className="grid gap-1.5 text-sm font-medium">Status yang diusulkan
          <select className="academy-input min-h-11 px-3" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value, ...(presentStatuses.has(event.target.value) ? {} : { jamMasuk: '', jamPulang: '' }) }))}>
            {availableStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </label>
        {presentStatuses.has(form.status) && <div className={`grid gap-3 ${isPokjar ? '' : 'sm:grid-cols-2'}`}>
          <label className="grid gap-1.5 text-sm font-medium">Jam masuk yang benar<input className="academy-input min-h-11 px-3" type="time" value={form.jamMasuk} onChange={(event) => setForm((current) => ({ ...current, jamMasuk: event.target.value }))} required /></label>
          {!isPokjar && <label className="grid gap-1.5 text-sm font-medium">Jam pulang<input className="academy-input min-h-11 px-3" type="time" value={form.jamPulang} onChange={(event) => setForm((current) => ({ ...current, jamPulang: event.target.value }))} /></label>}
        </div>}
        <label className="grid gap-1.5 text-sm font-medium">Keterangan presensi yang benar<textarea className="academy-input min-h-24 resize-y px-3 py-2" value={form.keterangan} onChange={(event) => setForm((current) => ({ ...current, keterangan: event.target.value }))} maxLength={2000} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Alasan revisi<textarea className="academy-input min-h-24 resize-y px-3 py-2" value={form.alasan} onChange={(event) => setForm((current) => ({ ...current, alasan: event.target.value }))} minLength={5} maxLength={1000} required placeholder="Jelaskan mengapa catatan ini perlu diperbaiki." /></label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Batal</Button><Button type="submit" disabled={saving || !selectedAttendance || pendingAttendanceIds.has(selectedAttendance.id)}>{saving ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <ClipboardCheck aria-hidden="true" />}{saving ? 'Mengirim...' : 'Kirim pengajuan'}</Button></div>
      </form>
    </AppDialog>
  </div>
}
