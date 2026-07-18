import { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { guruAPI } from '../../services/api'

function GuruModal({ guru, onClose, onSave }) {
  const [formData, setFormData] = useState({
    idGuru: '',
    nama: '',
    tanggalLahir: '',
    jenisKelamin: 'Laki-laki',
    tipeGuru: 'full_time',
    piketGroup: '',
    pokjar: '',
    alamat: '',
    noHP: '',
    jabatan: [''],
    tanggalBertugas: '',
    username: '',
    password: '',
    role: 'guru'
  })
  const [tandaTangan, setTandaTangan] = useState(null)

  // Auto-fill username dan password jika tanggal lahir diisi (untuk guru baru)
  useEffect(() => {
    if (!guru && formData.tanggalLahir) {
      const date = new Date(formData.tanggalLahir);
      if (!isNaN(date.getTime())) {
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        const formattedDate = `${d}${m}${y}`;
        setFormData(prev => ({
          ...prev,
          username: formattedDate,
          password: formattedDate
        }));
      }
    }
  }, [formData.tanggalLahir, guru]);

  useEffect(() => {
    if (guru) {
      // Pastikan jabatan adalah array
      const jabatanArray = Array.isArray(guru.jabatan) ? guru.jabatan : [guru.jabatan]
      // Normalisasi piketGroup (handle snake_case piket_group); default '' jika null/undefined
      const piketGroup = guru.piketGroup ?? guru.piket_group ?? ''
      // Normalisasi pokjar (handle snake_case); default '' jika null/undefined
      const pokjar = guru.pokjar ?? ''
      setFormData({ ...guru, jabatan: jabatanArray, piketGroup, pokjar })
      // Ambil detail lengkap (termasuk tanda tangan) via getById
      guruAPI.getById(guru.id)
        .then((response) => {
          const data = response.data
          setTandaTangan(data.tandaTangan || null)
          // Perbarui piketGroup dari sumber otoritatif bila ada
          if (data.piketGroup !== undefined && data.piketGroup !== null) {
            setFormData((prev) => ({ ...prev, piketGroup: data.piketGroup }))
          }
          // Perbarui pokjar dari sumber otoritatif (data.pokjar null = bukan pokjar)
          setFormData((prev) => ({ ...prev, pokjar: data.pokjar ?? '' }))
        })
        .catch(() => {
          setTandaTangan(null)
        })
    } else {
      setTandaTangan(null)
    }
  }, [guru])

  const handleSubmit = (e) => {
    e.preventDefault()
    // Filter jabatan yang kosong
    const cleanedData = {
      ...formData,
      jabatan: formData.jabatan.filter(j => j.trim() !== '')
    }
    onSave(cleanedData)
  }

  const addJabatan = () => {
    setFormData({ ...formData, jabatan: [...formData.jabatan, ''] })
  }

  const removeJabatan = (index) => {
    const newJabatan = formData.jabatan.filter((_, i) => i !== index)
    setFormData({ ...formData, jabatan: newJabatan.length > 0 ? newJabatan : [''] })
  }

  const updateJabatan = (index, value) => {
    const newJabatan = [...formData.jabatan]
    newJabatan[index] = value
    setFormData({ ...formData, jabatan: newJabatan })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">
            {guru ? 'Edit Guru' : 'Tambah Guru Baru'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID Guru <span className="text-xs text-gray-500">(Nomor Induk Guru)</span>
            </label>
            <input
              type="text"
              value={formData.idGuru}
              onChange={(e) => setFormData({ ...formData, idGuru: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Contoh: G2020001"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nama Lengkap</label>
            <input
              type="text"
              value={formData.nama}
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal Lahir</label>
            <input
              type="date"
              value={formData.tanggalLahir}
              onChange={(e) => setFormData({ ...formData, tanggalLahir: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Jenis Kelamin</label>
            <select
              value={formData.jenisKelamin}
              onChange={(e) => setFormData({ ...formData, jenisKelamin: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipe Guru</label>
            <select
              value={formData.tipeGuru}
              onChange={(e) => setFormData({ ...formData, tipeGuru: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="full_time">Full Time (Hadir setiap hari kerja)</option>
              <option value="partime">Partime (Scan = Hadir, tanpa status terlambat)</option>
            </select>
            {formData.tipeGuru === 'partime' && (
              <p className="mt-1 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                ⚡ Guru partime hanya perlu scan 1x. Langsung tercatat <strong>Hadir</strong> tanpa cek jam.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Grup Piket</label>
            <select
              value={formData.piketGroup}
              onChange={(e) => setFormData({ ...formData, piketGroup: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tidak ada / Belum ditugaskan</option>
              <option value="A">Grup A</option>
              <option value="B">Grup B</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Pokjar (Sekolah Binaan)</label>
            <select
              value={formData.pokjar}
              onChange={(e) => setFormData({ ...formData, pokjar: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tidak ada / Bukan Pokjar</option>
              <option value="Lentera Qalbu">Pokjar Lentera Qalbu</option>
              <option value="Umar bin Khattab">Pokjar Umar bin Khattab</option>
              <option value="Nashirus Sunnah">Pokjar Nashirus Sunnah</option>
            </select>
            {formData.pokjar && (
              <p className="mt-1 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                🏫 Guru Pokjar menggunakan presensi sederhana: cukup <strong>Hadir / Sakit / Izin</strong> (+ keterangan), tanpa terlambat & tanpa presensi pulang.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Alamat</label>
            <textarea
              value={formData.alamat}
              onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows="3"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nomor HP</label>
            <input
              type="tel"
              value={formData.noHP}
              onChange={(e) => setFormData({ ...formData, noHP: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="08123456789"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">Jabatan</label>
              <button
                type="button"
                onClick={addJabatan}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4" />
                Tambah Jabatan
              </button>
            </div>
            <div className="space-y-2">
              {formData.jabatan.map((jab, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={jab}
                    onChange={(e) => updateJabatan(index, e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder={`Jabatan ${index + 1}`}
                    required={index === 0}
                  />
                  {formData.jabatan.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeJabatan(index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tanggal Bertugas</label>
            <input
              type="date"
              value={formData.tanggalBertugas}
              onChange={(e) => setFormData({ ...formData, tanggalBertugas: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username {guru && <span className="text-xs text-gray-500">(ID Login)</span>}
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password {guru && <span className="text-xs text-gray-500">(Kosongkan jika tidak ingin mengubah)</span>}
            </label>
            <input
              type="text"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder={guru ? "Kosongkan jika tidak ingin mengubah" : "Otomatis dari Tgl Lahir"}
              required={!guru}
            />
          </div>

          {guru && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tanda Tangan Digital (bukti)
              </label>
              <div className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                {tandaTangan ? (
                  <img src={tandaTangan} alt="Tanda tangan" className="max-h-32 mx-auto" />
                ) : (
                  <p className="text-sm text-gray-500 italic text-center py-4">
                    Belum ada tanda tangan.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default GuruModal
