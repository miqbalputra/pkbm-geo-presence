import { useState, useEffect } from 'react'
import {
  Bot, Zap, Plug, CheckCircle, XCircle, Loader, Server, Database,
  Key, List, Code, Clock, Send, Activity, Shield, Terminal, Info
} from 'lucide-react'

function AIAgent() {
  const [connectionStatus, setConnectionStatus] = useState(null) // null | 'loading' | 'connected' | 'error'
  const [connectionData, setConnectionData] = useState(null)
  const [errorDetail, setErrorDetail] = useState('')

  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    setConnectionStatus('loading')
    setErrorDetail('')
    try {
      const API_BASE = import.meta.env.VITE_API_URL || '/api'
      const response = await fetch(`${API_BASE}/hermes_connect.php`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setConnectionStatus('connected')
        setConnectionData(data.data)
      } else {
        setConnectionStatus('error')
        setErrorDetail(data.message || 'Gagal terhubung ke API')
      }
    } catch (error) {
      setConnectionStatus('error')
      setErrorDetail(error.message || 'Koneksi gagal')
    }
  }

  const endpoints = [
    {
      method: 'GET',
      path: '/api/hermes_connect.php',
      desc: 'Cek koneksi, status database, dan daftar endpoint yang tersedia',
      params: '-',
      auth: 'API Key',
    },
    {
      method: 'GET',
      path: '/api/hermes_presensi_overview.php',
      desc: 'Overview presensi menyeluruh (summary, per guru, belum presensi, lupa pulang, izin pulang awal)',
      params: 'period, start_date, end_date, user_id, include_logs, limit',
      auth: 'API Key',
    },
    {
      method: 'GET',
      path: '/api/hermes_presensi.php',
      desc: 'Ambil daftar data presensi dengan filter tanggal, guru, status',
      params: 'id, user_id, tanggal, start_date, end_date, status, limit, offset',
      auth: 'API Key',
    },
    {
      method: 'POST',
      path: '/api/hermes_presensi.php',
      desc: 'Tambah record presensi baru untuk seorang guru',
      params: 'userId/user_id, tanggal, status, jamMasuk, jamPulang, ...',
      auth: 'API Key',
    },
    {
      method: 'PUT',
      path: '/api/hermes_presensi.php',
      desc: 'Edit record presensi yang sudah ada',
      params: 'id + field presensi yang ingin diubah',
      auth: 'API Key',
    },
    {
      method: 'GET',
      path: '/api/n8n_guru.php',
      desc: 'Daftar semua guru aktif (untuk reference data di n8n)',
      params: '-',
      auth: 'N8N API Key',
    },
    {
      method: 'GET',
      path: '/api/n8n_presensi.php',
      desc: 'Data presensi hari ini (default) atau berdasarkan filter tanggal',
      params: 'tanggal, user_id',
      auth: 'N8N API Key',
    },
    {
      method: 'GET',
      path: '/api/n8n_guru_belum_presensi.php',
      desc: 'Daftar guru yang belum presensi hari ini (untuk reminder WhatsApp)',
      params: '-',
      auth: 'N8N API Key',
    },
    {
      method: 'POST',
      path: '/api/n8n_activity.php',
      desc: 'Catat aktivitas/log ke activity_logs',
      params: 'user, aktivitas, status',
      auth: 'N8N API Key',
    },
  ]

  const capabilities = [
    { label: 'Baca semua data presensi', enabled: true },
    { label: 'Tambah data presensi baru', enabled: true },
    { label: 'Edit data presensi yang ada', enabled: true },
    { label: 'Hapus data presensi', enabled: false },
    { label: 'Overview summary presensi', enabled: true },
    { label: 'Baca data guru aktif', enabled: true },
    { label: 'Cek guru yang belum presensi', enabled: true },
    { label: 'Catat log aktivitas', enabled: true },
  ]

  const validStatuses = ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat', 'izin', 'sakit']
  const validMetodes = ['button', 'qr_scan', 'manual']

  const payloadFields = [
    'id', 'userId / user_id', 'tanggal', 'status',
    'jamMasuk / jam_masuk', 'jamPulang / jam_pulang',
    'jamHadir / jam_hadir', 'jamIzin / jam_izin',
    'jamSakit / jam_sakit', 'keterangan',
    'latitude', 'longitude', 'metode'
  ]

  const cronSchedules = [
    { time: '08:00 WIB', desc: 'Cek & kirim reminder WhatsApp ke guru yang belum presensi' },
    { time: '09:00 WIB', desc: 'Cek & kirim reminder WhatsApp ke guru yang belum presensi' },
    { time: '10:00 WIB', desc: 'Cek & kirim reminder WhatsApp ke guru yang belum presensi' },
  ]

  const methodColor = (method) => {
    switch (method) {
      case 'GET': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'POST': return 'bg-green-100 text-green-700 border-green-200'
      case 'PUT': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'DELETE': return 'bg-red-100 text-red-700 border-red-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl">
          <Bot className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">AI Agent</h1>
          <p className="text-sm text-gray-600 mt-1">
            Integrasi Hermes Agent &amp; n8n untuk otomatisasi presensi
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
        <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-indigo-900">
          <p className="font-semibold">Apa itu Hermes Agent?</p>
          <p className="mt-1">
            Hermes Agent adalah jalur API khusus yang memungkinkan AI / agen otomasi
            (seperti n8n) untuk membaca, menambah, dan mengedit data presensi secara
            terprogram menggunakan <span className="font-mono font-bold">API Key</span>,
            tanpa perlu login manual. Jalur ini terpisah dari alur presensi guru
            (QR Scan / tombol) dan tidak terpengaruh oleh pengaturan jadwal piket.
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-bold text-gray-800">Status Koneksi</h2>
          </div>
          <button
            onClick={checkConnection}
            disabled={connectionStatus === 'loading'}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {connectionStatus === 'loading' ? (
              <><Loader className="w-4 h-4 animate-spin" /> Mengecek...</>
            ) : (
              <><Zap className="w-4 h-4" /> Cek Ulang</>
            )}
          </button>
        </div>

        {connectionStatus === 'connected' && connectionData && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">Terhubung &mdash; {connectionData.service}</p>
                <p className="text-sm text-green-700">
                  Status: {connectionData.status} &middot; Timezone: {connectionData.timezone}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Database className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-bold text-gray-500 uppercase">Database</span>
                </div>
                <p className={`text-lg font-bold ${connectionData.database?.connected ? 'text-green-600' : 'text-red-600'}`}>
                  {connectionData.database?.connected ? 'Terhubung' : 'Gagal'}
                </p>
                {connectionData.database?.latencyMs !== undefined && (
                  <p className="text-xs text-gray-500">Latency: {connectionData.database.latencyMs} ms</p>
                )}
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Key className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-bold text-gray-500 uppercase">Autentikasi</span>
                </div>
                <p className="text-sm font-bold text-gray-700">{connectionData.auth?.type || 'api_key'}</p>
                <p className="text-xs text-gray-500">Header: {connectionData.auth?.header || 'X-API-Key'}</p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Server className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-bold text-gray-500 uppercase">Dibangkitkan</span>
                </div>
                <p className="text-xs font-mono text-gray-600">{connectionData.generatedAt}</p>
              </div>
            </div>

            {/* Capabilities */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-bold text-gray-700">Kemampuan (Capabilities)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {capabilities.map((cap, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                    {cap.enabled ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className={`text-sm ${cap.enabled ? 'text-gray-700' : 'text-gray-400'}`}>
                      {cap.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {connectionStatus === 'loading' && (
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <Loader className="w-6 h-6 animate-spin text-blue-500" />
            <p className="text-gray-600">Menghubungi server...</p>
          </div>
        )}

        {connectionStatus === 'error' && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <XCircle className="w-6 h-6 text-red-500" />
            <div>
              <p className="font-semibold text-red-800">Gagal terhubung ke API Hermes</p>
              <p className="text-sm text-red-600">{errorDetail}</p>
            </div>
          </div>
        )}
      </div>

      {/* Autentikasi */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-bold text-gray-800">Autentikasi API Key</h2>
        </div>
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            Semua endpoint Hermes &amp; n8n memerlukan API Key yang dikirim via HTTP header
            <code className="mx-1 px-2 py-0.5 bg-gray-100 rounded text-gray-800 font-mono">X-API-Key</code>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-bold text-gray-700 mb-1">HERMES_API_KEY</p>
              <p className="text-xs text-gray-500">
                Dipakai oleh: <code className="font-mono">hermes_*.php</code><br/>
                Diterima juga: <code className="font-mono">N8N_API_KEY</code> (fallback)
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-bold text-gray-700 mb-1">N8N_API_KEY</p>
              <p className="text-xs text-gray-500">
                Dipakai oleh: <code className="font-mono">n8n_*.php</code><br/>
                Set via environment variable server
              </p>
            </div>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <span className="font-bold">Keamanan:</span> API Key disimpan di environment variable server
              (<code className="font-mono">.env</code>), bukan di kode aplikasi. Jangan pernah
              mengekspos API Key ke client/frontend.
            </p>
          </div>
        </div>
      </div>

      {/* Endpoint Reference */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-bold text-gray-800">Daftar Endpoint API</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-bold text-gray-600">Method</th>
                <th className="text-left py-2 px-3 font-bold text-gray-600">Endpoint</th>
                <th className="text-left py-2 px-3 font-bold text-gray-600 hidden md:table-cell">Deskripsi</th>
                <th className="text-left py-2 px-3 font-bold text-gray-600 hidden lg:table-cell">Parameter</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3">
                    <span className={`px-2 py-1 text-xs font-bold rounded border ${methodColor(ep.method)}`}>
                      {ep.method}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <code className="text-xs font-mono text-gray-800">{ep.path}</code>
                  </td>
                  <td className="py-2 px-3 text-gray-600 hidden md:table-cell">{ep.desc}</td>
                  <td className="py-2 px-3 text-xs text-gray-500 hidden lg:table-cell">{ep.params}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payload Fields */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Code className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-bold text-gray-800">Field Payload Presensi</h2>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Field yang dapat dikirim saat membuat (POST) atau mengedit (PUT) presensi.
          Mendukung format <span className="font-bold">camelCase</span> dan <span className="font-bold">snake_case</span>.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {payloadFields.map((field, i) => (
            <code key={i} className="px-3 py-1.5 bg-gray-100 rounded text-xs font-mono text-gray-700">
              {field}
            </code>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Status yang Valid</p>
            <div className="flex flex-wrap gap-2">
              {validStatuses.map(s => (
                <span key={s} className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded text-xs font-mono text-blue-700">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">Metode yang Valid</p>
            <div className="flex flex-wrap gap-2">
              {validMetodes.map(m => (
                <span key={m} className="px-2.5 py-1 bg-purple-50 border border-purple-200 rounded text-xs font-mono text-purple-700">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Webhook Reminder & Cron */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-bold text-gray-800">Otomatisasi &amp; Webhook Reminder</h2>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Sistem menjalankan cron job untuk mengecek guru yang belum presensi dan
              mengirim reminder WhatsApp otomatis. Konfigurasi webhook dapat diatur via
              menu <span className="font-bold">Pengaturan</span>.
            </p>
            <div className="space-y-2">
              {cronSchedules.map((cron, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-center w-16 h-16 bg-blue-100 rounded-lg flex-shrink-0">
                    <span className="text-xs font-bold text-blue-700">{cron.time}</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-700">{cron.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Send className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-bold text-gray-700">webhook_reminder.php</span>
              </div>
              <p className="text-xs text-gray-500">
                Cek guru belum presensi &rarr; kirim ke n8n webhook &rarr; WhatsApp.
                Dipanggil oleh cron job.
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Send className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-bold text-gray-700">webhook_reminder_direct.php</span>
              </div>
              <p className="text-xs text-gray-500">
                Kirim WhatsApp langsung via Gowa API (tanpa n8n).
                Dipanggil oleh cron job.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* n8n Workflow */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-bold text-gray-800">Workflow n8n</h2>
        </div>
        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-bold text-gray-700 text-sm">rekap-presensi-bulanan-whatsapp.json</p>
            <p className="text-xs text-gray-500 mt-1">
              Workflow n8n untuk rekap presensi bulanan yang dikirim via WhatsApp.
              File tersedia di folder <code className="font-mono">n8n/</code>.
            </p>
          </div>
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-start gap-2">
            <List className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-800">
              <p className="font-bold mb-1">Catatan Penting</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Jalur Hermes terpisah dari alur presensi guru (QR Scan / tombol)</li>
                <li>Hermes tidak terpengaruh pengaturan jadwal piket (toggle On/Off)</li>
                <li>Record presensi yang dibuat Hermes tidak melalui pengecekan geofence GPS</li>
                <li>API Key wajib dirahasiakan &mdash; hanya untuk server-to-server</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIAgent