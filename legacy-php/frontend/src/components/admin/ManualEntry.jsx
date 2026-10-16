import { useState, useEffect } from 'react'
import { UserPlus, Calendar, Clock, FileText, CheckCircle, AlertCircle, X, Search } from 'lucide-react'
import { manualEntryAPI } from '../../services/api'

function ManualEntry() {
    const [gurus, setGurus] = useState([])
    const [loading, setLoading] = useState(true)
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
        try {
            const response = await manualEntryAPI.getGurus()
            if (response.success) {
                setGurus(response.data)
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Gagal memuat daftar guru' })
        } finally {
            setLoading(false)
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

        if (!formData.user_id) {
            setMessage({ type: 'error', text: 'Pilih guru terlebih dahulu' })
            return
        }

        if (!formData.reason.trim()) {
            setMessage({ type: 'error', text: 'Alasan presensi manual wajib diisi' })
            return
        }

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
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message || 'Gagal menyimpan presensi manual' })
        } finally {
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

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                            <UserPlus className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Presensi Manual</h2>
                            <p className="text-orange-100">Input presensi manual untuk kondisi darurat</p>
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

                    {/* Select Guru */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Pilih Guru <span className="text-red-500">*</span>
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowModal(true)}
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
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                Tanggal <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={formData.tanggal}
                                onChange={(e) => setFormData(prev => ({ ...prev, tanggal: e.target.value }))}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <Clock className="w-4 h-4 inline mr-1" />
                                Jam Masuk
                            </label>
                            <input
                                type="time"
                                value={formData.jam_masuk}
                                onChange={(e) => setFormData(prev => ({ ...prev, jam_masuk: e.target.value }))}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <Clock className="w-4 h-4 inline mr-1" />
                                Jam Pulang
                            </label>
                            <input
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
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            <FileText className="w-4 h-4 inline mr-1" />
                            Alasan Presensi Manual <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={formData.reason}
                            onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                            placeholder="Contoh: HP guru rusak, GPS tidak berfungsi, dll..."
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            rows={3}
                            required
                        />
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={submitting || !formData.user_id}
                        className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-bold text-lg hover:from-orange-600 hover:to-red-600 disabled:from-gray-400 disabled:to-gray-500 transition-all flex items-center justify-center gap-2"
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-800">Pilih Guru</h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

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
                                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
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
                    </div>
                </div>
            )}
        </div>
    )
}

export default ManualEntry
