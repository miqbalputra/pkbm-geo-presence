import { useState, useEffect } from 'react'
import { Download, FileText, Users, User } from 'lucide-react'
import { formatDate, formatDateForInput } from '../../utils/dateUtils'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { guruAPI, jadwalPiketAPI } from '../../services/api'
import { useGuruReport } from '../../hooks/useGuruReport'

// Parse CSV pekan ("1,3") -> [1,3]. Menggantikan gp_parse_piket_weeks backend.
const parsePiketWeeks = (value) => {
  const out = []
  String(value ?? '').split(/[\s,]+/).forEach((part) => {
    part = part.trim()
    if (part === '') return
    const n = parseInt(part, 10)
    if (n >= 1 && n <= 5) out.push(n)
  })
  return out
}

// Mirror backend gp_get_piket: apakah guru piket pada dateStr (YYYY-MM-DD)?
// guru = { piket_group } (group 'A'/'B'); bila diluar itu -> tidak piket.
const isGuruPiketOnDate = (guru, config, dateStr) => {
  if (!config || String(config.piket_rotation_enabled) !== '1') return false
  const group = guru?.piket_group
  if (group !== 'A' && group !== 'B') return false

  const date = new Date(dateStr + 'T00:00:00')
  const day = date.getDate()
  const week = Math.floor((day - 1) / 7) + 1

  if (week >= 5) {
    const mode = config.piket_week5_mode || 'all'
    if (mode === 'none') return false
    if (mode === 'A') return group === 'A'
    if (mode === 'B') return group === 'B'
    return true // 'all' (default)
  }
  const weeks = parsePiketWeeks(
    group === 'A'
      ? (config.piket_group_a_weeks || '1,3')
      : (config.piket_group_b_weeks || '2,4')
  )
  return weeks.includes(week)
}

// Jam piket untuk tanggal tertentu — sama untuk semua piket hari itu.
const getPiketJam = (config) => ({
  jamMasuk: String(config?.piket_jam_masuk || '07:00').slice(0, 5),
  jamPulang: String(config?.piket_jam_pulang || '13:00').slice(0, 5),
})

