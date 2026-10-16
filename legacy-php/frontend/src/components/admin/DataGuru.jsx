import { useState, useEffect } from 'react'
import { Plus, Edit2, Archive, Download, Upload, PenLine, CheckCircle, Circle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { calculateWorkDuration, formatDate } from '../../utils/dateUtils'
import GuruModal from './GuruModal'
import { guruAPI } from '../../services/api'

function DataGuru() {
  const [dataGuru, setDataGuru] = useState([])
  const [filteredGuru, setFilteredGuru] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingGuru, setEditingGuru] = useState(null)
  const [notification, setNotification] = useState({ show: false, message: '' })
  const [searchTerm, setSearchTerm] = useState('')
  const [filterJK, setFilterJK] = useState('all')
  const [filterJabatan, setFilterJabatan] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDataGuru()
  }, [])

  const loadDataGuru = async () => {
    try {
      setLoading(true)
      const response = await guruAPI.getAll()
      setDataGuru(response.data)
      setFilteredGuru(response.data)
    } catch (error) {
      console.error('Failed to load guru data:', error)
      showNotification('Gagal memuat data guru: ' + error.message)
    } finally {
      setLoading(false)
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
    setTimeout(() => setNotification({ show: false, message: '' }), 3000)
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
    return Array.from(jabatanSet).sort()
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
      'Tanggal Lahir': guru.tanggalLahir || '-',
      'Umur': calculateAge(guru.tanggalLahir),
      'Jenis Kelamin': guru.jenisKelamin,
      'Alamat': guru.alamat,
      'No HP': guru.noHP || '-',
      'Jabatan': Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan,
      'Tanggal Bertugas': guru.tanggalBertugas,
      'Lama Bertugas': calculateWorkDuration(guru.tanggalBertugas),
      'Username': guru.username,
      'Password': guru.password,
      'Pokjar': guru.pokjar || '-'
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data Guru')
    const fileName = `Data_Guru_${formatDate(new Date())}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const bstr = evt.target.result
      const wb = XLSX.read(bstr, { type: 'binary' })
      const wsname = wb.SheetNames[0]
      const ws = wb.Sheets[wsname]
      const data = XLSX.utils.sheet_to_json(ws)

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
          idGuru: row['ID Guru'] || row['id guru'] || `PKBM${String(dataGuru.length + index + 1).padStart(3, '0')}`,
          pokjar: ['Lentera Qalbu', 'Umar bin Khattab', 'Nashirus Sunnah'].includes(row['Pokjar'] || row['pokjar'] || '') ? (row['Pokjar'] || row['pokjar']) : '',
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cari Nama Guru
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ketik nama guru..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filter Jenis Kelamin */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Jenis Kelamin
            </label>
            <select
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Jabatan
            </label>
            <select
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

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID Guru</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal Lahir</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Umur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jenis Kelamin</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alamat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">No HP</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jabatan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal Bertugas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lama Bertugas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Password</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grup Piket</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pokjar</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanda Tangan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
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
                <tr key={guru.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{guru.idGuru || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{guru.nama}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{guru.tanggalLahir || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{calculateAge(guru.tanggalLahir)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{guru.jenisKelamin}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{guru.alamat}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{guru.noHP || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {Array.isArray(guru.jabatan) ? guru.jabatan.join(', ') : guru.jabatan}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{guru.tanggalBertugas}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {calculateWorkDuration(guru.tanggalBertugas)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{guru.username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{'•'.repeat(guru.password?.length || 8)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {guru.piketGroup === 'A' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Grup A</span>
                    ) : guru.piketGroup === 'B' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Grup B</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {guru.pokjar === 'Lentera Qalbu' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Lentera Qalbu</span>
                    ) : guru.pokjar === 'Umar bin Khattab' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">Umar bin Khattab</span>
                    ) : guru.pokjar === 'Nashirus Sunnah' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Nashirus Sunnah</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {guru.punyaTandaTangan ? (
                      <span title="Punya tanda tangan">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </span>
                    ) : (
                      <span title="Belum ada tanda tangan">
                        <Circle className="w-4 h-4 text-gray-300" />
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(guru)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleArchive(guru)}
                        className="text-orange-600 hover:text-orange-800"
                        title="Arsipkan Guru"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              }) : (
                <tr>
                  <td colSpan="17" className="px-6 py-8 text-center text-gray-500">
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
      {notification.show && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {notification.message}
        </div>
      )}
    </div>
  )
}

export default DataGuru
