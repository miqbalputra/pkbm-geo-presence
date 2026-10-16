import { useEffect, useMemo, useState } from 'react'
import { Users, UserCheck, FileText, AlertCircle, UserX, RefreshCw, Search, ChevronLeft, ChevronRight, CircleCheck, MessageCircle, MessageSquareWarning, BellRing, Clock3, Phone } from 'lucide-react'
import { adminMonthlyAttendanceConfirmationAPI, adminSummaryAPI } from '../../services/api'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { AppDialog } from '../ui/dialog'
import { AttendanceStatus, attendanceStatuses } from '../ui/attendance-status'
import { PageHeader, Notice, EmptyState } from '../ui/page'
import { Skeleton } from '../ui/skeleton'

const periods = { today: 'Hari ini', yesterday: 'Kemarin', '7days': '7 hari terakhir', '14days': '14 hari terakhir', '30days': '30 hari terakhir' }
const PAGE_SIZE = 25

function formatTime(value) {
  if (!value || value === '-' || value === '00:00:00') return '-'
  return String(value).substring(0, 5)
}
function arrival(log) { return formatTime(log.status === 'izin' ? log.jamIzin : log.status === 'sakit' ? log.jamSakit : log.jamMasuk) }
function departure(log) { return String(log.status || '').startsWith('hadir') ? formatTime(log.jamPulang) : '-' }
function formatConfirmationTime(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed)
}
function formatConfirmationDeadline(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta', timeZoneName: 'short' }).format(parsed)
}

