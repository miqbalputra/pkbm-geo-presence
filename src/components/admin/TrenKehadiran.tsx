import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Download,
  FileSpreadsheet,
  Percent,
  SlidersHorizontal,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { guruAPI, teachersWorkdaysAPI } from '../../services/api'
import { useGuruReport } from '../../hooks/useGuruReport'
import { eachDateInRange, formatDateForInput, formatDisplayDate } from '../../utils/dateUtils'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '../ui/chart'
import { EmptyState, Notice, PageLoading } from '../ui/page'

type PeriodKey = 'today' | '7days' | 'month' | 'semester' | 'custom'

const PRESENT_STATUSES = new Set(['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'])
const LATE_STATUSES = new Set(['hadir_terlambat', 'hadir_izin_terlambat'])
const ABSENT_STATUSES = new Set(['izin', 'sakit', 'alfa'])

const chartConfig = {
  hadir: { label: 'Hadir', color: '#2563eb' },
  tidakHadir: { label: 'Tidak hadir', color: '#f43f5e' },
} satisfies ChartConfig

const statusConfig = {
  hadir: { label: 'Hadir', color: '#2563eb' },
  sakit: { label: 'Sakit', color: '#e11d48' },
  izin: { label: 'Izin', color: '#0ea5e9' },
  alfa: { label: 'Alpa', color: '#94a3b8' },
}

const getToday = () => formatDateForInput(new Date())

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return formatDateForInput(date)
}

function getPeriodRange(period: PeriodKey, customStart: string, customEnd: string) {
  const today = getToday()
  if (period === 'today') return { start: today, end: today }
  if (period === '7days') return { start: shiftDate(today, -6), end: today }
  if (period === 'month') {
    const date = new Date(`${today}T12:00:00`)
    return { start: formatDateForInput(new Date(date.getFullYear(), date.getMonth(), 1)), end: today }
  }
  if (period === 'semester') {
    const date = new Date(`${today}T12:00:00`)
    const semesterStartMonth = date.getMonth() < 6 ? 0 : 6
    return { start: formatDateForInput(new Date(date.getFullYear(), semesterStartMonth, 1)), end: today }
  }
  return { start: customStart || shiftDate(today, -29), end: customEnd || today }
}

function formatRangeLabel(start: string, end: string) {
  if (!start || !end) return 'Pilih rentang tanggal'
  if (start === end) return formatDisplayDate(start)
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`
}

function normalizeList(value: any) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

function getTeacherType(teacher: any) {
  return String(teacher?.tipeGuru || teacher?.tipe_guru || teacher?.role || 'guru').trim().toLowerCase()
}

function teacherTypeLabel(value: string) {
  if (value === 'full_time' || value === 'full-time' || value === 'tetap') return 'Guru tetap'
  if (value === 'part_time' || value === 'part-time' || value === 'tidak_tetap') return 'Guru tidak tetap'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function MetricCard({ icon: Icon, label, value, helper, tone, trend }: any) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  }
  return (
    <Card className="gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-2.5 ${tones[tone] || tones.blue}`}><Icon className="h-5 w-5" aria-hidden="true" /></div>
        {trend && <span className={`inline-flex items-center gap-1 text-xs font-semibold ${trend.direction === 'up' ? 'text-emerald-600' : trend.direction === 'down' ? 'text-rose-600' : 'text-slate-500'}`} title="Perbandingan dengan periode sebelumnya">
          {trend.direction === 'up' ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : trend.direction === 'down' ? <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          {trend.value}
        </span>}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </div>
    </Card>
  )
}

