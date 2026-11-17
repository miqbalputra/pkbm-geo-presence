import { useEffect, useRef, useState } from 'react'
import { RefreshCw, ShieldCheck, Undo2 } from 'lucide-react'
import { bulkAttendanceCorrectionAPI as api } from '../../services/api'
import { Button } from '../ui/button'
import { AppDialog } from '../ui/dialog'
import { Notice } from '../ui/page'

const jakartaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
const statusLabel = (status: string) => ({ hadir: 'Hadir', hadir_terlambat: 'Terlambat', hadir_izin_terlambat: 'Terlambat dengan izin' }[status] || status)
type Change = { id: number; nama: string; date: string; category: string; pokjar: string; jam_masuk: string; target: string; target_label: string; old_status: string; new_status: string; old_keterangan: string; new_keterangan: string }

function ChangeTable({ items }: { items: Change[] }) {
  const [page, setPage] = useState(0)
  const lastPage = Math.max(0, Math.ceil(items.length / 25) - 1)
  const currentPage = Math.min(page, lastPage)
  return <div className="mt-4">
    <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[700px] text-left text-sm">
      <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Guru / kategori', 'Tanggal / jam tercatat', 'Acuan', 'Sebelum', 'Sesudah'].map(text => <th key={text} className="p-3">{text}</th>)}</tr></thead>
      <tbody>{items.slice(currentPage * 25, (currentPage + 1) * 25).map(item => <tr key={item.id} className="border-t border-border align-top">
        <td className="p-3 font-medium">{item.nama}<span className="mt-1 block text-xs font-normal text-muted-foreground">{item.category === 'pokjar' ? `Pokjar · ${item.pokjar}` : 'PKBM Pusat'}</span></td>
        <td className="p-3">{item.date}<span className="block text-xs text-muted-foreground">{item.jam_masuk || 'Jam tidak tercatat'}</span></td>
        <td className="p-3">{item.category === 'pokjar' ? 'Kehadiran pada tanggal tersebut' : `${item.target.slice(0, 5)} WIB ${item.target_label}`}</td>
        <td className="max-w-56 p-3">{statusLabel(item.old_status)}<span className="mt-1 block whitespace-pre-wrap break-words text-xs text-muted-foreground">{item.old_keterangan || 'Tanpa catatan'}</span></td>
        <td className="max-w-56 p-3 font-medium text-emerald-700">{statusLabel(item.new_status)}<span className="mt-1 block whitespace-pre-wrap break-words text-xs font-normal text-muted-foreground">{item.new_keterangan || 'Tanpa catatan'}</span></td>
      </tr>)}</tbody>
    </table></div>
    {items.length > 25 && <div className="mt-2 flex items-center justify-end gap-3 text-sm"><Button type="button" variant="outline" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Sebelumnya</Button><span>Halaman {currentPage + 1} dari {lastPage + 1}</span><Button type="button" variant="outline" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Berikutnya</Button></div>}
  </div>
}