export default function DashboardHome() {
  const [period, setPeriod] = useState('today')
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<any>(null)
  const [monthlyConfirmation, setMonthlyConfirmation] = useState<any>(null)
  const [monthlyConfirmationError, setMonthlyConfirmationError] = useState('')
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [adminConfirmationTarget, setAdminConfirmationTarget] = useState<any>(null)
  const [adminConfirmationBusy, setAdminConfirmationBusy] = useState(false)
  const [adminConfirmationError, setAdminConfirmationError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    adminSummaryAPI.getDashboard(period)
      .then((response) => {
        if (!cancelled) setSnapshot({ period, data: response.data || {}, updated: new Date() })
      })
      .catch((failure) => { if (!cancelled) setError(failure.message || 'Ringkasan belum dapat dimuat.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period, revision])

  useEffect(() => {
    let cancelled = false
    setMonthlyConfirmationError('')
    adminMonthlyAttendanceConfirmationAPI.getSummary()
      .then((response) => {
        if (cancelled) return
        const data = response.data || null
        setMonthlyConfirmation(data)
        setFollowUpOpen(Boolean(data?.followUpActive))
      })
      .catch((failure) => { if (!cancelled) setMonthlyConfirmationError(failure.message || 'Rekap konfirmasi bulanan belum dapat dimuat.') })
    return () => { cancelled = true }
  }, [revision])

  const current = snapshot?.period === period ? snapshot : null
  const data = current?.data
  const logs = data?.logs || []
  const missing = data?.belumPresensiHariIni || []
  const filtered = useMemo(() => logs.filter((log) =>
    (!status || log.status === status) && String(log.nama || '').toLowerCase().includes(search.trim().toLowerCase())
  ), [logs, search, status])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const isDaily = period === 'today' || period === 'yesterday'
  const stats = [
    { label: 'Total guru', value: data?.totalGuru, icon: Users, unit: 'akun guru' },
    { label: 'Hadir', value: data?.stats?.hadir, icon: UserCheck, unit: isDaily ? 'guru' : 'presensi' },
    { label: 'Izin', value: data?.stats?.izin, icon: FileText, unit: isDaily ? 'guru' : 'presensi' },
    { label: 'Sakit', value: data?.stats?.sakit, icon: UserX, unit: isDaily ? 'guru' : 'presensi' },
    { label: 'Alfa', value: data?.stats?.alfa, icon: AlertCircle, unit: isDaily ? 'guru' : 'presensi' },
  ]
  const resetPeriod = (value) => { setPeriod(value); setPage(1) }
  const confirmTeacherAsAdmin = async () => {
    if (!adminConfirmationTarget || adminConfirmationBusy) return
    setAdminConfirmationBusy(true)
    setAdminConfirmationError('')
    try {
      await adminMonthlyAttendanceConfirmationAPI.confirmForTeacher(adminConfirmationTarget.id)
      setAdminConfirmationTarget(null)
      try {
        const response = await adminMonthlyAttendanceConfirmationAPI.getSummary()
        setMonthlyConfirmation(response.data || null)
      } catch (failure) {
        setMonthlyConfirmationError(failure.message || 'Konfirmasi tersimpan, tetapi ringkasan belum dapat diperbarui.')
      }
    } catch (failure) {
      setAdminConfirmationError(failure.message || 'Rekap belum berhasil dikonfirmasi.')
    } finally {
      setAdminConfirmationBusy(false)
    }
  }

  return <div className="space-y-5">
    <PageHeader title="Dashboard presensi" description="Ringkasan kehadiran dan catatan operasional sekolah." actions={<>
      <label className="sr-only" htmlFor="dashboard-period">Periode dashboard</label>
      <select id="dashboard-period" value={period} onChange={(event) => resetPeriod(event.target.value)} className="academy-input px-3 text-sm">{Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <Button type="button" variant="outline" onClick={() => setRevision((value) => value + 1)} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />{loading ? 'Memuat' : 'Perbarui'}</Button>
    </>} />
    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><p>{periods[period]} · Ringkasan mengikuti periode, pencarian hanya menyaring tabel.</p><p aria-live="polite">{current ? 'Diperbarui ' + current.updated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : loading ? 'Mengambil data terbaru...' : 'Data belum tersedia'}</p></div>
    {error && <Notice onRetry={() => setRevision((value) => value + 1)}>{error}{current && '\nMenampilkan data terakhir yang berhasil dimuat; pembaruan belum berhasil.'}</Notice>}
    {monthlyConfirmationError && <Notice tone="warning" onRetry={() => setRevision((value) => value + 1)}>{monthlyConfirmationError}</Notice>}
    {!current && loading && <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Memuat ringkasan">{stats.map((stat) => <Skeleton key={stat.label} className="h-28 rounded-xl" />)}</div>}
    {current && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{stats.map((stat, index) => <Card key={stat.label} className={'gap-3 p-4 ' + (index === 0 ? 'col-span-2 lg:col-span-1' : '')}><div className="flex items-center justify-between gap-2 text-muted-foreground"><p className="text-sm">{stat.label}</p><stat.icon className="h-4 w-4" aria-hidden="true" /></div><p className="flex items-baseline gap-2"><span className="text-3xl font-semibold tabular-nums tracking-tight">{Number(stat.value) || 0}</span><span className="text-xs text-muted-foreground">{stat.unit}</span></p></Card>)}</div>
      {monthlyConfirmation?.active && <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div><h2 className="text-base font-semibold">Konfirmasi rekap penggajian</h2><p className="mt-1 text-xs text-muted-foreground">Rekap {monthlyConfirmation.period?.label || 'bulan sebelumnya'} · Pengingat konfirmasi tidak mengunci presensi guru.</p></div>
          <div className="flex items-center gap-2"><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{monthlyConfirmation.summary?.total || 0} guru</span>{monthlyConfirmation.followUpActive && <Button type="button" variant="outline" size="sm" onClick={() => setFollowUpOpen(true)}><BellRing className="text-rose-600" aria-hidden="true" />Tindak lanjuti</Button>}</div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <div className="bg-background p-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><CircleCheck className="h-4 w-4 text-emerald-600" />Setuju oleh guru</p><p className="mt-2 text-2xl font-semibold tabular-nums">{monthlyConfirmation.summary?.confirmed || 0}</p></div>
          <div className="bg-background p-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><CircleCheck className="h-4 w-4 text-blue-600" />Dikonfirmasi Admin</p><p className="mt-2 text-2xl font-semibold tabular-nums">{monthlyConfirmation.summary?.adminConfirmed || 0}</p></div>
          <div className="bg-background p-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><MessageSquareWarning className="h-4 w-4 text-amber-600" />Pengajuan koreksi</p><p className="mt-2 text-2xl font-semibold tabular-nums">{monthlyConfirmation.summary?.correctionRequested || 0}</p></div>
          <div className="bg-background p-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4 text-slate-600" />Belum konfirmasi</p><p className="mt-2 text-2xl font-semibold tabular-nums">{monthlyConfirmation.summary?.pending || 0}</p></div>
        </div>
        <div className="max-h-72 divide-y divide-border overflow-y-auto">
          {(monthlyConfirmation.items || []).map((teacher) => {
            const isConfirmedByTeacher = teacher.status === 'confirmed'
            const isConfirmedByAdmin = teacher.status === 'confirmed_by_admin'
            const isConfirmed = isConfirmedByTeacher || isConfirmedByAdmin
            const status = isConfirmedByAdmin ? 'Dikonfirmasi Admin' : isConfirmedByTeacher ? 'Sudah setuju' : teacher.status === 'correction_requested' ? 'Mengajukan koreksi' : 'Belum konfirmasi'
            const time = isConfirmed ? teacher.confirmedAt : teacher.correctionRequestedAt
            const tone = isConfirmedByAdmin ? 'bg-blue-50 text-blue-700' : isConfirmedByTeacher ? 'bg-emerald-50 text-emerald-700' : teacher.status === 'correction_requested' ? 'bg-amber-50 text-amber-800' : 'bg-muted text-muted-foreground'
            return <div key={teacher.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{teacher.nama}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{Array.isArray(teacher.jabatan) ? teacher.jabatan.join(', ') : teacher.jabatan || 'Guru'}</p></div><div className="flex flex-wrap items-center justify-end gap-2"><div className="text-right"><span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-medium ' + tone}>{status}</span>{time && <p className="mt-1 text-xs text-muted-foreground">{formatConfirmationTime(time)}</p>}</div>{!isConfirmed && <Button type="button" variant="outline" size="sm" onClick={() => { setAdminConfirmationError(''); setAdminConfirmationTarget(teacher) }}>Konfirmasi</Button>}</div></div>
          })}
        </div>
      </Card>}
      <AppDialog open={!!adminConfirmationTarget} onOpenChange={(open) => { if (!open && !adminConfirmationBusy) { setAdminConfirmationTarget(null); setAdminConfirmationError('') } }} title="Konfirmasi rekap sebagai admin" description={adminConfirmationTarget ? `Anda akan menyetujui rekap presensi ${monthlyConfirmation?.period?.label || 'bulan sebelumnya'} atas nama ${adminConfirmationTarget.nama}. Snapshot rekap saat ini akan disimpan dan guru tidak perlu menekan Setuju lagi.` : undefined} busy={adminConfirmationBusy}>
        <div className="space-y-4">
          {adminConfirmationError && <Notice tone="warning">{adminConfirmationError}</Notice>}
          <p className="text-sm text-muted-foreground">Pastikan rekap sudah diperiksa atau sudah diklarifikasi dengan guru sebelum dikonfirmasi.</p>
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={adminConfirmationBusy} onClick={() => setAdminConfirmationTarget(null)}>Batal</Button><Button type="button" disabled={adminConfirmationBusy} onClick={confirmTeacherAsAdmin}>{adminConfirmationBusy ? 'Menyimpan...' : 'Ya, konfirmasi rekap'}</Button></div>
        </div>
      </AppDialog>
      <AppDialog open={followUpOpen} onOpenChange={setFollowUpOpen} title="Tindak Lanjut Konfirmasi Rekap" description={`Tenggat ${monthlyConfirmation?.period?.label || 'rekap bulan sebelumnya'} telah lewat pada ${formatConfirmationDeadline(monthlyConfirmation?.deadlineAt)}. Hubungi guru berikut secara pribadi.`} className="max-w-2xl">
        <div className="space-y-4">
          <Notice tone="warning">{monthlyConfirmation?.summary?.awaitingConfirmation || 0} guru belum menekan Setuju. Guru dengan pengajuan koreksi tetap perlu menuntaskan konfirmasi setelah datanya diperiksa.</Notice>
          <div className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {(monthlyConfirmation?.followUpItems || []).map((teacher) => {
              const correction = teacher.status === 'correction_requested'
              return <article key={teacher.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{teacher.nama}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{Array.isArray(teacher.jabatan) ? teacher.jabatan.join(', ') : teacher.jabatan || 'Guru'}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{teacher.phone || 'Nomor HP belum tersedia'}</p></div><div className="flex flex-wrap items-center justify-end gap-2"><span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + (correction ? 'bg-amber-50 text-amber-800' : 'bg-muted text-muted-foreground')}>{correction ? 'Mengajukan koreksi' : 'Belum konfirmasi'}</span><Button type="button" size="sm" onClick={() => { setFollowUpOpen(false); setAdminConfirmationError(''); setAdminConfirmationTarget(teacher) }}><CircleCheck aria-hidden="true" />Konfirmasi Admin</Button>{teacher.followUpWhatsAppUrl ? <Button type="button" variant="outline" size="sm" asChild><a href={teacher.followUpWhatsAppUrl} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" />WhatsApp</a></Button> : null}</div></article>
            })}
          </div>
          <div className="flex justify-end"><Button type="button" variant="outline" onClick={() => setFollowUpOpen(false)}>Tutup</Button></div>
        </div>
      </AppDialog>
      {period === 'today' && missing.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-amber-900 dark:text-amber-200">{missing.length} guru belum presensi hari ini <span className="ml-2 text-xs font-normal">Lihat daftar</span></summary>
        <div className="max-h-60 overflow-y-auto border-t border-amber-200 px-4 dark:border-amber-900">{missing.map((teacher) => <div key={teacher.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 last:border-0"><p className="text-sm font-medium">{teacher.nama}</p><span className="text-xs text-muted-foreground">{Array.isArray(teacher.jabatan) ? teacher.jabatan.join(', ') : teacher.jabatan}</span></div>)}</div>
      </details>}
      <Card className="gap-0 overflow-hidden p-0" aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4 sm:p-5">
          <div><h2 className="text-base font-semibold">Catatan presensi</h2><p className="mt-1 text-xs text-muted-foreground">{filtered.length} dari {logs.length} catatan · {periods[period]}</p></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-60"><label className="sr-only" htmlFor="dashboard-search">Cari nama guru</label><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input id="dashboard-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Cari nama guru..." className="pl-9" /></div>
            <label className="sr-only" htmlFor="dashboard-status">Filter status</label><select id="dashboard-status" className="academy-input max-w-full px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">Semua status</option>{Object.entries(attendanceStatuses).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select>
          </div>
        </div>
        {rows.length === 0 ? <EmptyState title={search || status ? 'Tidak ada catatan yang cocok' : 'Belum ada catatan presensi'} description={search || status ? 'Sesuaikan nama atau status untuk melihat hasil lainnya.' : 'Catatan yang tersimpan akan muncul untuk periode ini.'} /> : <>
          <div className="hidden overflow-x-auto md:block"><table className="w-full text-left"><thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground"><tr>{['Guru', 'Tanggal', 'Masuk', 'Pulang', 'Status', 'Detail'].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((log) => <tr key={log.id} className="hover:bg-muted/40"><td className="px-4 py-3 font-medium">{log.nama || '-'}</td><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{log.tanggal}</td><td className="px-4 py-3 tabular-nums">{arrival(log)}</td><td className="px-4 py-3 tabular-nums">{departure(log)}</td><td className="px-4 py-3"><AttendanceStatus status={log.status} /></td><td className="px-4 py-2"><Button type="button" variant="ghost" onClick={() => setDetail(log)} aria-label={'Detail presensi ' + log.nama + ' ' + log.tanggal}>Lihat detail<ChevronRight aria-hidden="true" /></Button></td></tr>)}</tbody></table></div>
          <div className="divide-y divide-border md:hidden">{rows.map((log) => <article key={log.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-sm font-semibold">{log.nama}</h3><p className="mt-1 text-xs text-muted-foreground">{log.tanggal}</p></div><AttendanceStatus status={log.status} /></div><div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Masuk <span className="font-medium text-foreground">{arrival(log)}</span> · Pulang <span className="font-medium text-foreground">{departure(log)}</span></p><Button type="button" variant="ghost" size="icon" onClick={() => setDetail(log)} aria-label={'Detail presensi ' + log.nama + ' ' + log.tanggal}><ChevronRight /></Button></div></article>)}</div>
        </>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"><p className="text-xs text-muted-foreground">{filtered.length ? ((currentPage - 1) * PAGE_SIZE + 1) + '–' + Math.min(currentPage * PAGE_SIZE, filtered.length) : '0'} dari {filtered.length} catatan</p><div className="flex items-center gap-2"><Button type="button" variant="outline" size="icon" disabled={currentPage === 1} aria-label="Halaman sebelumnya" onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button><span className="text-sm tabular-nums" aria-live="polite">{currentPage} / {pages}</span><Button type="button" variant="outline" size="icon" disabled={currentPage >= pages} aria-label="Halaman berikutnya" onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button></div></div>
      </Card>
    </>}
    <AppDialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null) }} title="Detail presensi" description={detail ? detail.nama + ' · ' + detail.tanggal : undefined}>
      {detail && <div className="space-y-5"><AttendanceStatus status={detail.status} /><dl className="grid grid-cols-2 gap-4"><div><dt className="text-sm text-muted-foreground">Jam masuk / laporan</dt><dd className="mt-1 font-medium">{arrival(detail)}</dd></div><div><dt className="text-sm text-muted-foreground">Jam pulang</dt><dd className="mt-1 font-medium">{departure(detail)}</dd></div></dl><div><h3 className="text-sm text-muted-foreground">Keterangan</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{detail.keterangan || 'Tidak ada keterangan tambahan.'}</p></div></div>}
    </AppDialog>
  </div>
}