function DownloadLaporan() {
  const [activeTab, setActiveTab] = useState('semua') // 'semua' or 'individu'
  const [dataGuru, setDataGuru] = useState([])
  const [selectedGuru, setSelectedGuru] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [piketConfig, setPiketConfig] = useState(null)
  const [piketGroupMap, setPiketGroupMap] = useState({})
  const [notification, setNotification] = useState({ show: false, message: '' })
  const [loading, setLoading] = useState(true)

  // Shared report hook — same data source as Guru "Riwayat" menu.
  // allGuru=true agar seluruh presensi & workdays guru dimuat untuk admin.
  const {
    attendanceLogs,
    getGuruSummary: getGuruSummaryFromHook,
    getGuruReportRows: getGuruReportRowsFromHook,
  } = useGuruReport(null, startDate, endDate, { allGuru: true })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [guruResponse, piketResponse] = await Promise.all([
        guruAPI.getAllIncludingArchived(),
        jadwalPiketAPI.getRotation(),
      ])

      setDataGuru(guruResponse.data)
      setPiketConfig(piketResponse.data.config)
      // Map user_id -> piket_group. Guru yang tidak ada di daftar rotasi
      // (mis. arsip) diperlakukan sebagai tidak piket (group undefined).
      const groupMap = {}
      ;(piketResponse.data.guru || []).forEach(g => {
        groupMap[g.user_id] = g.piket_group
      })
      setPiketGroupMap(groupMap)
    } catch (error) {
      console.error('Failed to load data:', error)
      showNotification('Gagal memuat data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (dataGuru.length > 0) {
      const today = new Date()
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      setStartDate(formatDateForInput(firstDay))
      setEndDate(formatDateForInput(today))
    }
  }, [dataGuru])

  const showNotification = (message) => {
    setNotification({ show: true, message })
    setTimeout(() => setNotification({ show: false, message: '' }), 3000)
  }

  // Wrapper agar fungsi internal tetap menerima objek guru dari dataGuru
  const getGuruSummary = (guruId) => {
    const guru = dataGuru.find(g => g.id === guruId)
    return getGuruSummaryFromHook(guru.id, guru)
  }

  const getGuruReportRows = (guruId) => {
    const guru = dataGuru.find(g => g.id === guruId)
    return getGuruReportRowsFromHook(guru.id, guru)
  }

  const downloadPDF = () => {
    if (!selectedGuru) {
      alert('Pilih guru terlebih dahulu!')
      return
    }

    const guru = dataGuru.find(g => g.id === parseInt(selectedGuru))
    const logs = getGuruReportRows(guru.id)
    const summary = getGuruSummary(guru.id)

    if (summary.totalHari === 0) {
      alert('Tidak ada hari kerja untuk periode ini!')
      return
    }

    const doc = new jsPDF()
    
    doc.setFontSize(16)
    doc.text('Laporan Presensi Guru', 14, 15)
    doc.setFontSize(10)
    doc.text(`Nama: ${guru.nama}`, 14, 25)
    doc.text(`Jabatan: ${Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan}`, 14, 30)
    doc.text(`Periode: ${startDate} s/d ${endDate}`, 14, 35)
    
    const tableData = logs.map(log => [
      log.tanggal,
      log.jamMasuk || log.jam_masuk || log.jamHadir || log.jam_hadir || '-',
      log.jamPulang || '-',
      log.status.toUpperCase(),
      log.keterangan || '-'
    ])

    doc.autoTable({
      startY: 40,
      head: [['Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan']],
      body: tableData,
    })

    // Tambahkan statistik
    const finalY = doc.lastAutoTable.finalY + 10
    doc.setFontSize(10)
    doc.text(`Total Hari Kerja: ${summary.totalHari}`, 14, finalY)
    doc.text(`Hadir: ${summary.hadir} hari`, 14, finalY + 5)
    doc.text(`Izin: ${summary.izin} hari`, 14, finalY + 10)
    doc.text(`Sakit: ${summary.sakit} hari`, 14, finalY + 15)
    doc.text(`Alfa: ${summary.alfa} hari`, 14, finalY + 20)
    doc.text(`Persentase Hadir: ${summary.persentase}%`, 14, finalY + 25)

    const safeNama = guru.nama.replace(/\s+/g, '_')
    const fileName = `Laporan_${safeNama}_${formatDate(new Date())}.pdf`
    doc.save(fileName)
    showNotification('Laporan PDF berhasil didownload!')
  }

  const downloadExcel = () => {
    if (!selectedGuru) {
      alert('Pilih guru terlebih dahulu!')
      return
    }

    const guru = dataGuru.find(g => g.id === parseInt(selectedGuru))
    const logs = getGuruReportRows(guru.id)
    const summary = getGuruSummary(guru.id)

    if (summary.totalHari === 0) {
      alert('Tidak ada hari kerja untuk periode ini!')
      return
    }

    const exportData = logs.map(log => ({
      'Tanggal': log.tanggal,
      'Jam Masuk': log.jamMasuk || log.jam_masuk || log.jamHadir || log.jam_hadir || '-',
      'Jam Pulang': log.jamPulang || '-',
      'Status': log.status.toUpperCase(),
      'Keterangan': log.keterangan || '-'
    }))

    exportData.push({})
    exportData.push({ 'Tanggal': 'STATISTIK' })
    exportData.push({ 'Tanggal': 'Total Hari Kerja', 'Jam Masuk': summary.totalHari })
    exportData.push({ 'Tanggal': 'Hadir', 'Jam Masuk': summary.hadir })
    exportData.push({ 'Tanggal': 'Izin', 'Jam Masuk': summary.izin })
    exportData.push({ 'Tanggal': 'Sakit', 'Jam Masuk': summary.sakit })
    exportData.push({ 'Tanggal': 'Alfa', 'Jam Masuk': summary.alfa })
    exportData.push({ 'Tanggal': 'Persentase Hadir', 'Jam Masuk': `${summary.persentase}%` })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Presensi')
    const safeNama = guru.nama.replace(/\s+/g, '_')
    const fileName = `Laporan_${safeNama}_${formatDate(new Date())}.xlsx`
    XLSX.writeFile(wb, fileName)
    showNotification('Laporan Excel berhasil didownload!')
  }

  const setPreset = (days) => {
    const today = new Date()
    const pastDate = new Date()
    pastDate.setDate(today.getDate() - days)
    setStartDate(formatDateForInput(pastDate))
    setEndDate(formatDateForInput(today))
  }

  const selectedGuruData = dataGuru.find(g => g.id === parseInt(selectedGuru))
  const selectedGuruSummary = selectedGuruData ? getGuruSummary(selectedGuruData.id) : null
  const selectedReportRows = selectedGuruData ? getGuruReportRows(selectedGuruData.id) : []

  const downloadSemuaGuruPDF = () => {
    if (dataGuru.length === 0) {
      alert('Tidak ada data guru!')
      return
    }

    const doc = new jsPDF('landscape', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    const printedAt = new Date().toLocaleString('id-ID')
    
    // Header
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageWidth, 34, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(17)
    doc.setFont(undefined, 'bold')
    doc.text('LAPORAN RINGKASAN PRESENSI SEMUA GURU', pageWidth / 2, 15, { align: 'center' })
    
    doc.setFont(undefined, 'normal')
    doc.setFontSize(10)
    doc.text(`Periode: ${startDate} s/d ${endDate}`, pageWidth / 2, 23, { align: 'center' })
    doc.text('Hari tanpa presensi pada hari kerja dihitung sebagai Alfa', pageWidth / 2, 29, { align: 'center' })
    
    const summaries = dataGuru.map(guru => ({
      guru,
      ...getGuruSummary(guru.id)
    }))
    const totalHariKerja = summaries.reduce((sum, item) => sum + item.totalHari, 0)
    const totalPresensi = totalHariKerja
    const totalHadir = summaries.reduce((sum, item) => sum + item.hadir, 0)
    const totalIzin = summaries.reduce((sum, item) => sum + item.izin, 0)
    const totalSakit = summaries.reduce((sum, item) => sum + item.sakit, 0)
    const totalAlfa = summaries.reduce((sum, item) => sum + item.alfa, 0)
    const rataHadir = totalPresensi > 0 ? ((totalHadir / totalPresensi) * 100).toFixed(1) : '0.0'

    const summaryCards = [
      ['Total Guru', dataGuru.length],
      ['Hari Kerja Guru', totalHariKerja],
      ['Hadir', totalHadir],
      ['Izin', totalIzin],
      ['Sakit', totalSakit],
      ['Alfa', totalAlfa],
      ['Rata-rata Hadir', `${rataHadir}%`]
    ]

    doc.setTextColor(15, 23, 42)
    doc.setFontSize(8)
    summaryCards.forEach(([label, value], index) => {
      const cardWidth = 37
      const x = 14 + index * (cardWidth + 2)
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(x, 40, cardWidth, 18, 2, 2, 'FD')
      doc.setFont(undefined, 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text(label, x + 3, 47)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(15, 23, 42)
      doc.text(String(value), x + 3, 54)
    })
    
    const tableData = summaries.map(({ guru, totalHari, hadir, izin, sakit, alfa, persentase }, index) => [
        index + 1,
        guru.nama,
        Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan,
        totalHari,
        hadir,
        izin,
        sakit,
        alfa,
        `${persentase}%`
    ])

    doc.autoTable({
      startY: 66,
      head: [['No', 'Nama Guru', 'Jabatan', 'Hari Kerja', 'Hadir', 'Izin', 'Sakit', 'Alfa', '% Hadir']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      bodyStyles: { 
        fontSize: 7.5,
        cellPadding: 2,
        valign: 'middle',
        textColor: [31, 41, 55]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 11 },
        1: { cellWidth: 55 },
        2: { cellWidth: 68 },
        3: { halign: 'center', cellWidth: 22 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'center', cellWidth: 18 },
        6: { halign: 'center', cellWidth: 18 },
        7: { halign: 'center', cellWidth: 18 },
        8: { halign: 'center', cellWidth: 21, fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14, top: 16, bottom: 16 },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.getHeight()
        const pageNumber = doc.internal.getNumberOfPages()
        doc.setFontSize(8)
        doc.setFont(undefined, 'normal')
        doc.setTextColor(100, 116, 139)
        doc.text(`Dicetak pada: ${printedAt}`, 14, pageHeight - 8)
        doc.text(`Halaman ${pageNumber}`, pageWidth - 14, pageHeight - 8, { align: 'right' })
      }
    })

    const fileName = `Laporan_Ringkasan_Semua_Guru_${formatDate(new Date())}.pdf`
    doc.save(fileName)
    showNotification('Laporan ringkasan semua guru berhasil didownload!')
  }

  const downloadSemuaGuruExcel = () => {
    if (dataGuru.length === 0) {
      alert('Tidak ada data guru!')
      return
    }

    const wb = XLSX.utils.book_new()

    // Summary sheet (gunakan string comparison)
    const summaryData = dataGuru.map(guru => {
      const { totalHari, hadir, izin, sakit, alfa, persentase } = getGuruSummary(guru.id)

      return {
        'Nama': guru.nama,
        'Jabatan': Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan,
        'Total Hari Kerja': totalHari,
        'Hadir': hadir,
        'Izin': izin,
        'Sakit': sakit,
        'Alfa': alfa,
        'Persentase Hadir': `${persentase}%`
      }
    })

    const wsSummary = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Kehadiran')

    // 2. Terlambat Piket Sheet
    // Piket kini dihitung dari rotasi dwi-pekanan (bukan tabel jadwal_piket per-hari).
    // Seorang guru dianggap "Terlambat Piket" bila pada tanggal tersebut ia piket
    // (sesuai rotasi) dan jam masuknya melebihi piket_jam_masuk dari konfigurasi.
    const rangeLogs = attendanceLogs.filter(log => log.tanggal >= startDate && log.tanggal <= endDate)
    const { jamMasuk: jamPiketMasuk } = getPiketJam(piketConfig)

    const latePiketData = rangeLogs.filter(log => {
      const group = piketGroupMap[log.userId]
      if (!group) return false // guru tidak terdaftar di rotasi (mis. arsip) -> tidak piket
      const isPiket = isGuruPiketOnDate({ piket_group: group }, piketConfig, log.tanggal)
      if (!isPiket) return false
      // Bandingkan jam masuk (HH:MM) dengan jam piket — string compare aman untuk format 24-jam.
      // jamMasuk bisa HH:MM atau HH:MM:SS; potong ke 5 char agar "07:00:00" tidak salah dinilai
      // lebih besar dari "07:00" (false positive "terlambat" saat masuk tepat waktu).
      return log.jamMasuk && String(log.jamMasuk).slice(0, 5) > jamPiketMasuk
    }).map(l => ({
      'Nama Guru': l.nama,
      'Tanggal': l.tanggal,
      'Jam Masuk': l.jamMasuk,
      'Status': l.status.toUpperCase(),
      'Keterangan': l.keterangan || '-'
    }))
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(latePiketData, {
        header: ['Nama Guru', 'Tanggal', 'Jam Masuk', 'Status', 'Keterangan'],
      }),
      'Terlambat Piket'
    )

    // 3. Pulang Awal Piket Sheet
    const earlyData = rangeLogs.filter(log => log.keterangan && log.keterangan.includes('Izin Pulang Awal Piket'))
      .map(l => ({
        'Nama Guru': l.nama,
        'Tanggal': l.tanggal,
        'Jam Pulang': l.jamPulang,
        'Alasan': l.keterangan.replace('(Izin Pulang Awal Piket)', '').replace(' | Alasan: ', '').trim() || 'Tanpa alasan detail'
      }))
    if (earlyData.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(earlyData), 'Pulang Awal Piket')
    }

    // 4. Alasan Izin & Sakit Sheet
    const izinSakitData = rangeLogs.filter(log => log.status === 'izin' || log.status === 'sakit')
      .map(l => ({
        'Nama Guru': l.nama,
        'Tanggal': l.tanggal,
        'Status': l.status.toUpperCase(),
        'Keterangan/Alasan': l.keterangan || '-'
      }))
    if (izinSakitData.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(izinSakitData), 'Alasan Izin Sakit')
    }

    // 5. Lupa Checkout Sheet
    const todayStr = new Date().toISOString().split('T')[0]
    const forgottenData = rangeLogs.filter(log => 
      log.tanggal < todayStr && 
      log.status.startsWith('hadir') && 
      (!log.jamPulang || log.jamPulang === '-')
    ).map(l => ({
      'Nama Guru': l.nama,
      'Tanggal': l.tanggal,
      'Jam Masuk': l.jamMasuk
    }))
    if (forgottenData.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(forgottenData), 'Lupa Checkout')
    }

    // Detail sheet for each guru (gunakan string comparison)
    dataGuru.forEach(guru => {
      const guruLogs = getGuruReportRows(guru.id)

      if (guruLogs.length === 0) return

      const detailData = guruLogs.map(log => ({
        'Tanggal': log.tanggal,
        'Jam Masuk': log.jamMasuk || log.jam_masuk || log.jamHadir || log.jam_hadir || '-',
        'Jam Pulang': log.jamPulang || '-',
        'Status': log.status.toUpperCase(),
        'Keterangan': log.keterangan || '-'
      }))

      const wsDetail = XLSX.utils.json_to_sheet(detailData)
      // Limit sheet name to 31 characters
      const sheetName = guru.nama.substring(0, 31)
      XLSX.utils.book_append_sheet(wb, wsDetail, sheetName)
    })

    const fileName = `Laporan_Semua_Guru_${formatDate(new Date())}.xlsx`
    XLSX.writeFile(wb, fileName)
    showNotification('Laporan semua guru berhasil didownload!')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Download Laporan Guru</h1>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('semua')}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'semua'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="w-5 h-5" />
              Semua Guru
            </button>
            <button
              onClick={() => setActiveTab('individu')}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'individu'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <User className="w-5 h-5" />
              Guru Tertentu
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content: Semua Guru */}
      {activeTab === 'semua' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Download Laporan Semua Guru</h2>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800">
              <strong>Info:</strong> Laporan akan berisi data presensi semua guru dalam periode yang dipilih.
              File Excel akan memiliki sheet ringkasan dan sheet detail per guru.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tanggal Mulai */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Tanggal Akhir */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Preset Buttons */}
            <div className="flex items-end gap-2">
              <button
                onClick={() => setPreset(7)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                7 Hari
              </button>
              <button
                onClick={() => setPreset(30)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                30 Hari
              </button>
              <button
                onClick={() => setPreset(90)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                90 Hari
              </button>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{dataGuru.length}</p>
              <p className="text-sm text-gray-600">Total Guru</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{startDate && endDate ? Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1 : 0}</p>
              <p className="text-sm text-gray-600">Hari</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {attendanceLogs.filter(log => {
                  const logDate = new Date(log.tanggal)
                  return logDate >= new Date(startDate) && logDate <= new Date(endDate)
                }).length}
              </p>
              <p className="text-sm text-gray-600">Total Presensi</p>
            </div>
          </div>

          {/* Download Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={downloadSemuaGuruPDF}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
            >
              <Download className="w-5 h-5" />
              Download PDF
            </button>
            <button
              onClick={downloadSemuaGuruExcel}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
            >
              <Download className="w-5 h-5" />
              Download Excel
            </button>
          </div>

          {/* Preview Data Semua Guru */}
          {dataGuru.length > 0 && startDate && endDate && (
            <div className="pt-4 border-t">
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-6 h-6 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-800">Preview Data Semua Guru</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Guru</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jabatan</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hari Kerja</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hadir</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Izin</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sakit</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Alfa</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">% Hadir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dataGuru.map((guru, index) => {
                      const { totalHari, hadir, izin, sakit, alfa, persentase } = getGuruSummary(guru.id)

                      return (
                        <tr key={guru.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                            {guru.archivedAt && (
                              <span className="mr-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-bold align-middle">ARSIP</span>
                            )}
                            {guru.nama}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-center">{totalHari}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center w-12 h-8 bg-green-100 text-green-800 rounded text-sm font-semibold">
                              {hadir}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center w-12 h-8 bg-yellow-100 text-yellow-800 rounded text-sm font-semibold">
                              {izin}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center w-12 h-8 bg-red-100 text-red-800 rounded text-sm font-semibold">
                              {sakit}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center w-12 h-8 bg-gray-100 text-gray-800 rounded text-sm font-semibold">
                              {alfa}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-semibold ${
                              persentase >= 80 ? 'bg-green-100 text-green-800' :
                              persentase >= 60 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {persentase}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {dataGuru.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Tidak ada data guru
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Guru Tertentu */}
      {activeTab === 'individu' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Download Laporan Guru Tertentu</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pilih Guru */}
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pilih Guru
              </label>
              <select
                value={selectedGuru}
                onChange={(e) => setSelectedGuru(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Pilih Guru --</option>
                {dataGuru.map(guru => (
                  <option key={guru.id} value={guru.id}>
                    {guru.archivedAt ? '[Arsip] ' : ''}{guru.nama} - {Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan}
                  </option>
                ))}
              </select>
            </div>

          {/* Tanggal Mulai */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Dari Tanggal
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tanggal Akhir */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Preset Buttons */}
          <div className="flex items-end gap-2">
            <button
              onClick={() => setPreset(7)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              7 Hari
            </button>
            <button
              onClick={() => setPreset(30)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              30 Hari
            </button>
            <button
              onClick={() => setPreset(90)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              90 Hari
            </button>
          </div>
        </div>

          {/* Download Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={downloadPDF}
              disabled={!selectedGuru}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              <Download className="w-5 h-5" />
              Download PDF
            </button>
            <button
              onClick={downloadExcel}
              disabled={!selectedGuru}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              <Download className="w-5 h-5" />
              Download Excel
            </button>
          </div>

          {/* Preview Section */}
          {selectedGuruData && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Preview Data</h2>
          </div>

          {/* Info Guru */}
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-gray-700">Nama:</span>
                <span className="ml-2 text-gray-900">{selectedGuruData.nama}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Jabatan:</span>
                <span className="ml-2 text-gray-900">
                  {Array.isArray(selectedGuruData.jabatan) 
                    ? selectedGuruData.jabatan.join(', ') 
                    : selectedGuruData.jabatan}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Periode:</span>
                <span className="ml-2 text-gray-900">{startDate} s/d {endDate}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Total Hari Kerja:</span>
                <span className="ml-2 text-gray-900">{selectedGuruSummary?.totalHari || 0} hari</span>
              </div>
            </div>
          </div>

          {/* Statistik */}
          {selectedGuruSummary && selectedGuruSummary.totalHari > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-800">{selectedGuruSummary.totalHari}</p>
                <p className="text-sm text-gray-600">Hari Kerja</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {selectedGuruSummary.hadir}
                </p>
                <p className="text-sm text-gray-600">Hadir</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-yellow-600">
                  {selectedGuruSummary.izin}
                </p>
                <p className="text-sm text-gray-600">Izin</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-600">
                  {selectedGuruSummary.sakit}
                </p>
                <p className="text-sm text-gray-600">Sakit</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-700">
                  {selectedGuruSummary.alfa}
                </p>
                <p className="text-sm text-gray-600">Alfa</p>
              </div>
            </div>
          )}

          {/* Tabel Preview */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jam Masuk</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jam Pulang</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {selectedReportRows.length > 0 ? selectedReportRows.slice().reverse().map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{log.tanggal}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.jamMasuk || log.jam_masuk || log.jamHadir || log.jam_hadir || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.jamPulang || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold
                        ${log.status === 'hadir' ? 'bg-green-100 text-green-800' : ''}
                        ${log.status === 'hadir_terlambat' ? 'bg-yellow-100 text-yellow-800' : ''}
                        ${log.status === 'hadir_izin_terlambat' ? 'bg-blue-100 text-blue-800' : ''}
                        ${log.status === 'izin' ? 'bg-yellow-100 text-yellow-800' : ''}
                        ${log.status === 'sakit' ? 'bg-red-100 text-red-800' : ''}
                        ${log.status === 'alfa' ? 'bg-gray-200 text-gray-800' : ''}
                        ${log.status === 'libur' ? 'bg-indigo-100 text-indigo-800' : ''}
                        ${log.status === 'libur_override' ? 'bg-purple-100 text-purple-800' : ''}
                      `}>
                        {log.status === 'hadir_izin_terlambat' ? 'HADIR - IZIN TERLAMBAT' :
                         log.status === 'libur_override' ? 'LIBUR KHUSUS' :
                         log.status === 'libur' ? 'LIBUR' :
                         log.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.keterangan || '-'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                      Tidak ada data presensi untuk periode ini
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          )}
        </div>
      )}

      {/* Notification */}
      {notification.show && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {notification.message}
        </div>
      )}
    </div>
  )
}

export default DownloadLaporan

