import { notify } from '../ui/toast'
import { Notice } from '../ui/page'
import { useState, useEffect, useRef } from 'react'
import { Plus, Edit2, Archive, Download, Upload } from 'lucide-react'
import { createWorkbook, addJsonSheet, downloadWorkbook, readWorkbookRows } from '../../utils/excelExport'
import { calculateWorkDuration, formatDate, formatDisplayDate } from '../../utils/dateUtils'
import GuruModal from './GuruModal'
import { guruAPI } from '../../services/api'

function DataGuru() {
  const [dataGuru, setDataGuru] = useState<any[]>([])
  const [filteredGuru, setFilteredGuru] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingGuru, setEditingGuru] = useState(null)
  const [notification, setNotification] = useState({ show: false, message: '' })
  const [searchTerm, setSearchTerm] = useState('')
  const [filterJK, setFilterJK] = useState('all')
  const [filterJabatan, setFilterJabatan] = useState('all')
  const loadRequest = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => () => { loadRequest.current++ }, [])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDataGuru()
  }, [])

  const loadDataGuru = async () => {
    const requestId = ++loadRequest.current
    setLoadError(null)
    setLoading(true)

    try {
      setLoading(true)
      const response = await guruAPI.getAll()
      if (requestId !== loadRequest.current) return

      setDataGuru(response.data)
      setFilteredGuru(response.data)
    } catch (error) {
      if (requestId !== loadRequest.current) return
      setLoadError('Data belum dapat dimuat. Periksa koneksi lalu coba lagi.')

      console.error('Failed to load guru data:', error)
      showNotification('Gagal memuat data guru: ' + error.message)
    } finally {
      requestId === loadRequest.current && setLoading(false)
    }
  }

  useEffect(() => {
    let filtered = [...dataGuru]

    // Filter by search term (nama)
    if (searchTerm) {
      filtered = filtered.filter(guru =>
        guru.nama.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Filter by jenis kelamin
    if (filterJK !== 'all') {
      filtered = filtered.filter(guru => guru.jenisKelamin === filterJK)
    }

    // Filter by jabatan
    if (filterJabatan !== 'all') {
      filtered = filtered.filter(guru => {
        const jabatanArray = Array.isArray(guru.jabatan) ? guru.jabatan : [guru.jabatan]
        return jabatanArray.some(j => j.toLowerCase().includes(filterJabatan.toLowerCase()))
      })
    }

    setFilteredGuru(filtered)
  }, [searchTerm, filterJK, filterJabatan, dataGuru])

  const showNotification = (message) => {
    setNotification({ show: true, message })
    notify(message, message.startsWith('Gagal') ? 'error' : 'success')
  }

  const resetFilters = () => {
    setSearchTerm('')
    setFilterJK('all')
    setFilterJabatan('all')
  }

  // Get unique jabatan for filter
  const getUniqueJabatan = () => {
    const jabatanSet = new Set()
    dataGuru.forEach(guru => {
      const jabatanArray = Array.isArray(guru.jabatan) ? guru.jabatan : [guru.jabatan]
      jabatanArray.forEach(j => jabatanSet.add(j))
    })
    return Array.from(jabatanSet).map(String).sort()
  }

  const handleAdd = () => {
    setEditingGuru(null)
    setIsModalOpen(true)
  }

  const handleEdit = (guru) => {
    setEditingGuru(guru)
    setIsModalOpen(true)
  }

  const handleArchive = async (guru) => {
    const reason = prompt(
      `Arsipkan data guru "${guru.nama}"?\n\nSeluruh data presensi guru ini akan tetap tersimpan dan dapat dilihat di menu Arsip Guru. Guru yang diarsipkan tidak akan muncul di dashboard & tidak bisa login.\n\nMasukkan alasan pengarsipan (opsional):`
    )
    // prompt mengembalikan null jika dibatalkan
    if (reason === null) return

    try {
      await guruAPI.archive(guru.id, reason)
      showNotification(`Guru "${guru.nama}" berhasil diarsipkan. Data presensi tetap tersimpan.`)
      loadDataGuru()
    } catch (error) {
      showNotification('Gagal mengarsipkan guru: ' + error.message)
    }
  }

  const handleSave = async (guruData) => {
    try {
      if (editingGuru) {
        // Update data guru
        await guruAPI.update({ ...guruData, id: editingGuru.id })
        showNotification('Data guru berhasil diupdate!')
      } else {
        // Create new guru
        await guruAPI.create(guruData)
        showNotification('Data guru berhasil ditambahkan!')
      }
      setIsModalOpen(false)
      loadDataGuru()
    } catch (error) {
      showNotification('Gagal menyimpan data guru: ' + error.message)
      throw error
    }
  }

  const handleExport = () => {
    const calculateAge = (birthDate) => {
      if (!birthDate) return '-'
      const today = new Date()
      const birth = new Date(birthDate)
      let age = today.getFullYear() - birth.getFullYear()
      const monthDiff = today.getMonth() - birth.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--
      }
      return age + ' tahun'
    }

    const exportData = dataGuru.map((guru, index) => ({
      'No': index + 1,
      'ID Guru': guru.idGuru || '-',
      'Nama': guru.nama,
      'Email': guru.email || '-',
      'Tanggal Lahir': guru.tanggalLahir || '-',
      'Umur': calculateAge(guru.tanggalLahir),
      'Jenis Kelamin': guru.jenisKelamin,
      'Alamat': guru.alamat,
      'No HP': guru.noHP || '-',
      'Jabatan': Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan,
      'Tanggal Bertugas': guru.tanggalBertugas,
      'Lama Bertugas': calculateWorkDuration(guru.tanggalBertugas),
      'Username': guru.username,
      'Password': guru.password
    }))

    const fileName = `Data_Guru_${formatDate(new Date())}.xlsx`
    const wb = createWorkbook()
    addJsonSheet(wb, 'Data Guru', exportData)
    downloadWorkbook(wb, fileName).catch((error) => showNotification('Gagal export Excel: ' + error.message))
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const data = await readWorkbookRows(file) as any[]

      const importedData = data.map((row, index) => {
        const tglLahir = row['Tanggal Lahir'] || row['tanggal lahir'] || row['Tanggal lahir'] || '';
        let generatedUserPass = `guru${dataGuru.length + index + 1}`;

        if (tglLahir) {
          const date = new Date(tglLahir);
          if (!isNaN(date.getTime())) {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const y = date.getFullYear();
            generatedUserPass = `${d}${m}${y}`;
          }
        }

        return {
          nama: row['Nama'] || row['Nama Lengkap'] || row['nama'] || '',
          jenisKelamin: row['Jenis Kelamin'] || row['jenis kelamin'] || 'Laki-laki',
          alamat: row['Alamat'] || row['alamat'] || '',
          jabatan: row['Jabatan'] || row['jabatan'] || '',
          tanggalBertugas: row['Tanggal Bertugas'] || row['tanggal bertugas'] || '',
          tanggalLahir: tglLahir,
          noHP: row['Nomor HP'] || row['no hp'] || '',
          idGuru: row['ID Guru'] || row['id guru'] || `GQ${String(dataGuru.length + index + 1).padStart(3, '0')}`,
          username: generatedUserPass,
          password: generatedUserPass,
          role: 'guru'
        };
      });

      // Simpan satu per satu ke API
      let successCount = 0;
      for (const guru of importedData) {
        try {
          await guruAPI.create(guru);
          successCount++;
        } catch (err) {
          console.error('Gagal import guru:', guru.nama, err);
        }
      }

      showNotification(`${successCount} data guru berhasil diimport!`);
      loadDataGuru();
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  if (loadError) return <Notice onRetry={() => loadDataGuru()}>{loadError}</Notice>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Data Guru</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Tambah Guru
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 cursor-pointer">
            <Upload className="w-4 h-4" />
            Import Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      {/* Info Arsip */}
      {(dataGuru.length > 0 || filteredGuru.length === 0) && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3 text-sm flex items-center gap-2">
          <Archive className="w-4 h-4 flex-shrink-0" />
          <span>
            Guru yang sudah keluar dari sekolah dapat di<b>arsipkan</b> (data & presensi tetap tersimpan). Lihat daftar arsip di menu <b>Arsip Guru</b>.
          </span>
        </div>
      )}

      {/* Filter & Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <label htmlFor="dataguru-field-1" className="block text-sm font-medium text-gray-700 mb-2">
              Cari Nama Guru
            </label>
            <input id="dataguru-field-1" aria-label="Cari Nama Guru"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ketik nama guru..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filter Jenis Kelamin */}
          <div>
            <label htmlFor="dataguru-field-2" className="block text-sm font-medium text-gray-700 mb-2">
              Jenis Kelamin
            </label>
            <select id="dataguru-field-2" aria-label="Jenis Kelamin"
              value={filterJK}
              onChange={(e) => setFilterJK(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua</option>
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>

          {/* Filter Jabatan */}
          <div>
            <label htmlFor="dataguru-field-3" className="block text-sm font-medium text-gray-700 mb-2">
              Jabatan
            </label>
            <select id="dataguru-field-3" aria-label="Jabatan"
              value={filterJabatan}
              onChange={(e) => setFilterJabatan(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua</option>
              {getUniqueJabatan().map(jabatan => (
                <option key={jabatan} value={jabatan}>{jabatan}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Info & Reset */}
        <div className="mt-4 flex justify-between items-center">
          <p className="text-sm text-gray-600">
            Menampilkan {filteredGuru.length} dari {dataGuru.length} guru
          </p>
          {(searchTerm || filterJK !== 'all' || filterJabatan !== 'all') && (
            <button
              onClick={resetFilters}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
          <p className="text-xs font-medium text-gray-500">Geser tabel ke samping untuk melihat semua kolom.</p>
          <p className="text-xs text-gray-400">Alamat dan jabatan lengkap tersedia saat diarahkan.</p>
        </div>
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1906px] table-fixed text-left">
            <colgroup>
              <col className="w-12" />
              <col className="w-[90px]" />
              <col className="w-[170px]" />
              <col className="w-[210px]" />
              <col className="w-[120px]" />
              <col className="w-20" />
              <col className="w-[110px]" />
              <col className="w-[210px]" />
              <col className="w-[135px]" />
              <col className="w-[180px]" />
              <col className="w-[135px]" />
              <col className="w-[110px]" />
              <col className="w-[120px]" />
              <col className="w-[100px]" />
              <col className="w-[88px]" />
            </colgroup>
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
              <tr>
                <th className="whitespace-nowrap px-3 py-3.5">No</th>
                <th className="whitespace-nowrap px-3 py-3.5">ID Guru</th>
                <th className="whitespace-nowrap px-3 py-3.5">Nama</th>
                <th className="whitespace-nowrap px-3 py-3.5">Email</th>
                <th className="whitespace-nowrap px-3 py-3.5">Tanggal Lahir</th>
                <th className="whitespace-nowrap px-3 py-3.5">Umur</th>
                <th className="whitespace-nowrap px-3 py-3.5">Jenis Kelamin</th>
                <th className="whitespace-nowrap px-3 py-3.5">Alamat</th>
                <th className="whitespace-nowrap px-3 py-3.5">No HP</th>
                <th className="whitespace-nowrap px-3 py-3.5">Jabatan</th>
                <th className="whitespace-nowrap px-3 py-3.5">Tanggal Bertugas</th>
                <th className="whitespace-nowrap px-3 py-3.5">Lama Bertugas</th>
                <th className="whitespace-nowrap px-3 py-3.5">Username</th>
                <th className="whitespace-nowrap px-3 py-3.5">Password</th>
                <th className="whitespace-nowrap px-3 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {filteredGuru.length > 0 ? filteredGuru.map((guru, index) => {
                const calculateAge = (birthDate) => {
                  if (!birthDate) return '-'
                  const today = new Date()
                  const birth = new Date(birthDate)
                  let age = today.getFullYear() - birth.getFullYear()
                  const monthDiff = today.getMonth() - birth.getMonth()
                  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                    age--
                  }
                  return age + ' tahun'
                }

                return (
                <tr key={guru.id} className="transition-colors odd:bg-white even:bg-gray-50/40 hover:bg-blue-50/70">
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-gray-500">{index + 1}</td>
                  <td className="truncate whitespace-nowrap px-3 py-3 font-medium text-blue-700" title={guru.idGuru || '-'}>{guru.idGuru || '-'}</td>
                  <td className="truncate whitespace-nowrap px-3 py-3 font-medium text-gray-900" title={guru.nama}>{guru.nama}</td>
                  <td className="truncate whitespace-nowrap px-3 py-3 text-gray-600" title={guru.email || ''}>{guru.email || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-600">{formatDisplayDate(guru.tanggalLahir)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-600">{calculateAge(guru.tanggalLahir)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-600">{guru.jenisKelamin || '-'}</td>
                  <td className="truncate whitespace-nowrap px-3 py-3 text-gray-600" title={guru.alamat || '-'}>{guru.alamat || '-'}</td>
                  <td className="truncate whitespace-nowrap px-3 py-3 text-gray-600" title={guru.noHP || '-'}>{guru.noHP || '-'}</td>
                  <td className="truncate whitespace-nowrap px-3 py-3 text-gray-600" title={Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan || '-'}>
                    {Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan || '-'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-600">{formatDisplayDate(guru.tanggalBertugas)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-600">
                    {calculateWorkDuration(guru.tanggalBertugas)}
                  </td>
                  <td className="truncate whitespace-nowrap px-3 py-3 text-gray-600" title={guru.username}>{guru.username}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-gray-400">{'•'.repeat(guru.password?.length || 8)}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex justify-center gap-1">
                      <button
                        onClick={() => handleEdit(guru)}
                        className="rounded-md p-2 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800"
                        title="Edit data guru"
                        aria-label={`Edit data ${guru.nama}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleArchive(guru)}
                        className="rounded-md p-2 text-orange-600 transition-colors hover:bg-orange-100 hover:text-orange-800"
                        title="Arsipkan Guru"
                        aria-label={`Arsipkan ${guru.nama}`}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              }) : (
                <tr>
                  <td colSpan={15} className="px-6 py-10 text-center text-gray-500">
                    Tidak ada data guru yang sesuai dengan filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <GuruModal
          guru={editingGuru}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {/* Notification */}

    </div>
  )
}

export default DataGuru
