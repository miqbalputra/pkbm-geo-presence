import { Notice } from '../ui/page'
import { AttendanceStatus } from '../ui/attendance-status'
import { notify } from '../ui/toast'
import { useState, useEffect } from 'react'
import { Download, Calendar, FileText, Inbox } from 'lucide-react'
import { motion } from 'framer-motion'
import { formatDate, formatDateForInput } from '../../utils/dateUtils'
import jsPDF from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { downloadJsonWorkbook } from '../../utils/excelExport'
import { teacherAttendanceReportAPI } from '../../services/api'


const PRESETS = [
  { days: 7, label: '7 Hari' },
  { days: 30, label: '30 Hari' },
  { days: 90, label: '90 Hari' },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
}
const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
}

function GuruRiwayat({ user }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [revision, setRevision] = useState(0)
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  useEffect(() => {
    const today = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(today.getDate() - 30)
    setStartDate(formatDateForInput(thirtyDaysAgo))
    setEndDate(formatDateForInput(today))
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    if (!startDate || !endDate || !user?.id) return () => { cancelled = true }

    setReportError('')
    if (startDate > endDate) { setReport(null); setLoading(false); setReportError('Tanggal awal tidak boleh melewati tanggal akhir.'); return }
    setLoading(true)
    setReport(null)
    teacherAttendanceReportAPI.getMine(startDate, endDate)
      .then((response) => {
        if (cancelled) return
        const data = response.data || {}
        const summary = data.summary || {}
        setReport({
          ...data,
          summary: {
            totalHari: summary.total_hari ?? 0,
            hadir: summary.hadir ?? 0,
            izin: summary.izin ?? 0,
            sakit: summary.sakit ?? 0,
            alfa: summary.alfa ?? 0,
            persentase: summary.persentase ?? 0,
          },
          rows: (data.rows || []).map((row) => ({
            id: `report-${row.tanggal}`,
            tanggal: row.tanggal,
            jamMasuk: row.jam_masuk || '-',
            jamPulang: row.jam_pulang || '-',
            status: row.status,
            keterangan: row.keterangan || '-',
          })),
        })
      })
      .catch((error) => {
        if (!cancelled) {
          setReport(null)
          setReportError(error.message || 'Laporan presensi belum dapat dimuat.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [startDate, endDate, user?.id, revision])

  const reportRows: any[] = report?.rows || []
  const summary = report?.summary || null

  const filteredLogs = reportRows

  const setPreset = (days) => {
    const today = new Date()
    const pastDate = new Date()
    pastDate.setDate(today.getDate() - days)
    setStartDate(formatDateForInput(pastDate))
    setEndDate(formatDateForInput(today))
  }

  const formatStatusLabel = (status) =>
    status === 'hadir_izin_terlambat'
      ? 'HADIR - IZIN TERLAMBAT'
      : status === 'libur_override'
      ? 'LIBUR KHUSUS'
      : status === 'libur'
      ? 'LIBUR'
      : status.toUpperCase()

  const downloadPDF = () => {
    try {
      const doc: any = new jsPDF()
      doc.setFontSize(16)
      doc.text('Laporan Riwayat Presensi', 14, 15)
      doc.setFontSize(10)
      doc.text(`Nama: ${user?.nama || 'Guru'}`, 14, 25)
      doc.text(`Periode: ${startDate} s/d ${endDate}`, 14, 30)
      const tableData = filteredLogs.map((log) => [
        log.tanggal,
        log.jamMasuk || '-',
        log.jamPulang || '-',
        formatStatusLabel(log.status),
        log.keterangan || '-',
      ])
      autoTable(doc, {
        startY: 35,
        head: [['Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan']],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
      })
      if (summary && summary.totalHari > 0) {
        const finalY = doc.lastAutoTable.finalY + 10
        doc.setFontSize(10)
        doc.text(`Total Hari Kerja: ${summary.totalHari}`, 14, finalY)
        doc.text(`Hadir: ${summary.hadir} hari`, 14, finalY + 5)
        doc.text(`Izin: ${summary.izin} hari`, 14, finalY + 10)
        doc.text(`Sakit: ${summary.sakit} hari`, 14, finalY + 15)
        doc.text(`Alfa: ${summary.alfa} hari`, 14, finalY + 20)
        doc.text(`Persentase Hadir: ${summary.persentase}%`, 14, finalY + 25)
      }
      const safeNama = (user?.nama || 'Guru').replace(/\s+/g, '_')
      const fileName = `Riwayat_Presensi_${safeNama}_${formatDate(new Date())}.pdf`
      const pdfBlob = doc.output('blob')
      const blobUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch (err) {
      console.error('Download PDF error:', err)
      notify('Gagal download PDF: ' + err.message)
    }
  }

  const downloadExcel = async () => {
    try {
      const exportData: Record<string, any>[] = filteredLogs.map((log) => ({
        Tanggal: log.tanggal,
        'Jam Masuk': log.jamMasuk || '-',
        'Jam Pulang': log.jamPulang || '-',
        Status: formatStatusLabel(log.status),
        Keterangan: log.keterangan || '-',
      }))
      if (summary && summary.totalHari > 0) {
        exportData.push({})
        exportData.push({ Tanggal: 'STATISTIK' })
        exportData.push({ Tanggal: 'Total Hari Kerja', 'Jam Masuk': summary.totalHari })
        exportData.push({ Tanggal: 'Hadir', 'Jam Masuk': summary.hadir })
        exportData.push({ Tanggal: 'Izin', 'Jam Masuk': summary.izin })
        exportData.push({ Tanggal: 'Sakit', 'Jam Masuk': summary.sakit })
        exportData.push({ Tanggal: 'Alfa', 'Jam Masuk': summary.alfa })
        exportData.push({ Tanggal: 'Persentase Hadir', 'Jam Masuk': `${summary.persentase}%` })
      }
      const safeNama = (user?.nama || 'Guru').replace(/\s+/g, '_')
      const fileName = `Riwayat_Presensi_${safeNama}_${formatDate(new Date())}.xlsx`
      await downloadJsonWorkbook([{ name: 'Riwayat Presensi', rows: exportData }], fileName)
    } catch (err) {
      console.error('Download Excel error:', err)
      notify('Gagal download Excel: ' + err.message)
    }
  }

  const statCards = [
    { label: 'Hari Kerja', value: summary?.totalHari ?? 0, ring: 'ring-slate-200 dark:ring-slate-700', bg: 'bg-white dark:bg-slate-900', text: 'text-slate-800 dark:text-slate-100' },
    { label: 'Hadir', value: summary?.hadir ?? 0, ring: 'ring-emerald-200 dark:ring-emerald-500/20', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
    { label: 'Izin', value: summary?.izin ?? 0, ring: 'ring-blue-200 dark:ring-blue-500/20', bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-300' },
    { label: 'Sakit', value: summary?.sakit ?? 0, ring: 'ring-rose-200 dark:ring-rose-500/20', bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400' },
    { label: 'Alfa', value: summary?.alfa ?? 0, ring: 'ring-slate-200 dark:ring-slate-700', bg: 'bg-slate-100 dark:bg-slate-800/60', text: 'text-slate-700 dark:text-slate-300' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Riwayat Presensi</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pantau rekam jejak kehadiran Anda dalam periode tertentu.</p>
      </div>

      {reportError && <Notice onRetry={() => setRevision((value) => value + 1)}>{reportError}</Notice>}

      {/* Filter Card */}
      <div className="guru-surface p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="riwayat-start-date" className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Dari Tanggal</label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="riwayat-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
          <div>
            <label htmlFor="riwayat-end-date" className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Sampai Tanggal</label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="riwayat-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              type="button"
              key={p.days}
              onClick={() => setPreset(p.days)}
              className="rounded-lg bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={downloadPDF} disabled={loading || !!reportError || !report}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 active:bg-rose-800 active:scale-[0.99]"
          >
            <Download className="h-4 w-4" /> PDF
          </button>
          <button
            type="button"
            onClick={downloadExcel} disabled={loading || !!reportError || !report}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.99]"
          >
            <FileText className="h-4 w-4" /> Excel
          </button>
        </div>
      </div>

      {/* Statistik Ringkas */}
      {summary && summary.totalHari > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {statCards.map((s, i) => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center ring-1 ring-inset ${s.ring}`}>
              <p className={`text-2xl font-black ${s.text}`}>{s.value}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="guru-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="guru-records-table w-full" aria-label="Riwayat presensi guru">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {['Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <motion.tbody
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="divide-y divide-slate-100 dark:divide-slate-800"
            >
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <div className="inline-flex flex-col items-center gap-3">
                      <div className="relative h-8 w-8">
                        <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-slate-700" />
                        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400" />
                      </div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Memuat data...</p>
                    </div>
                  </td>
                </tr>
              ) : reportError ? <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Laporan belum tersedia karena gagal dimuat.</td></tr> : filteredLogs.length > 0 ? (
                  filteredLogs.slice().reverse().map((log) => (
                    <motion.tr
                      key={log.id}
                      variants={rowVariants}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td data-label="Tanggal" className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{log.tanggal}</td>
                      <td data-label="Jam masuk" className="whitespace-nowrap px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{log.jamMasuk || '-'}</td>
                      <td data-label="Jam pulang" className="whitespace-nowrap px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{log.jamPulang || '-'}</td>
                      <td data-label="Status" className="whitespace-nowrap px-4 py-3">
                        <AttendanceStatus status={log.status} />
                      </td>
                      <td data-label="Keterangan" className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{log.keterangan && log.keterangan !== '-' ? <details><summary className="cursor-pointer py-2">Lihat keterangan</summary><p className="whitespace-pre-wrap break-words py-2">{log.keterangan}</p></details> : '-'}</td>
                    </motion.tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                        <Inbox className="h-7 w-7" />
                      </span>
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Tidak ada data pada periode ini</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Coba ubah rentang tanggal di atas</p>
                    </div>
                  </td>
                </tr>
              )}
            </motion.tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default GuruRiwayat
