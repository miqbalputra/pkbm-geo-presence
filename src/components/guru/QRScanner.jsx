import { useState, useEffect, useRef, useCallback } from 'react'
import { QrCode, Camera, X, AlertCircle, CheckCircle, RefreshCcw } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { qrScanAPI } from '../../services/api'
import { getReliableUserLocation, getLastKnownLocation, getLocationErrorMessage } from '../../utils/geoLocation'

function QRScanner({ onClose, onSuccess, onPiketRestriction, attendanceStatus, settings, initialLocation }) {
    const [error, setError] = useState('')
    const [scanning, setScanning] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [successMsg, setSuccessMsg] = useState('') // '' = belum sukses
    const [manualInput, setManualInput] = useState(false)
    const [manualQRData, setManualQRData] = useState('')
    const [location, setLocation] = useState(initialLocation || null)
    const [facingMode, setFacingMode] = useState('environment')

    const scannerRef = useRef(null)
    const isMounted = useRef(true)       // Guard: jangan update state setelah unmount
    const isProcessing = useRef(false)   // Guard: jangan proses 2x scan sekaligus
    const timeoutRefs = useRef([])       // Track semua timeout supaya bisa di-clear

    // Helper: state-safe setter (tidak update jika sudah unmount)
    const safeSetError = useCallback((v) => { if (isMounted.current) setError(v) }, [])
    const safeSetScanning = useCallback((v) => { if (isMounted.current) setScanning(v) }, [])
    const safeSetProcessing = useCallback((v) => { if (isMounted.current) setProcessing(v) }, [])
    const safeSetSuccessMsg = useCallback((v) => { if (isMounted.current) setSuccessMsg(v) }, [])
    const safeSetLocation = useCallback((v) => { if (isMounted.current) setLocation(v) }, [])

    // Helper: schedule timeout dan track agar bisa di-clear saat unmount
    const safeTimeout = useCallback((fn, ms) => {
        const id = setTimeout(() => {
            if (isMounted.current) fn()
        }, ms)
        timeoutRefs.current.push(id)
        return id
    }, [])

    // Cleanup saat unmount: tandai isMounted=false, clear semua timeout, stop scanner
    useEffect(() => {
        isMounted.current = true
        return () => {
            isMounted.current = false
            isProcessing.current = false
            // Clear semua setTimeout yang masih pending
            timeoutRefs.current.forEach(id => clearTimeout(id))
            timeoutRefs.current = []
            // Stop scanner tanpa menunggu (fire and forget)
            if (scannerRef.current) {
                try {
                    if (scannerRef.current.isScanning) {
                        scannerRef.current.stop().catch(() => {})
                    }
                } catch (_) {}
                scannerRef.current = null
            }
        }
    }, [])

    // Load GPS location
    useEffect(() => {
        if (initialLocation) {
            safeSetLocation(initialLocation)
            return
        }

        if (settings?.mode_testing === '1') {
            safeSetLocation({
                latitude: parseFloat(settings?.sekolah_latitude || -5.1477),
                longitude: parseFloat(settings?.sekolah_longitude || 119.4327)
            })
            return
        }

        const cached = getLastKnownLocation(30000)
        if (cached && (!cached.accuracy || cached.accuracy <= 120)) {
            safeSetLocation(cached)
            return
        }

        getReliableUserLocation({ minAccuracy: 120, cacheMaxAgeMs: 30000, firstTimeout: 10000, retryTimeout: 5000 })
            .then(safeSetLocation)
            .catch((err) => {
                console.error('GPS Error:', err)
                safeSetError(getLocationErrorMessage(err))
            })
    }, [initialLocation, settings, safeSetError, safeSetLocation])

    // Stop scanner helper
    const stopScanner = useCallback(async () => {
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop()
                }
            } catch (err) {
                console.error('Stop scanner error:', err)
            }
        }
        safeSetScanning(false)
    }, [safeSetScanning])

    // Start scanner
    const startScanner = useCallback(() => {
        safeSetError('')
        safeSetScanning(true)
        safeTimeout(() => initScanner(), 250)
    }, [safeSetError, safeSetScanning, safeTimeout])

    const initScanner = useCallback(async () => {
        if (!isMounted.current) return

        try {
            const readerEl = document.getElementById('reader')
            if (!readerEl) {
                safeSetError('Komponen kamera tidak ditemukan. Coba reload halaman.')
                safeSetScanning(false)
                return
            }

            // Bersihkan instance lama
            if (scannerRef.current) {
                try {
                    if (scannerRef.current.isScanning) {
                        await scannerRef.current.stop()
                    }
                    scannerRef.current.clear()
                } catch (_) {}
                scannerRef.current = null
            }

            if (!isMounted.current) return

            scannerRef.current = new Html5Qrcode('reader')

            await scannerRef.current.start(
                { facingMode },
                { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
                (decodedText) => { handleQRDetected(decodedText) },
                () => { /* Abaikan error per-frame */ }
            )
        } catch (err) {
            console.error('Start scanner error:', err)
            if (!isMounted.current) return
            let msg = 'Gagal membuka kamera.'
            if (err?.message) {
                if (err.message.includes('Permission') || err.message.includes('denied')) {
                    msg = 'Izin kamera ditolak. Mohon izinkan akses kamera di browser.'
                } else if (err.message.includes('in use') || err.message.includes('Busy')) {
                    msg = 'Kamera sedang digunakan aplikasi lain. Tutup dan coba lagi.'
                } else {
                    msg = 'Gagal membuka kamera: ' + err.message
                }
            }
            safeSetError(msg)
            safeSetScanning(false)
        }
    }, [facingMode, safeSetError, safeSetScanning])

    const toggleCamera = useCallback(async () => {
        const nextMode = facingMode === 'environment' ? 'user' : 'environment'
        setFacingMode(nextMode)
        if (scanning) {
            await stopScanner()
            safeTimeout(() => startScanner(), 300)
        }
    }, [facingMode, scanning, stopScanner, startScanner, safeTimeout])

    // Handler utama ketika QR terdeteksi
    const handleQRDetected = useCallback(async (qrData) => {
        // Gunakan ref agar tidak ada race condition meski di-call berkali-kali
        if (isProcessing.current) return
        isProcessing.current = true

        if (navigator.vibrate) navigator.vibrate(100)

        // Stop scanner lebih dulu sebelum proses API
        await stopScanner()

        safeSetProcessing(true)
        safeSetError('')

        try {
            let currentLocation = location
            const TESTING_MODE = settings?.mode_testing == '1'

            if (!currentLocation) {
                if (TESTING_MODE) {
                    currentLocation = {
                        latitude: parseFloat(settings?.sekolah_latitude || -5.1477),
                        longitude: parseFloat(settings?.sekolah_longitude || 119.4327)
                    }
                } else {
                    currentLocation = getLastKnownLocation(30000) || await getReliableUserLocation({
                        minAccuracy: 120,
                        cacheMaxAgeMs: 30000,
                        firstTimeout: 10000,
                        retryTimeout: 5000
                    })
                    safeSetLocation(currentLocation)
                }
            }

            const isPulang = attendanceStatus?.has_checked_in && !attendanceStatus?.has_checked_out

            // Panggil API — fetchAPI akan throw jika success:false
            const response = await qrScanAPI.submit(
                qrData,
                currentLocation.latitude,
                currentLocation.longitude,
                isPulang
            )

            // Berhasil!
            if (!isMounted.current) return // komponen sudah unmount, jangan lakukan apapun

            safeSetProcessing(false)
            safeSetSuccessMsg(response.message || 'Presensi Berhasil!')

            // Tampilkan success 1.5 detik lalu panggil onSuccess di parent
            safeTimeout(() => {
                if (onSuccess) onSuccess(response)
            }, 1500)

        } catch (err) {
            if (!isMounted.current) return

            // KHUSUS: Cek apakah error karena batasan piket
            if (err.message && err.message.startsWith('PIKET_RESTRICTION|')) {
                const jam = err.message.split('|')[1]
                if (onPiketRestriction) {
                    onPiketRestriction(jam, qrData)
                    return // Jangan reset scanning dulu, parent akan handle
                }
            }

            isProcessing.current = false // reset agar bisa scan lagi
            safeSetProcessing(false)
            safeSetError(err.message || 'Gagal memproses QR Code')

            // Reset state scanning setelah 1.5 detik agar user bisa coba lagi
            safeTimeout(() => {
                safeSetScanning(false)
            }, 1500)
        }
    }, [location, settings, attendanceStatus, stopScanner, onSuccess,
        safeSetError, safeSetProcessing, safeSetSuccessMsg, safeSetScanning, safeTimeout])

    const handleManualSubmit = useCallback(() => {
        if (!manualQRData.trim()) return
        handleQRDetected(manualQRData)
    }, [manualQRData, handleQRDetected])

    const isSuccess = successMsg !== ''

    return (
        <div className="fixed inset-0 z-[60] bg-gray-900 flex flex-col items-stretch overflow-hidden font-sans">
            {/* Header */}
            <div className="bg-white/5 backdrop-blur-md p-4 flex items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500 rounded-lg">
                        <QrCode className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-white font-bold leading-tight">Presensi QR Code</h2>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${location ? 'bg-green-500' : 'bg-orange-500 animate-pulse'}`}></span>
                            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                                {location ? 'Lokasi Terdeteksi' : 'Mencari GPS...'}
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                    <X className="w-6 h-6 text-white" />
                </button>
            </div>

            {/* Main View */}
            <div className="flex-1 relative flex flex-col bg-[#0f172a]">

                {/* Processing Overlay */}
                {processing && !isSuccess && (
                    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
                        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                        <p className="text-white font-bold mt-4 tracking-wide">MEMPROSES DATA...</p>
                    </div>
                )}

                {/* SUCCESS SCREEN — full overlay, tidak render ulang parent sampai onSuccess dipanggil */}
                {isSuccess && (
                    <div className="absolute inset-0 z-50 bg-green-500 flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl transform animate-bounce">
                            <CheckCircle className="w-14 h-14 text-green-500" />
                        </div>
                        <h2 className="text-white text-3xl font-black mb-2 uppercase tracking-tighter">BERHASIL!</h2>
                        <p className="text-green-50 text-lg font-medium">{successMsg}</p>
                        <p className="text-green-100 text-sm mt-4 opacity-75">Menutup otomatis...</p>
                    </div>
                )}

                {/* Camera/Scanner View — hanya tampil saat belum sukses */}
                {!isSuccess && (
                    <div className="flex-1 flex flex-col relative overflow-hidden">
                        {scanning ? (
                            <div className="flex-1 relative flex flex-col">
                                {/* HTML5 QR Reader Container */}
                                <div id="reader" className="flex-1 overflow-hidden pointer-events-none"></div>

                                {/* Overlay scanning box */}
                                <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
                                    <div className="w-64 h-64 border-4 border-white/40 rounded-3xl relative">
                                        <div className="absolute -top-1 -left-1 w-8 h-8 border-t-8 border-l-8 border-blue-500 rounded-tl-2xl"></div>
                                        <div className="absolute -top-1 -right-1 w-8 h-8 border-t-8 border-r-8 border-blue-500 rounded-tr-2xl"></div>
                                        <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-8 border-l-8 border-blue-500 rounded-bl-2xl"></div>
                                        <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-8 border-r-8 border-blue-500 rounded-br-2xl"></div>
                                        <div className="absolute top-0 left-4 right-4 h-1 bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.8)] animate-scan-line rounded-full"></div>
                                    </div>
                                    <p className="text-white text-sm font-bold mt-8 bg-black/40 px-4 py-2 rounded-full backdrop-blur-md border border-white/10">
                                        Posisikan QR Code di dalam kotak
                                    </p>
                                </div>

                                {/* Floating Controls */}
                                <div className="absolute bottom-10 left-0 right-0 z-20 flex justify-center gap-6 px-6">
                                    <button
                                        onClick={toggleCamera}
                                        className="bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 p-4 rounded-2xl flex flex-col items-center gap-1 transition-all"
                                    >
                                        <RefreshCcw className="w-6 h-6 text-white" />
                                        <span className="text-[10px] text-white font-bold uppercase tracking-widest">Kamera</span>
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="bg-red-500 hover:bg-red-600 shadow-lg p-4 rounded-2xl flex flex-col items-center gap-1 transition-all"
                                    >
                                        <X className="w-6 h-6 text-white" />
                                        <span className="text-[10px] text-white font-bold uppercase tracking-widest">Batal</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                <div className="w-32 h-32 bg-blue-600/10 border-2 border-blue-500/20 rounded-3xl flex items-center justify-center mb-8 relative">
                                    <QrCode className="w-16 h-16 text-blue-500" />
                                    <div className="absolute inset-0 bg-blue-500 animate-pulse opacity-5 rounded-3xl"></div>
                                </div>
                                <h3 className="text-white text-xl font-bold mb-3 tracking-tight">Scanner Siap</h3>
                                <p className="text-gray-400 text-sm mb-10 leading-relaxed max-w-[280px]">
                                    Arahkan kamera ke QR Code yang tersedia di lokasi sekolah untuk presensi otomatis
                                </p>
                                <button
                                    onClick={startScanner}
                                    className="w-full max-w-[280px] py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-500/30 flex items-center justify-center gap-3 transition-transform active:scale-95"
                                >
                                    <Camera className="w-6 h-6" />
                                    BUKA KAMERA
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Error Banner */}
                {error && !isSuccess && (
                    <div className="px-6 py-4 bg-red-600/10 border-t border-red-500/20 flex items-start gap-4">
                        <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-1" />
                        <div className="text-left">
                            <p className="text-red-500 font-bold text-sm">GAGAL SCAN</p>
                            <p className="text-red-400 text-xs leading-relaxed">{error}</p>
                        </div>
                    </div>
                )}

                {/* Manual Fallback */}
                {!isSuccess && !processing && (
                    <div className="px-6 pb-12 pt-4 flex flex-col items-center">
                        <button
                            onClick={() => setManualInput(!manualInput)}
                            className="text-gray-500 hover:text-gray-300 text-[11px] font-bold uppercase tracking-widest transition-colors mb-4"
                        >
                            {manualInput ? 'Sembunyikan Input Manual' : 'Scanner bermasalah? Masukkan kode'}
                        </button>
                        {manualInput && (
                            <div className="w-full space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10">
                                <textarea
                                    value={manualQRData}
                                    onChange={(e) => setManualQRData(e.target.value)}
                                    placeholder="Paste data QR di sini..."
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                                    rows={2}
                                />
                                <button
                                    onClick={handleManualSubmit}
                                    className="w-full py-3 bg-white text-black font-black uppercase text-xs tracking-widest rounded-xl hover:bg-gray-200 transition-colors"
                                >
                                    SUBMIT KODE
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes scan-line {
                    0% { top: 0; }
                    50% { top: 100%; }
                    100% { top: 0; }
                }
                .animate-scan-line {
                    animation: scan-line 2s ease-in-out infinite;
                }
                #reader video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                }
            ` }} />
        </div>
    )
}

export default QRScanner
