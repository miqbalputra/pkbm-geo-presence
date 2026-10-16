import { Notice } from '../ui/page'
import { AppDialog } from '../ui/dialog'
import { useState, useEffect, useRef } from 'react'
import { UserPlus, Calendar, Clock, FileText, CheckCircle, AlertCircle, X, Search } from 'lucide-react'
import { manualEntryAPI } from '../../services/api'

function ManualEntry() {
    const [gurus, setGurus] = useState([])
  const loadRequest = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => () => { loadRequest.current++ }, [])
  const [loading, setLoading] = useState(true)
    const submitRef = useRef(false)
    const [validation, setValidation] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [message, setMessage] = useState({ type: '', text: '' })
    const [showModal, setShowModal] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    const [formData, setFormData] = useState({
        user_id: '',
        tanggal: new Date().toISOString().split('T')[0],
        status: 'hadir',
        jam_masuk: '07:00',
        jam_pulang: '',
        reason: ''
    })

    const [selectedGuru, setSelectedGuru] = useState(null)

    useEffect(() => {
        loadGurus()
    }, [])

    const loadGurus = async () => {
    const requestId = ++loadRequest.current
    setLoadError(null)
    setLoading(true)

        try {
            const response = await manualEntryAPI.getGurus()
      if (requestId !== loadRequest.current) return

            if (response.success) {
                setGurus(response.data)
            }
        } catch (err) {
      if (requestId !== loadRequest.current) return
      setLoadError('Data belum dapat dimuat. Periksa koneksi lalu coba lagi.')

            setMessage({ type: 'error', text: 'Gagal memuat daftar guru' })
        } finally {
            requestId === loadRequest.current && setLoading(false)
        }
    }

    const filteredGurus = gurus.filter(guru =>
        guru.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        guru.id_guru?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleSelectGuru = (guru) => {
        setSelectedGuru(guru)
        setFormData(prev => ({ ...prev, user_id: guru.id }))
        setShowModal(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (submitRef.current) return
        setValidation(true)

        if (!formData.user_id) {
            setMessage({ type: 'error', text: 'Pilih guru terlebih dahulu' })
            return
        }

        if (!formData.reason.trim()) {
            setMessage({ type: 'error', text: 'Alasan presensi manual wajib diisi' })
            return
        }

        submitRef.current = true
        setSubmitting(true)
        setMessage({ type: '', text: '' })

        try {
            const response = await manualEntryAPI.submit(formData)
            if (response.success) {
                setMessage({ type: 'success', text: response.message })
                // Reset form
                setFormData({
                    user_id: '',
                    tanggal: new Date().toISOString().split('T')[0],
                    status: 'hadir',
                    jam_masuk: '07:00',
                    jam_pulang: '',
                    reason: ''
                })
                setSelectedGuru(null)
                setValidation(false)
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message || 'Gagal menyimpan presensi manual' })
        } finally {
            submitRef.current = false
            setSubmitting(false)
        }
    }

    const statusOptions = [
        { value: 'hadir', label: 'Hadir', color: 'bg-green-500' },
        { value: 'hadir_terlambat', label: 'Hadir Terlambat', color: 'bg-yellow-500' },
        { value: 'izin', label: 'Izin', color: 'bg-blue-500' },
        { value: 'sakit', label: 'Sakit', color: 'bg-red-500' }
    ]

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Memuat data...</p>
            </div>
        )
    }

    if (loadError) return <Notice onRetry={() => loadGurus()}>{loadError}</Notice>

  return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                {/* Header */}
                <div className="border-b border-border p-6 text-foreground">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center">
                            <UserPlus className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Presensi Manual</h2>
                            <p className="text-muted-foreground">Input presensi manual untuk kondisi darurat</p>
                        </div>
                    </div>
                </div>

                {/* Warning Banner */}
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 m-6 rounded-r-lg">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-yellow-800">Perhatian!</h4>
                            <p className="text-yellow-700 text-sm">
                                Fitur ini hanya untuk kondisi darurat seperti HP guru rusak, GPS error, atau masalah teknis lainnya.
                                Setiap presensi manual akan tercatat dengan alasan dan dicatat siapa yang menginputnya.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 pt-0 space-y-6">
                    {/* Message */}
                    {message.text && (
                        <div className={`p-4 rounded-lg flex items-start gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                            }`}>
                            {message.type === 'success' ?
                                <CheckCircle className="w-5 h-5 flex-shrink-0" /> :
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            }
                            <p>{message.text}</p>
                        </div>
                    )}

                    {validation && !formData.user_id && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">Pilih guru terlebih dahulu.</p>}
                    {/* Select Guru */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Pilih Guru <span className="text-red-500">*</span>
                        </label>
                        <button
                            type="button"
                            aria-label="Pilih guru" aria-invalid={validation && !formData.user_id} onClick={() => setShowModal(true)}
                            className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                        >
                            {selectedGuru ? (
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                        <span className="text-blue-600 font-bold">{selectedGuru.nama.charAt(0)}</span>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-800">{selectedGuru.nama}</p>
                                        <p className="text-sm text-gray-500">{selectedGuru.id_guru || 'Tanpa ID'}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 text-gray-500">
                                    <UserPlus className="w-6 h-6" />
                                    <span>Klik untuk memilih guru...</span>
                                </div>
                            )}
                        </button>
                    </div>

                    {/* Date & Time */}
                    <div className="grid md:grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="manualentry-field-48" className="block text-sm font-semibold text-gray-700 mb-2">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                Tanggal <span className="text-red-500">*</span>
                            </label>
                            <input id="manualentry-field-48" aria-label="Tanggal"
                                type="date"
                                value={formData.tanggal}
                                onChange={(e) => setFormData(prev => ({ ...prev, tanggal: e.target.value }))}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="manualentry-field-49" className="block text-sm font-semibold text-gray-700 mb-2">
                                <Clock className="w-4 h-4 inline mr-1" />
                                Jam Masuk
                            </label>
                            <input id="manualentry-field-49" aria-label="Jam Masuk"
                                type="time"
                                value={formData.jam_masuk}
                                onChange={(e) => setFormData(prev => ({ ...prev, jam_masuk: e.target.value }))}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="manualentry-field-50" className="block text-sm font-semibold text-gray-700 mb-2">
                                <Clock className="w-4 h-4 inline mr-1" />
                                Jam Pulang
                            </label>
                            <input id="manualentry-field-50" aria-label="Jam Pulang"
                                type="time"
                                value={formData.jam_pulang}
                                onChange={(e) => setFormData(prev => ({ ...prev, jam_pulang: e.target.value }))}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Opsional"
                            />
                        </div>
                    </div>

                    {/* Status */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Status Presensi <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {statusOptions.map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, status: option.value }))}
                                    className={`p-3 rounded-lg border-2 font-semibold transition-all ${formData.status === option.value
                                            ? `${option.color} text-white border-transparent`
                                            : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                                        }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Reason */}
                    <div>
                        <label htmlFor="manualentry-field-51" className="block text-sm font-semibold text-gray-700 mb-2">
                            <FileText className="w-4 h-4 inline mr-1" />
                            Alasan Presensi Manual <span className="text-red-500">*</span>
                        </label>
                        <textarea id="manualentry-field-51" aria-label="Alasan Presensi Manual"
                            value={formData.reason}
                            onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                            placeholder="Contoh: HP guru rusak, GPS tidak berfungsi, dll..."
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            rows={3}
                            required
                        />
                    </div>

                    {validation && !formData.reason.trim() && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">Alasan presensi manual wajib diisi.</p>}
                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={submitting || !formData.user_id}
                        className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:bg-slate-400 transition-all flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Menyimpan...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-5 h-5" />
                                Simpan Presensi Manual
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* Guru Selection Modal */}
            {showModal && (
                <AppDialog open={true} onOpenChange={(open) => { if (!open) setShowModal(false) }} title="Pilih guru" busy={submitting}>
<fieldset disabled={submitting} className="min-w-0">


                        {/* Search */}
                        <div className="p-4 border-b">
                            <div className="relative">
                                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Cari nama guru..."
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-2">
                            {filteredGurus.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    Tidak ada guru ditemukan
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {filteredGurus.map(guru => (
                                        <button
                                            key={guru.id}
                                            onClick={() => handleSelectGuru(guru)}
                                            className="w-full p-3 flex items-center gap-3 hover:bg-blue-50 rounded-lg transition-colors text-left"
                                        >
                                            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                                                <span className="text-white font-bold">{guru.nama.charAt(0)}</span>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-800">{guru.nama}</p>
                                                <p className="text-sm text-gray-500">{guru.id_guru || 'Tanpa ID'}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

</fieldset></AppDialog>
            )}
        </div>
    )
}

export default ManualEntry
