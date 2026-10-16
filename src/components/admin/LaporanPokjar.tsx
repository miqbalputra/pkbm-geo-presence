import { useEffect, useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { PageHeader, Notice, PageLoading, EmptyState } from '../ui/page'
import { guruAPI, presensiAPI } from '../../services/api'
import { downloadJsonWorkbook } from '../../utils/excelExport'

const POKJAR = ['Lentera Qalbu', 'Umar bin Khattab', 'Nashirus Sunnah']
const BADGE: Record<string, string> = {
  'Lentera Qalbu': 'bg-violet-50 text-violet-700 ring-violet-200',
  'Umar bin Khattab': 'bg-teal-50 text-teal-700 ring-teal-200',
  'Nashirus Sunnah': 'bg-orange-50 text-orange-700 ring-orange-200',
}
const jakartaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date)
const statusLabel = (status: string) => status?.startsWith('hadir') ? 'Hadir' : status === 'izin' ? 'Izin' : status === 'sakit' ? 'Sakit' : status || '-'

function LaporanPokjar() {
  const today = jakartaDate()
  const [startDate, setStartDate] = useState(() => `${today.slice(0, 7)}-01`)
  const [endDate, setEndDate] = useState(today)
  const [selectedPokjar, setSelectedPokjar] = useState('')
  const [guru, setGuru] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!startDate || !endDate || startDate > endDate) {
        setError('Rentang tanggal tidak valid.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const [guruResponse, logResponse] = await Promise.all([
          guruAPI.getAllIncludingArchived(),
          presensiAPI.getAll({ start_date: startDate, end_date: endDate }),
        ])
        if (cancelled) return
        setGuru(guruResponse.data || [])
        setLogs(logResponse.data || [])
      } catch (failure: any) {
        if (!cancelled) setError(failure.message || 'Data laporan Pokjar belum dapat dimuat.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [startDate, endDate, reloadVersion])

  const pokjarByUser = useMemo(() => new Map(guru.filter((item) => item.pokjar).map((item) => [String(item.id), item.pokjar])), [guru])
  const pokjarLogs = useMemo(() => logs.filter((log) => {
    const pokjar = pokjarByUser.get(String(log.user_id ?? log.userId))
    return pokjar && (!selectedPokjar || pokjar === selectedPokjar) &&
      (log.status?.startsWith('hadir') || log.status === 'izin' || log.status === 'sakit')
  }).sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal))), [logs, pokjarByUser, selectedPokjar])
  const teachers = guru.filter((item) => item.pokjar && (!selectedPokjar || item.pokjar === selectedPokjar))

  const exportExcel = async () => {
    setExporting(true)
    try {
      const sheets = (selectedPokjar ? [selectedPokjar] : POKJAR).map((pokjar) => {
        const rows = pokjarLogs.filter((log) => pokjarByUser.get(String(log.user_id ?? log.userId)) === pokjar)
          .map((log) => ({ 'Nama Guru': log.nama, Tanggal: log.tanggal, Status: statusLabel(log.status), Keterangan: log.keterangan || '-' }))
        return { name: pokjar, rows: [
          { 'Nama Guru': `RINGKASAN POKJAR ${pokjar}`, Tanggal: `Hadir: ${rows.filter((row) => row.Status === 'Hadir').length}`, Status: `Izin: ${rows.filter((row) => row.Status === 'Izin').length}`, Keterangan: `Sakit: ${rows.filter((row) => row.Status === 'Sakit').length}` },
          ...rows,
        ] }
      })
      await downloadJsonWorkbook(sheets, `Laporan_Pokjar_${startDate}_${endDate}.xlsx`)
    } catch (failure: any) {
      setError(failure.message || 'File Excel gagal dibuat.')
    } finally {
      setExporting(false)
    }
  }

  return <div className="space-y-5">
    <PageHeader title="Laporan Pokjar" description="Rekap presensi sederhana guru Pokjar: Hadir, Izin, dan Sakit." actions={<button type="button" className="ui-button ui-button-primary" onClick={() => void exportExcel()} disabled={loading || exporting || pokjarLogs.length === 0}><Download className="h-4 w-4" />{exporting ? 'Membuat file…' : 'Export Excel'}</button>} />
    {error && <Notice tone="error" onRetry={() => setReloadVersion((value) => value + 1)}>{error}</Notice>}
    <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
      <label className="grid gap-1 text-sm font-medium">Dari tanggal<input className="ui-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
      <label className="grid gap-1 text-sm font-medium">Sampai tanggal<input className="ui-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
      <label className="grid gap-1 text-sm font-medium">Pokjar<select className="ui-input" value={selectedPokjar} onChange={(event) => setSelectedPokjar(event.target.value)}><option value="">Semua Pokjar</option>{POKJAR.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </section>
    {loading ? <PageLoading /> : <>
      <section className="grid gap-3 sm:grid-cols-3">
        {(selectedPokjar ? [selectedPokjar] : POKJAR).map((pokjar) => {
          const rows = pokjarLogs.filter((log) => pokjarByUser.get(String(log.user_id ?? log.userId)) === pokjar)
          return <article key={pokjar} className="rounded-xl border border-border bg-card p-4"><div className="mb-4 flex items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${BADGE[pokjar]}`}>{pokjar}</span><span className="text-xs text-muted-foreground">{teachers.filter((item) => item.pokjar === pokjar).length} guru</span></div><div className="grid grid-cols-3 text-center"><div><strong className="block text-xl text-emerald-600">{rows.filter((row) => row.status?.startsWith('hadir')).length}</strong><span className="text-xs text-muted-foreground">Hadir</span></div><div><strong className="block text-xl text-amber-600">{rows.filter((row) => row.status === 'izin').length}</strong><span className="text-xs text-muted-foreground">Izin</span></div><div><strong className="block text-xl text-rose-600">{rows.filter((row) => row.status === 'sakit').length}</strong><span className="text-xs text-muted-foreground">Sakit</span></div></div></article>
        })}
      </section>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3"><FileText className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">Detail presensi ({pokjarLogs.length})</h2></div>
        {pokjarLogs.length === 0 ? <EmptyState title="Belum ada catatan Pokjar" description="Pilih rentang lain atau periksa kembali penugasan guru Pokjar." /> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Nama guru</th><th className="px-4 py-3">Pokjar</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Keterangan</th></tr></thead><tbody className="divide-y divide-border">{pokjarLogs.map((log) => { const pokjar = pokjarByUser.get(String(log.user_id ?? log.userId)) || ''; return <tr key={log.id}><td className="px-4 py-3 font-medium">{log.nama}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ring-1 ${BADGE[pokjar] || ''}`}>{pokjar}</span></td><td className="px-4 py-3">{log.tanggal}</td><td className="px-4 py-3">{statusLabel(log.status)}</td><td className="px-4 py-3 text-muted-foreground">{log.keterangan || '-'}</td></tr> })}</tbody></table></div>}
      </section>
    </>}
  </div>
}

export default LaporanPokjar
