import { Notice } from '../ui/page'
import { AppDialog } from '../ui/dialog'
import { useState, useEffect, useRef } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { formatDateForInput } from '../../utils/dateUtils'

function GuruModal({ guru, onClose, onSave }) {
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [saveError, setSaveError] = useState('')
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
      setFormData({
        ...guru,
        piketGroup: guru.piketGroup ?? guru.piket_group ?? '',
        pokjar: guru.pokjar ?? '',
        tanggalLahir: guru.tanggalLahir ? formatDateForInput(guru.tanggalLahir) : '',
        tanggalBertugas: guru.tanggalBertugas ? formatDateForInput(guru.tanggalBertugas) : '',
        jabatan: jabatanArray,
      })
    }
  }, [guru])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {


    // Filter jabatan yang kosong
    const cleanedData = {
      ...formData,
      jabatan: formData.jabatan.filter(j => j.trim() !== '')
    }
    setSaveError('')
    try { await onSave(cleanedData) } catch (error) { setSaveError(error.message || 'Data guru belum dapat disimpan.') }

    } finally { savingRef.current = false; setSaving(false) }
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
    <AppDialog open={true} onOpenChange={(open) => { if (!open) onClose() }} title={guru ? 'Edit guru' : 'Tambah guru'} busy={saving}>
<fieldset disabled={saving} className="min-w-0">
{saveError && <Notice>{saveError}</Notice>}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="gurumodal-field-16" className="block text-sm font-medium text-gray-700 mb-2">
              ID Guru <span className="text-xs text-gray-500">(Nomor Induk Guru)</span>
            </label>
            <input id="gurumodal-field-16" aria-label="ID Guru"
              type="text"
              value={formData.idGuru}
              onChange={(e) => setFormData({ ...formData, idGuru: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Contoh: G2020001"
              required
            />
          </div>

          <div>
            <label htmlFor="gurumodal-field-17" className="block text-sm font-medium text-gray-700 mb-2">Nama Lengkap</label>
            <input id="gurumodal-field-17" aria-label="Nama Lengkap"
              type="text"
              value={formData.nama}
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="gurumodal-field-18" className="block text-sm font-medium text-gray-700 mb-2">Tanggal Lahir</label>
            <input id="gurumodal-field-18" aria-label="Tanggal Lahir"
              type="date"
              value={formData.tanggalLahir}
              onChange={(e) => setFormData({ ...formData, tanggalLahir: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="gurumodal-field-19" className="block text-sm font-medium text-gray-700 mb-2">Jenis Kelamin</label>
            <select id="gurumodal-field-19" aria-label="Jenis Kelamin"
              value={formData.jenisKelamin}
              onChange={(e) => setFormData({ ...formData, jenisKelamin: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>

          <div>
            <label htmlFor="gurumodal-field-20" className="block text-sm font-medium text-gray-700 mb-2">Tipe Guru</label>
            <select id="gurumodal-field-20" aria-label="Tipe Guru"
              value={formData.tipeGuru}
              onChange={(e) => setFormData({ ...formData, tipeGuru: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="full_time">Full Time (Hadir setiap hari kerja)</option>
              <option value="partime">Partime (GPS dan perhitungan terlambat seperti non-Pokjar)</option>
            </select>
            {formData.tipeGuru === 'partime' && (
              <p className="mt-1 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                ⚡ Guru partime tetap memakai GPS untuk presensi hadir dan pulang; status terlambat mengikuti jam masuk dan jadwal piket.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="gurumodal-piket-group" className="mb-2 block text-sm font-medium text-gray-700">Grup rotasi piket Sabtu</label>
            <select id="gurumodal-piket-group" value={formData.piketGroup} onChange={(e) => setFormData({ ...formData, piketGroup: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500">
              <option value="">Belum ditugaskan</option><option value="A">Grup A</option><option value="B">Grup B</option>
            </select>
          </div>

          <div>
            <label htmlFor="gurumodal-pokjar" className="mb-2 block text-sm font-medium text-gray-700">Pokjar</label>
            <select id="gurumodal-pokjar" value={formData.pokjar} onChange={(e) => setFormData({ ...formData, pokjar: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500">
              <option value="">Bukan guru Pokjar</option><option value="Lentera Qalbu">Lentera Qalbu</option><option value="Umar bin Khattab">Umar bin Khattab</option><option value="Nashirus Sunnah">Nashirus Sunnah</option>
            </select>
            {formData.pokjar && <p className="mt-1 text-xs text-blue-700">Mode sederhana: Hadir/Izin/Sakit tanpa GPS, keterlambatan, piket, atau presensi pulang.</p>}
          </div>

          <div>
            <label htmlFor="gurumodal-field-21" className="block text-sm font-medium text-gray-700 mb-2">Alamat</label>
            <textarea id="gurumodal-field-21" aria-label="Alamat"
              value={formData.alamat}
              onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              required
            />
          </div>

          <div>
            <label htmlFor="gurumodal-field-22" className="block text-sm font-medium text-gray-700 mb-2">Nomor HP</label>
            <input id="gurumodal-field-22" aria-label="Nomor HP"
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
            <label htmlFor="gurumodal-field-23" className="block text-sm font-medium text-gray-700 mb-2">Tanggal Bertugas</label>
            <input id="gurumodal-field-23" aria-label="Tanggal Bertugas"
              type="date"
              value={formData.tanggalBertugas}
              onChange={(e) => setFormData({ ...formData, tanggalBertugas: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="gurumodal-field-24" className="block text-sm font-medium text-gray-700 mb-2">
              Username {guru && <span className="text-xs text-gray-500">(ID Login)</span>}
            </label>
            <input id="gurumodal-field-24" aria-label="Username"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="gurumodal-field-25" className="block text-sm font-medium text-gray-700 mb-2">
              Password {guru && <span className="text-xs text-gray-500">(Kosongkan jika tidak ingin mengubah)</span>}
            </label>
            <input id="gurumodal-field-25" aria-label="Password"
              type="text"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder={guru ? "Kosongkan jika tidak ingin mengubah" : "Otomatis dari Tgl Lahir"}
              required={!guru}
            />
          </div>

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

</fieldset></AppDialog>
  )
}

export default GuruModal