function TrenKehadiran() {
  const [period, setPeriod] = useState<PeriodKey>('7days')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [teachers, setTeachers] = useState<any[]>([])
  const [teachersLoading, setTeachersLoading] = useState(true)
  const [teachersError, setTeachersError] = useState('')
  const [usersRevision, setUsersRevision] = useState(0)
  const [previousAttendanceRate, setPreviousAttendanceRate] = useState<number | null>(null)

  const range = useMemo(() => getPeriodRange(period, customStart, customEnd), [period, customStart, customEnd])
  const report = useGuruReport(null, range.start, range.end, { allGuru: true })

  useEffect(() => {
    let cancelled = false
    async function loadTeachers() {
      try {
        setTeachersLoading(true)
        setTeachersError('')
        const response = await guruAPI.getAll()
        if (!cancelled) setTeachers(normalizeList(response.data))
      } catch (error: any) {
        if (!cancelled) setTeachersError(error?.message || 'Daftar guru belum dapat dimuat.')
      } finally {
        if (!cancelled) setTeachersLoading(false)
      }
    }
    loadTeachers()
    return () => { cancelled = true }
  }, [usersRevision])

  const selectedTeachers = useMemo(() => teachers.filter((teacher) => typeFilter === 'all' || getTeacherType(teacher) === typeFilter), [teachers, typeFilter])

  const comparisonRange = useMemo(() => {
    const length = Math.max(eachDateInRange(range.start, range.end).length, 1)
    const end = shiftDate(range.start, -1)
    return { start: shiftDate(end, -(length - 1)), end }
  }, [range.start, range.end])

  useEffect(() => {
    let cancelled = false
    if (report.loading || selectedTeachers.length === 0) {
      setPreviousAttendanceRate(null)
      return () => { cancelled = true }
    }
    async function loadComparison() {
      try {
        const response = await teachersWorkdaysAPI.getAll(comparisonRange.start, comparisonRange.end)
        const workdayMap = response.data?.teachers || {}
        let expected = 0
        let present = 0
        selectedTeachers.forEach((teacher) => {
          const workdays = new Set(workdayMap[String(teacher.id)]?.workday_dates || [])
          expected += workdays.size
          present += report.attendanceLogs.filter((log: any) => String(log.userId || log.user_id) === String(teacher.id) && workdays.has(String(log.tanggal).slice(0, 10)) && PRESENT_STATUSES.has(log.status)).length
        })
        if (!cancelled) setPreviousAttendanceRate(expected > 0 ? (present / expected) * 100 : null)
      } catch {
        if (!cancelled) setPreviousAttendanceRate(null)
      }
    }
    loadComparison()
    return () => { cancelled = true }
  }, [comparisonRange.start, comparisonRange.end, selectedTeachers, report.loading, report.attendanceLogs])

  const summaries = useMemo(() => selectedTeachers.map((teacher) => {
    const summary = report.getGuruSummary(teacher.id, teacher)
    const late = summary.guruLogs?.filter((log: any) => LATE_STATUSES.has(log.status)).length || 0
    return {
      teacher,
      ...summary,
      late,
      absent: (summary.izin || 0) + (summary.sakit || 0) + (summary.alfa || 0),
    }
  }), [selectedTeachers, report.getGuruSummary])

  const analytics = useMemo(() => {
    const dates = eachDateInRange(range.start, range.end)
    const rowsByTeacher = summaries.map((item) => ({ item, rows: report.getGuruReportRows(item.teacher.id, item.teacher) }))
    const rowsByDate = new Map<string, { hadir: number; tidakHadir: number }>()
    const todayCounts = { hadir: 0, sakit: 0, izin: 0, alfa: 0 }
    let tepatWaktu = 0
    let terlambat = 0

    dates.forEach((date) => rowsByDate.set(date, { hadir: 0, tidakHadir: 0 }))
    rowsByTeacher.forEach(({ rows }) => rows.forEach((row: any) => {
      const date = String(row.tanggal || '').slice(0, 10)
      if (!rowsByDate.has(date)) return
      if (PRESENT_STATUSES.has(row.status)) {
        rowsByDate.get(date)!.hadir += 1
        if (row.status === 'hadir') tepatWaktu += 1
        if (LATE_STATUSES.has(row.status)) terlambat += 1
      } else if (ABSENT_STATUSES.has(row.status)) {
        rowsByDate.get(date)!.tidakHadir += 1
      }
      if (date === getToday() && Object.prototype.hasOwnProperty.call(todayCounts, row.status)) todayCounts[row.status as keyof typeof todayCounts] += 1
    }))

    const trend = dates.map((date) => ({
      date,
      tanggal: new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`)),
      hadir: rowsByDate.get(date)?.hadir || 0,
      tidakHadir: rowsByDate.get(date)?.tidakHadir || 0,
    }))
    const totalExpected = summaries.reduce((sum, item) => sum + (item.totalHari || 0), 0)
    const totalHadir = summaries.reduce((sum, item) => sum + (item.hadir || 0), 0)
    const totalIzin = summaries.reduce((sum, item) => sum + (item.izin || 0), 0)
    const totalSakit = summaries.reduce((sum, item) => sum + (item.sakit || 0), 0)
    const totalAlfa = summaries.reduce((sum, item) => sum + (item.alfa || 0), 0)
    const attendanceRate = totalExpected > 0 ? (totalHadir / totalExpected) * 100 : 0
    const todayData = Object.entries(todayCounts).map(([key, value]) => ({ key, name: statusConfig[key as keyof typeof statusConfig].label, value, fill: statusConfig[key as keyof typeof statusConfig].color }))

    return {
      trend,
      todayData,
      totalHadir,
      totalIzin,
      totalSakit,
      totalAlfa,
      totalExpected,
      tepatWaktu,
      terlambat,
      attendanceRate,
      trendDelta: previousAttendanceRate === null ? null : attendanceRate - previousAttendanceRate,
      todayTotal: Object.values(todayCounts).reduce((sum, value) => sum + value, 0),
    }
  }, [range.start, range.end, summaries, report.getGuruReportRows, previousAttendanceRate])

  const attention = useMemo(() => summaries
    .filter((item) => item.absent > 0)
    .sort((a, b) => b.absent - a.absent || b.late - a.late)
    .slice(0, 5), [summaries])

  const loading = teachersLoading || report.loading
  const error = teachersError || report.error
  const retry = () => { setUsersRevision((value) => value + 1); report.retry() }

  if (loading) return <PageLoading />
  if (error) return <Notice onRetry={retry}>{error}</Notice>

  const trendDirection = analytics.trendDelta === null ? 'flat' : analytics.trendDelta > 0.25 ? 'up' : analytics.trendDelta < -0.25 ? 'down' : 'flat'
  const trendText = analytics.trendDelta === null ? 'Menunggu pembanding' : `${analytics.trendDelta > 0 ? '+' : ''}${analytics.trendDelta.toFixed(1)} pp`

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 dark:border-blue-500/20 dark:bg-blue-950/30 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Dashboard eksekutif</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">Kehadiran guru</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatRangeLabel(range.start, range.end)} · {selectedTeachers.length} guru dalam cakupan</p>
        </div>
        <Button asChild variant="outline" className="w-full shrink-0 bg-white sm:w-auto dark:bg-slate-900">
          <a href="/admin/download-laporan"><Download aria-hidden="true" /> Ekspor PDF / Excel</a>
        </Button>
      </div>

      <Card className="gap-4 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><SlidersHorizontal className="h-4 w-4 text-blue-600" aria-hidden="true" />Filter analitik</div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">Rentang waktu
            <select className="academy-input min-h-11 px-3 text-sm" value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>
              <option value="today">Hari ini</option><option value="7days">7 hari terakhir</option><option value="month">Bulan ini</option><option value="semester">Semester ini</option><option value="custom">Custom range</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">Unit / tipe guru
            <select className="academy-input min-h-11 px-3 text-sm" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Semua guru</option>
              {Array.from(new Set(teachers.map(getTeacherType))).filter(Boolean).map((type) => <option key={type} value={type}>{teacherTypeLabel(type)}</option>)}
            </select>
          </label>
          <div className="flex items-end text-xs leading-5 text-muted-foreground"><CalendarDays className="mr-2 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />Data dihitung sesuai kalender kerja dan presensi tersimpan.</div>
        </div>
        {period === 'custom' && <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">Mulai tanggal<input type="date" max={getToday()} className="academy-input min-h-11 px-3 text-sm" value={customStart || shiftDate(getToday(), -29)} onChange={(event) => setCustomStart(event.target.value)} /></label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">Sampai tanggal<input type="date" max={getToday()} className="academy-input min-h-11 px-3 text-sm" value={customEnd || getToday()} onChange={(event) => setCustomEnd(event.target.value)} /></label>
        </div>}
      </Card>

      {selectedTeachers.length === 0 ? <Card><EmptyState title="Tidak ada guru dalam filter ini" description="Pilih cakupan guru lain untuk melihat analitik kehadiran." /></Card> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Users} label="Guru terdaftar" value={selectedTeachers.length} helper="Akun aktif dalam cakupan" tone="blue" />
          <MetricCard icon={Percent} label="Rata-rata kehadiran" value={`${analytics.attendanceRate.toFixed(1)}%`} helper={`${analytics.totalHadir} hadir dari ${analytics.totalExpected} hari kerja`} tone="green" trend={{ direction: trendDirection, value: trendText }} />
          <MetricCard icon={UserCheck} label="Hadir tepat waktu" value={analytics.tepatWaktu} helper={`${analytics.terlambat} tercatat terlambat`} tone="amber" />
          <MetricCard icon={UserX} label="Total tidak hadir" value={analytics.totalIzin + analytics.totalSakit + analytics.totalAlfa} helper={`Sakit ${analytics.totalSakit} · Izin ${analytics.totalIzin} · Alpa ${analytics.totalAlfa}`} tone="rose" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.85fr)]">
          <Card className="gap-3 p-5">
            <CardHeader className="p-0"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-5 w-5 text-blue-600" aria-hidden="true" />Tren hadir dan tidak hadir</CardTitle><CardDescription className="mt-1">Per hari · {formatRangeLabel(range.start, range.end)}</CardDescription></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{analytics.trend.length} hari</span></div></CardHeader>
            <CardContent className="p-0">
              {analytics.trend.length === 0 ? <EmptyState title="Belum ada data tren" description="Tidak ada hari kerja pada rentang yang dipilih." /> : <>
                <ChartContainer config={chartConfig} className="min-h-[280px] pt-4">
                  <AreaChart data={analytics.trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis dataKey="tanggal" tickLine={false} axisLine={false} minTickGap={18} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="hadir" stroke="var(--color-hadir)" fill="var(--color-hadir)" fillOpacity={0.12} strokeWidth={2.5} dot={false} name="Hadir" />
                    <Area type="monotone" dataKey="tidakHadir" stroke="var(--color-tidakHadir)" fill="var(--color-tidakHadir)" fillOpacity={0.08} strokeWidth={2} dot={false} name="Tidak hadir" />
                  </AreaChart>
                </ChartContainer>
                <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />Hadir</span><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Tidak hadir</span><span className="ml-auto">Tren {trendDirection === 'up' ? 'meningkat' : trendDirection === 'down' ? 'menurun' : 'stabil'} dibanding periode sebelumnya</span></div>
              </>}
            </CardContent>
          </Card>

          <Card className="gap-3 p-5">
            <CardHeader className="p-0"><CardTitle className="text-lg">Komposisi hari ini</CardTitle><CardDescription className="mt-1">Status presensi untuk {formatDisplayDate(getToday())}</CardDescription></CardHeader>
            <CardContent className="p-0">
              {analytics.todayTotal === 0 ? <EmptyState title="Belum ada rekap hari ini" description="Komposisi akan muncul setelah kalender kerja memiliki data." /> : <>
                <div className="relative mx-auto h-[220px] w-full max-w-[280px]">
                  <ChartContainer config={chartConfig} className="h-full min-h-0">
                    <PieChart><Pie data={analytics.todayData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none">{analytics.todayData.map((entry) => <Cell key={entry.key} fill={entry.fill} />)}</Pie><Tooltip content={<ChartTooltipContent hideLabel />} /></PieChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-bold text-foreground">{analytics.todayTotal}</span><span className="text-xs text-muted-foreground">tercatat</span></div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">{analytics.todayData.map((entry) => <div key={entry.key} className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs"><span className="inline-flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.fill }} />{entry.name}</span><strong className="text-foreground">{entry.value}</strong></div>)}</div>
              </>}
            </CardContent>
          </Card>
        </div>

        <Card className="gap-4 p-5">
          <CardHeader className="p-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />Perlu perhatian</CardTitle><CardDescription className="mt-1">Guru dengan ketidakhadiran terbanyak pada periode ini.</CardDescription></div><Button asChild variant="outline" size="sm"><a href="/admin/download-laporan"><FileSpreadsheet aria-hidden="true" />Buka laporan lengkap</a></Button></div></CardHeader>
          <CardContent className="p-0">{attention.length === 0 ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Semua guru dalam cakupan memiliki catatan presensi yang baik pada periode ini.</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{attention.map((item) => <div key={item.teacher.id} className="rounded-xl border border-border bg-background p-3"><p className="truncate text-sm font-semibold text-foreground" title={item.teacher.nama}>{item.teacher.nama}</p><p className="mt-1 text-xs text-muted-foreground">{teacherTypeLabel(getTeacherType(item.teacher))}</p><div className="mt-3 flex items-end justify-between"><span className="text-xs text-muted-foreground">Tidak hadir</span><strong className="text-lg text-rose-600">{item.absent}</strong></div><p className="mt-1 text-[11px] text-muted-foreground">{item.late} kali terlambat</p></div>)}</div>}</CardContent>
        </Card>
      </>}
    </div>
  )
}

export default TrenKehadiran