export function BulkAttendanceCorrection({ normalTime }: { normalTime: string }) {
  const [form, setForm] = useState(() => ({ start_date: jakartaToday(), end_date: jakartaToday(), scope: 'pusat', normal_time: (normalTime || '07:20').slice(0, 5), reason: '' }))
  const [preview, setPreview] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyError, setHistoryError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmApply, setConfirmApply] = useState(false)
  const [undoBatch, setUndoBatch] = useState<any>(null)
  const [details, setDetails] = useState<any>(null)
  const [detailsLoading, setDetailsLoading] = useState('')
  const requestID = useRef(0)

  const loadHistory = async () => {
    try { const response = await api.history(); setHistory(response.data || []); setHistoryError('') }
    catch (e) { setHistoryError(e.message || 'Riwayat perbaikan belum dapat dimuat.') }
  }
  useEffect(() => { void loadHistory(); return () => { requestID.current++ } }, [])

  const changeField = (key: string, value: string) => {
    requestID.current++
    setForm(current => ({ ...current, [key]: value })); setPreview(null); setError(''); setSuccess(''); setLoading(false)
  }
  const loadPreview = async () => {
    const id = ++requestID.current
    setLoading(true); setPreview(null); setError(''); setSuccess('')
    try { const response = await api.preview(form); if (requestID.current === id) setPreview(response.data) }
    catch (e) { if (requestID.current === id) setError(e.message || 'Pratinjau gagal dimuat.') }
    finally { if (requestID.current === id) setLoading(false) }
  }
  const apply = async () => {
    if (!preview?.changed || busy) return
    setBusy(true); setError('')
    try {
      const response = await api.apply(preview.options, preview.preview_hash)
      setSuccess(`${response.message}. ${response.data.changed} catatan disesuaikan. Kode koreksi: ${response.data.id}`)
      setPreview(null); setConfirmApply(false); await loadHistory()
    } catch (e) {
      setError((e.message || 'Perbaikan gagal.') + ' Periksa riwayat lalu buat pratinjau baru sebelum mencoba kembali.')
      setPreview(null); setConfirmApply(false); await loadHistory()
    } finally { setBusy(false) }
  }
  const undo = async () => {
    if (!undoBatch || busy) return
    setBusy(true); setError('')
    try { const response = await api.undo(undoBatch.id); setSuccess(response.message); setUndoBatch(null); setPreview(null); await loadHistory() }
    catch (e) { setError(e.message || 'Pembatalan gagal.'); setUndoBatch(null) }
    finally { setBusy(false) }
  }
  const showDetails = async (id: string) => {
    setDetailsLoading(id); setError('')
    try { const response = await api.details(id); setDetails(response.data) }
    catch (e) { setError(e.message || 'Rincian belum dapat dimuat.') }
    finally { setDetailsLoading('') }
  }
  const scopeLabel = (scope: string) => ({ pusat: 'PKBM Pusat', pokjar: 'Pokjar', all: 'Pusat dan Pokjar' }[scope] || scope)

  return <section aria-labelledby="bulk-correction-title" className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
    <h3 id="bulk-correction-title" className="text-lg font-semibold text-slate-900">Perbaikan bulk karena salah jam masuk</h3>
    <p className="mt-2 text-sm leading-6 text-slate-700">Pilih rentang tanggal yang terdampak. Sistem memeriksa keterlambatan yang sudah tercatat; catatan Hadir tidak akan diberi keterlambatan baru.</p>
    <div className="my-4 grid gap-3 md:grid-cols-2">
      <p className="rounded-lg bg-white p-3 text-sm leading-6"><strong>PKBM Pusat:</strong> memakai jam normal koreksi di bawah. Jadwal piket berdasarkan grup dan pekan, apel Senin, serta agenda khusus tetap didahulukan.</p>
      <p className="rounded-lg bg-white p-3 text-sm leading-6"><strong>Pokjar:</strong> catatan hadir dinormalkan menjadi Hadir berdasarkan tanggal, tanpa penilaian jam masuk atau piket. Izin dan sakit tetap tersimpan.</p>
    </div>
    <fieldset disabled={busy || confirmApply} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1 text-sm font-medium">Tanggal awal<input className="ui-input" type="date" max={jakartaToday()} value={form.start_date} onChange={e => changeField('start_date', e.target.value)} /></label>
      <label className="grid gap-1 text-sm font-medium">Tanggal akhir<input className="ui-input" type="date" min={form.start_date} max={jakartaToday()} value={form.end_date} onChange={e => changeField('end_date', e.target.value)} /></label>
      <label className="grid gap-1 text-sm font-medium">Kategori perbaikan<select className="ui-input" value={form.scope} onChange={e => changeField('scope', e.target.value)}><option value="pusat">PKBM Pusat saja</option><option value="pokjar">Pokjar saja</option><option value="all">Pusat dan Pokjar</option></select></label>
      {form.scope !== 'pokjar' && <label className="grid gap-1 text-sm font-medium">Jam normal koreksi Pusat (WIB)<input className="ui-input" type="time" value={form.normal_time} onChange={e => changeField('normal_time', e.target.value)} /></label>}
      <label className="grid gap-1 text-sm font-medium sm:col-span-2 xl:col-span-4">Alasan perbaikan<textarea className="ui-input" rows={2} maxLength={500} placeholder="Contoh: jam masuk normal salah tersetel 07.00; seharusnya 07.20 WIB." value={form.reason} onChange={e => changeField('reason', e.target.value)} /></label>
    </fieldset>
    <p className="mt-3 text-xs leading-5 text-slate-600">Maksimal 366 hari. Jam koreksi hanya digunakan untuk rentang ini; pengaturan global tetap terpisah. Jam presensi, GPS, catatan manual, izin, sakit, Alfa, dan arsip rekap terkonfirmasi dipertahankan. Kategori dan jadwal memakai konfigurasi saat ini. Pisahkan rentang jika kategori atau jadwal guru pernah berubah.</p>
    <Button type="button" variant="outline" className="mt-4 bg-white" disabled={loading || busy || confirmApply || !form.start_date || !form.end_date || form.reason.trim().length < 5 || (form.scope !== 'pokjar' && !form.normal_time)} onClick={loadPreview}><RefreshCw className={loading ? 'animate-spin' : ''} />{loading ? 'Memeriksa presensi…' : 'Buat pratinjau bulk'}</Button>
    {error && <div className="mt-4"><Notice>{error}</Notice></div>}
    {success && <div className="mt-4"><Notice tone="success">{success}</Notice></div>}
    {preview && <div className="mt-4 rounded-lg border border-amber-200 bg-white p-4" aria-live="polite">
      <h4 className="font-semibold">{preview.changed} catatan perlu diperbaiki dari {preview.processed} catatan hadir yang diperiksa</h4>
      <p className="mt-1 text-sm text-muted-foreground">PKBM Pusat: {preview.pusat_changed} · Pokjar: {preview.pokjar_changed}</p>
      <p className="mt-1 text-xs text-muted-foreground">Dilewati: {preview.skipped_no_time} tanpa jam valid (Pusat), {preview.skipped_non_workday} pada hari nonkerja (Pusat), {preview.skipped_no_user} tanpa profil guru.</p>
      {preview.changed > 0 && <><ChangeTable key={preview.preview_hash} items={preview.items} /><Button type="button" className="mt-4" disabled={busy} onClick={() => setConfirmApply(true)}><ShieldCheck />Tinjau dan terapkan {preview.changed} koreksi</Button></>}
    </div>}
    <div className="mt-6 border-t border-amber-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Riwayat dan pembatalan koreksi</h4><Button type="button" variant="ghost" disabled={busy} onClick={loadHistory}>Perbarui riwayat</Button></div>
      {historyError && <Notice onRetry={loadHistory}>{historyError}</Notice>}
      {!historyError && !history.length && <p className="mt-2 text-sm text-muted-foreground">Belum ada perbaikan bulk.</p>}
      <div className="mt-2 space-y-2">{history.map(batch => <div key={batch.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white p-3 text-sm">
        <div><p className="font-medium">{batch.start_date} – {batch.end_date} · {scopeLabel(batch.scope)} · {batch.changed} catatan</p><p className="mt-1 text-xs text-muted-foreground">{batch.reason} · {batch.undone_at ? 'Dibatalkan' : 'Diterapkan'}</p><p className="mt-1 text-xs text-muted-foreground">{batch.id}</p></div>
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || !!detailsLoading} onClick={() => showDetails(batch.id)}>{detailsLoading === batch.id ? 'Memuat…' : 'Rincian'}</Button>{!batch.undone_at && <Button type="button" variant="outline" disabled={busy} onClick={() => setUndoBatch(batch)}><Undo2 />Batalkan koreksi</Button>}</div>
      </div>)}</div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Pembatalan mengembalikan status dan catatan sebelumnya. Jika salah satu presensi sudah diedit lagi atau telah presensi pulang setelah koreksi, seluruh pembatalan ditolak agar perubahan terbaru tetap aman.</p>
    </div>
    <AppDialog open={confirmApply} onOpenChange={setConfirmApply} busy={busy} title="Terapkan perbaikan bulk?" description="Periksa kategori dan rentang tanggal sebelum menyimpan.">
      {preview && <div className="space-y-3 text-sm"><p>{preview.options.start_date} – {preview.options.end_date} · {scopeLabel(preview.options.scope)}</p><p><strong>{preview.pusat_changed} PKBM Pusat</strong> dan <strong>{preview.pokjar_changed} Pokjar</strong> akan diperbaiki.</p>{preview.options.scope !== 'pokjar' && <p>Jam normal koreksi Pusat: {preview.options.normal_time} WIB. Jadwal piket dan agenda khusus tetap berlaku.</p>}<p>{preview.options.reason}</p><p>Salinan sebelum perubahan disimpan otomatis. Jika data atau aturan berubah sejak pratinjau, proses akan ditolak.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmApply(false)}>Kembali</Button><Button type="button" disabled={busy} onClick={apply}>{busy ? 'Menyimpan…' : 'Terapkan koreksi'}</Button></div></div>}
    </AppDialog>
    <AppDialog open={!!undoBatch} onOpenChange={open => { if (!open) setUndoBatch(null) }} busy={busy} title="Batalkan koreksi bulk?" description="Status dan catatan akan dikembalikan ke kondisi sebelum koreksi ini."><p className="text-sm">{undoBatch?.start_date} – {undoBatch?.end_date} · {undoBatch?.changed} catatan</p><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setUndoBatch(null)}>Kembali</Button><Button type="button" disabled={busy} onClick={undo}>{busy ? 'Memulihkan…' : 'Pulihkan kondisi sebelumnya'}</Button></div></AppDialog>
    <AppDialog open={!!details} onOpenChange={open => { if (!open) setDetails(null) }} title="Rincian koreksi bulk" description={details ? `${details.batch.start_date} – ${details.batch.end_date} · ${details.batch.reason}` : ''} className="bulk-correction-details">{details && <ChangeTable items={details.items} />}</AppDialog>
  </section>
}
