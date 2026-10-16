import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle2, Clock3, Download, HardDrive, RefreshCw, ShieldCheck, TriangleAlert, Upload } from 'lucide-react'
import { backupAPI } from '../../services/api'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'

function formatDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatSize(value) {
  if (!value) return '-'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

function statusBadge(status): { label: string; variant: 'default' | 'warning' | 'danger' | 'success' | 'neutral' } {
  if (status === 'succeeded') return { label: 'Berhasil', variant: 'success' }
  if (status === 'failed') return { label: 'Gagal', variant: 'danger' }
  if (status === 'expired') return { label: 'Kedaluwarsa', variant: 'neutral' }
  if (status === 'running') return { label: 'Sedang diproses', variant: 'warning' }
  return { label: 'Menunggu', variant: 'neutral' }
}

function BackupPemulihan() {
  const [jobs, setJobs] = useState([])
  const [restoreHistory, setRestoreHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyKind, setBusyKind] = useState('')
  const [message, setMessage] = useState(null)
  const [restoreFile, setRestoreFile] = useState(null)
  const [restoreBackup, setRestoreBackup] = useState(null)
  const [restorePhrase, setRestorePhrase] = useState('')
  const [restoreJob, setRestoreJob] = useState(null)
  const [restoreProgress, setRestoreProgress] = useState(0)
  const [restoreBusy, setRestoreBusy] = useState(false)

  const loadJobs = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const [response, restoreResponse] = await Promise.all([backupAPI.list(), backupAPI.listRestores()])
      setJobs(response.data || [])
      setRestoreHistory(restoreResponse.data || [])
    } catch (error) {
      if (!silent) setMessage({ type: 'error', text: error.message || 'Daftar backup gagal dimuat.' })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
    const interval = setInterval(() => loadJobs(true), 5000)
    return () => clearInterval(interval)
  }, [loadJobs])

  useEffect(() => {
    if (!restoreJob?.id || ['succeeded', 'failed'].includes(restoreJob.status)) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const response = await backupAPI.getRestoreStatus(restoreJob.id)
        if (!cancelled && response.data) setRestoreJob(response.data)
      } catch (error) {
        if (!cancelled) setMessage({ type: 'error', text: error.message || 'Status restore gagal dimuat.' })
      }
    }
    const interval = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [restoreJob?.id, restoreJob?.status])

  const activeJob = useMemo(() => jobs.find((job) => ['queued', 'running'].includes(job.status)), [jobs])

  const createBackup = async (kind) => {
    if (activeJob) {
      setMessage({ type: 'error', text: 'Tunggu backup yang sedang berjalan selesai terlebih dahulu.' })
      return
    }
    try {
      setBusyKind(kind)
      setMessage(null)
      const dateKey = new Date().toISOString().replace(/[-:.TZ]/g, '')
      await backupAPI.create(kind, `admin-${kind}-${dateKey}`)
      setMessage({ type: 'success', text: `${kind === 'full' ? 'Full backup' : 'SQL backup'} sedang diproses.` })
      await loadJobs(true)
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Backup gagal dibuat.' })
    } finally {
      setBusyKind('')
    }
  }

  const verifyBackup = async (id) => {
    try {
      await backupAPI.verify(id)
      setMessage({ type: 'success', text: 'Checksum backup valid.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Verifikasi backup gagal.' })
    }
  }

  const uploadRestore = async () => {
    if (!restoreFile) {
      setMessage({ type: 'error', text: 'Pilih file .sql.gz atau .full.tar.gz terlebih dahulu.' })
      return
    }
    const lowerName = restoreFile.name.toLowerCase()
    if (!lowerName.endsWith('.sql.gz') && !lowerName.endsWith('.full.tar.gz')) {
      setMessage({ type: 'error', text: 'Format artifact restore harus .sql.gz atau .full.tar.gz.' })
      return
    }
    try {
      setRestoreBusy(true)
      setRestoreProgress(0)
      setRestoreBackup(null)
      setRestoreJob(null)
      setMessage(null)
      const started = await backupAPI.startRestoreUpload(restoreFile.name, restoreFile.size)
      const upload = started.data
      let offset = 0
      const chunkSize = 8 * 1024 * 1024
      while (offset < restoreFile.size) {
        const chunk = new Uint8Array(await restoreFile.slice(offset, offset + chunkSize).arrayBuffer())
        const response = await backupAPI.appendRestoreUpload(upload.id, offset, chunk)
        offset += chunk.byteLength
        setRestoreProgress(Math.round((offset / restoreFile.size) * 100))
        if (response.data?.backup) setRestoreBackup(response.data.backup)
      }
      setMessage({ type: 'success', text: 'Artifact tervalidasi dan siap dipulihkan.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Upload artifact restore gagal.' })
    } finally {
      setRestoreBusy(false)
    }
  }

  const startRestore = async () => {
    if (!restoreBackup || !restorePhrase.trim()) {
      setMessage({ type: 'error', text: 'Masukkan phrase konfirmasi sesuai format yang diminta.' })
      return
    }
    try {
      const response = await backupAPI.restore(restoreBackup.id, restorePhrase.trim())
      setRestoreJob(response.data)
      setMessage({ type: 'success', text: 'Job restore dibuat. Sistem akan masuk maintenance setelah pre-restore backup berhasil.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Restore belum dapat dimulai.' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-normal text-blue-600">Perlindungan data</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Backup &amp; Pemulihan</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Buat salinan database yang dapat diverifikasi sebelum dikirim ke Google Drive atau S3 melalui workflow n8n.</p>
        </div>
        <Button variant="outline" onClick={() => loadJobs()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      {message && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {message.type === 'error' ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-blue-100 bg-card">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg"><Archive className="h-5 w-5 text-blue-600" /> SQL Backup</CardTitle>
                <CardDescription className="mt-2">Dump schema dan seluruh data MySQL dalam format terkompresi.</CardDescription>
              </div>
              <div className="rounded-xl bg-blue-100 p-3 text-blue-700"><HardDrive className="h-5 w-5" /></div>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={() => createBackup('sql')} disabled={Boolean(activeJob) || busyKind === 'sql'}>
              {busyKind === 'sql' ? <RefreshCw className="animate-spin" /> : <Archive />} Buat SQL Backup
            </Button>
          </CardContent>
        </Card>

        <Card className="border-violet-100 bg-card">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-violet-600" /> Full Backup</CardTitle>
                <CardDescription className="mt-2">SQL backup, manifest schema, jumlah record, dan checksum dalam satu paket.</CardDescription>
              </div>
              <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Archive className="h-5 w-5" /></div>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={() => createBackup('full')} disabled={Boolean(activeJob) || busyKind === 'full'}>
              {busyKind === 'full' ? <RefreshCw className="animate-spin" /> : <ShieldCheck />} Buat Full Backup
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat backup</CardTitle>
          <CardDescription>Artifact lokal tersedia sementara. Workflow n8n dapat mengambilnya menggunakan API key backup khusus.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><RefreshCw className="animate-spin" /> Memuat riwayat backup...</div>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">Belum ada backup yang dibuat.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-3">Jenis</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Dibuat</th><th className="px-3 py-3">Ukuran</th><th className="px-3 py-3">Checksum</th><th className="px-3 py-3 text-right">Aksi</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => {
                    const badge = statusBadge(job.status)
                    return (
                      <tr key={job.id} className="hover:bg-slate-50">
                        <td className="px-3 py-4 font-semibold text-slate-800">{job.kind === 'full' ? 'Full backup' : 'SQL backup'}<div className="mt-1 max-w-[220px] truncate text-xs font-normal text-slate-400">{job.fileName || job.id}</div></td>
                        <td className="px-3 py-4"><Badge variant={badge.variant}>{badge.label}</Badge>{job.errorMessage && <div className="mt-1 max-w-[220px] text-xs text-rose-600">{job.errorMessage}</div>}</td>
                        <td className="px-3 py-4 text-slate-600"><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{formatDate(job.requestedAt)}</span></td>
                        <td className="px-3 py-4 text-slate-600">{formatSize(job.fileSize)}</td>
                        <td className="px-3 py-4"><code className="text-xs text-slate-500">{job.sha256 ? `${job.sha256.slice(0, 12)}…` : '-'}</code></td>
                        <td className="px-3 py-4"><div className="flex justify-end gap-2">{job.status === 'succeeded' && <><Button size="sm" variant="outline" onClick={() => verifyBackup(job.id)}>Verifikasi</Button><Button size="sm" onClick={() => backupAPI.download(job.id)}><Download /> Unduh</Button></>}</div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-900"><TriangleAlert className="h-5 w-5" /> Pemulihan production dikunci</CardTitle>
          <CardDescription className="text-amber-800">Restore production baru boleh diaktifkan setelah backup dan restore drill di staging lulus. Saat aktif, sistem akan membuat pre-restore backup, mengaktifkan maintenance mode, dan meminta phrase konfirmasi dinamis.</CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-rose-200 bg-rose-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-rose-900"><Upload className="h-5 w-5" /> Upload artifact restore</CardTitle>
          <CardDescription className="text-rose-800">Upload dilakukan bertahap 8 MB, lalu file diverifikasi sebelum dapat dipakai. Feature flag restore production tetap harus aktif di environment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input type="file" accept=".gz,.sql.gz,.full.tar.gz" onChange={(event) => { setRestoreFile(event.target.files?.[0] || null); setRestoreBackup(null); setRestorePhrase('') }} disabled={restoreBusy} />
            <Button variant="outline" onClick={uploadRestore} disabled={restoreBusy || !restoreFile}>
              {restoreBusy ? <RefreshCw className="animate-spin" /> : <Upload />} {restoreBusy ? `Upload ${restoreProgress}%` : 'Upload & Verifikasi'}
            </Button>
          </div>
          {restoreBackup && (
            <div className="space-y-3 rounded-xl border border-rose-200 bg-white p-4">
              <div className="text-sm text-slate-600">Artifact siap: <code className="font-semibold text-slate-900">{restoreBackup.id}</code> · {formatSize(restoreBackup.fileSize)} · <code>{restoreBackup.sha256?.slice(0, 16)}…</code></div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input value={restorePhrase} onChange={(event) => setRestorePhrase(event.target.value)} placeholder={`RESTORE PRODUCTION ${restoreBackup.id.toUpperCase()}`} aria-label="Phrase konfirmasi restore" />
                <Button variant="danger" onClick={startRestore} disabled={restoreJob?.status === 'running' || restoreJob?.status === 'preparing'}>Mulai Restore Production</Button>
              </div>
              <p className="text-xs text-rose-700">Tindakan ini membuat pre-restore backup dan memblokir operasi tulis selama import. Tidak ada rollback otomatis.</p>
            </div>
          )}
          {restoreJob && <div className="text-sm text-slate-600">Status restore: <Badge variant={restoreJob.status === 'succeeded' ? 'success' : restoreJob.status === 'failed' ? 'danger' : 'warning'}>{restoreJob.status}</Badge>{restoreJob.errorMessage && <span className="ml-2 text-rose-700">{restoreJob.errorMessage}</span>}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat pemulihan</CardTitle>
          <CardDescription>Setiap restore menyimpan status, backup sumber, dan pre-restore backup untuk audit.</CardDescription>
        </CardHeader>
        <CardContent>
          {restoreHistory.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">Belum ada proses restore.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Restore ID</th><th className="px-3 py-3">Backup sumber</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Pre-restore backup</th><th className="px-3 py-3">Mulai</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {restoreHistory.map((restore) => (
                    <tr key={restore.id}>
                      <td className="px-3 py-4 font-mono text-xs text-slate-600">{restore.id.slice(0, 12)}…</td>
                      <td className="px-3 py-4 font-mono text-xs text-slate-600">{restore.backupId?.slice(0, 12)}…</td>
                      <td className="px-3 py-4"><Badge variant={restore.status === 'succeeded' ? 'success' : restore.status === 'failed' ? 'danger' : 'warning'}>{restore.status}</Badge></td>
                      <td className="px-3 py-4 font-mono text-xs text-slate-600">{restore.preRestoreBackupId?.slice(0, 12) || '-'}</td>
                      <td className="px-3 py-4 text-slate-600">{formatDate(restore.startedAt || restore.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default BackupPemulihan
