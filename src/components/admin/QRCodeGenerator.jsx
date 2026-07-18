import { useState, useEffect, useRef } from 'react'
import { QrCode, Copy, RefreshCw, Download, Printer, CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { qrGenerateAPI } from '../../services/api'

function QRCodeGenerator() {
    const [qrData, setQrData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [regenerating, setRegenerating] = useState(false)
    const [copied, setCopied] = useState(false)
    const [message, setMessage] = useState({ type: '', text: '' })
    const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
    const qrRef = useRef(null)

    useEffect(() => {
        loadQRData()
    }, [])

    const loadQRData = async () => {
        setLoading(true)
        try {
            const response = await qrGenerateAPI.generate()
            if (response.success) {
                setQrData(response.data)
            } else {
                setMessage({ type: 'error', text: response.message || 'Gagal memuat data QR Code' })
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message || 'Gagal memuat data QR Code' })
        } finally {
            setLoading(false)
        }
    }

    const handleCopy = async () => {
        if (qrData?.qr_data) {
            try {
                await navigator.clipboard.writeText(qrData.qr_data)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
            } catch (err) {
                setMessage({ type: 'error', text: 'Gagal menyalin ke clipboard' })
            }
        }
    }

    const handleRegenerate = async () => {
        setShowRegenerateConfirm(false)
        setRegenerating(true)
        try {
            const response = await qrGenerateAPI.regenerateSecret()
            if (response.success) {
                setMessage({ type: 'success', text: 'QR Secret berhasil diperbarui!' })
                loadQRData()
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message || 'Gagal memperbarui secret' })
        } finally {
            setRegenerating(false)
        }
    }

    const handleDownload = () => {
        const canvas = qrRef.current?.querySelector('canvas')
        if (canvas) {
            const link = document.createElement('a')
            link.download = `QR_Presensi_${qrData?.school_name || 'Sekolah'}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
        }
    }

    const handlePrint = () => {
        const canvas = qrRef.current?.querySelector('canvas')
        if (!canvas) return

        const printWindow = window.open('', '_blank')
        printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code Presensi - ${qrData?.school_name || 'Sekolah'}</title>
        <style>
          @page { size: A4; margin: 2cm; }
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 40px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            border: 3px solid #333;
            border-radius: 20px;
            padding: 40px;
          }
          h1 { 
            color: #1e40af; 
            margin-bottom: 10px;
            font-size: 28px;
          }
          h2 {
            color: #333;
            font-size: 20px;
            margin-bottom: 30px;
          }
          .qr-container {
            display: inline-block;
            padding: 20px;
            background: #f8fafc;
            border-radius: 16px;
            margin: 20px 0;
          }
          .instructions {
            text-align: left;
            background: #f0f9ff;
            padding: 20px;
            border-radius: 12px;
            margin-top: 30px;
          }
          .instructions h3 {
            color: #1e40af;
            margin-bottom: 10px;
          }
          .instructions ol {
            margin: 0;
            padding-left: 20px;
          }
          .instructions li {
            margin-bottom: 8px;
            color: #374151;
          }
          .footer {
            margin-top: 30px;
            color: #6b7280;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📱 QR Code Presensi</h1>
          <h2>${qrData?.school_name || 'Sekolah'}</h2>
          <div class="qr-container">
            <img src="${canvas.toDataURL('image/png')}" alt="QR Code" width="256" height="256" />
          </div>
          <div class="instructions">
            <h3>📋 Cara Menggunakan:</h3>
            <ol>
              <li>Buka aplikasi Presensi di HP Anda</li>
              <li>Klik tombol "Scan QR Code"</li>
              <li>Arahkan kamera ke QR code ini</li>
              <li>Presensi otomatis tercatat!</li>
            </ol>
          </div>
          <div class="footer">
            <p>Dicetak pada: ${new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}</p>
          </div>
        </div>
      </body>
      </html>
    `)
        printWindow.document.close()
        printWindow.print()
    }

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Memuat data QR Code...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                            <QrCode className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">QR Code Presensi</h2>
                            <p className="text-blue-100">Generate dan cetak QR Code untuk presensi guru</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Message */}
                    {message.text && (
                        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                            }`}>
                            {message.type === 'success' ?
                                <CheckCircle className="w-5 h-5 flex-shrink-0" /> :
                                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                            }
                            <p>{message.text}</p>
                        </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* QR Code Display */}
                        <div className="text-center">
                            <div className="bg-gray-50 rounded-2xl p-8 inline-block">
                                <div ref={qrRef} className="mb-4">
                                    {qrData?.qr_data ? (
                                        <QRCodeCanvas
                                            value={qrData.qr_data}
                                            size={256}
                                            level="H"
                                            includeMargin={true}
                                        />
                                    ) : (
                                        <div className="w-64 h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                                            <p className="text-gray-500 text-sm">QR tidak tersedia</p>
                                        </div>
                                    )}
                                </div>
                                <p className="text-gray-600 font-medium">{qrData?.school_name || 'Sekolah'}</p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap gap-3 justify-center mt-6">
                                <button
                                    onClick={handleDownload}
                                    disabled={!qrData?.qr_data}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    Download
                                </button>
                                <button
                                    onClick={handlePrint}
                                    disabled={!qrData?.qr_data}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                                >
                                    <Printer className="w-4 h-4" />
                                    Print
                                </button>
                                <button
                                    onClick={handleCopy}
                                    disabled={!qrData?.qr_data}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 transition-colors"
                                >
                                    {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {copied ? 'Tersalin!' : 'Copy Data'}
                                </button>
                            </div>
                        </div>

                        {/* Instructions */}
                        <div className="space-y-6">
                            <div className="bg-blue-50 rounded-xl p-6">
                                <h3 className="font-bold text-blue-800 mb-4 flex items-center gap-2">
                                    <Info className="w-5 h-5" />
                                    Petunjuk Penggunaan
                                </h3>
                                <ol className="space-y-3 text-blue-700">
                                    <li className="flex items-start gap-2">
                                        <span className="w-6 h-6 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                                        <span>Cetak QR Code ini dan tempel di lokasi strategis (ruang guru, pintu masuk)</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="w-6 h-6 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                                        <span>Guru buka aplikasi presensi dan klik tombol "Scan QR Code"</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="w-6 h-6 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                                        <span>Arahkan kamera HP ke QR Code</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="w-6 h-6 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">4</span>
                                        <span>Presensi otomatis tercatat jika lokasi valid!</span>
                                    </li>
                                </ol>
                            </div>

                            {/* Regenerate Section */}
                            <div className="bg-yellow-50 rounded-xl p-6">
                                <h3 className="font-bold text-yellow-800 mb-3 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    Regenerate QR Secret
                                </h3>
                                <p className="text-yellow-700 text-sm mb-4">
                                    Jika Anda mencurigai QR Code telah bocor atau disalahgunakan,
                                    Anda dapat membuat secret baru. QR Code lama tidak akan berfungsi lagi.
                                </p>
                                <button
                                    onClick={() => setShowRegenerateConfirm(true)}
                                    disabled={regenerating}
                                    className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-400 transition-colors"
                                >
                                    <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                                    {regenerating ? 'Memproses...' : 'Regenerate Secret'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            {showRegenerateConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl max-w-md w-full p-6">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-8 h-8 text-yellow-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Yakin Regenerate Secret?</h3>
                            <p className="text-gray-600">
                                QR Code yang sudah dicetak tidak akan berfungsi lagi.
                                Anda perlu mencetak ulang dan memasang QR Code baru.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowRegenerateConfirm(false)}
                                className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleRegenerate}
                                className="flex-1 py-3 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 transition-colors"
                            >
                                Ya, Regenerate
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default QRCodeGenerator
