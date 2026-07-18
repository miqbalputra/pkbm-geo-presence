import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Clock, MapPin, Navigation, RefreshCw, Users } from 'lucide-react'
import { locationTrackingAPI } from '../../services/api'
import { formatDateForInput } from '../../utils/dateUtils'

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value.replace(' ', 'T')).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function mapsUrl(point) {
  return `https://www.google.com/maps?q=${point.latitude},${point.longitude}`
}

function osmEmbedUrl(point) {
  const lat = parseCoordinate(point.latitude)
  const lon = parseCoordinate(point.longitude)
  const delta = 0.0012
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = parseFloat(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function getConfiguredPins(settings, apiPins = []) {
  const pins = [
    ...apiPins.map(pin => [pin.label, pin.latitude, pin.longitude]),
    ['Lokasi Sekolah/Pusat', settings.sekolah_latitude, settings.sekolah_longitude],
    ['Pos Guru Laki-laki', settings.lokasi_laki_latitude, settings.lokasi_laki_longitude],
    ['Pos Guru Perempuan', settings.lokasi_perempuan_latitude, settings.lokasi_perempuan_longitude],
    ['Lokasi Apel Senin', settings.lokasi_apel_latitude, settings.lokasi_apel_longitude]
  ]

  const uniquePins = []
  pins.forEach(([label, lat, lon]) => {
    const parsedLat = parseCoordinate(lat)
    const parsedLon = parseCoordinate(lon)
    if (parsedLat === null || parsedLon === null) return
    const existingPin = uniquePins.find(pin => pin.lat === parsedLat && pin.lon === parsedLon)
    if (existingPin) {
      if (!existingPin.label.includes(label)) existingPin.label = `${existingPin.label} / ${label}`
      return
    }
    uniquePins.push({ label, lat: parsedLat, lon: parsedLon })
  })

  return uniquePins
}

function getNearestPin(point, pins) {
  if (point?.nearest_pin_label && point.nearest_pin_distance !== null && point.nearest_pin_distance !== undefined) {
    const distance = parseFloat(point.nearest_pin_distance)
    return {
      label: point.nearest_pin_label,
      distance: Number.isFinite(distance) ? Math.round(distance) : point.nearest_pin_distance
    }
  }

  if (!point?.latitude || !point?.longitude || pins.length === 0) return null
  const lat = parseCoordinate(point.latitude)
  const lon = parseCoordinate(point.longitude)
  if (lat === null || lon === null) return null

  return pins.reduce((nearest, pin) => {
    const distance = calculateDistanceMeters(lat, lon, pin.lat, pin.lon)
    if (!nearest || distance < nearest.distance) {
      return { ...pin, distance }
    }
    return nearest
  }, null)
}

function formatNearestPin(point, pins) {
  const nearest = getNearestPin(point, pins)
  if (!nearest) return 'Pin terdekat belum tersedia'
  return `${nearest.distance}m dari ${nearest.label}`
}

function LocationTracking() {
  const [date, setDate] = useState(formatDateForInput(new Date()))
  const [items, setItems] = useState([])
  const [settings, setSettings] = useState({})
  const [serverPins, setServerPins] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedItem = useMemo(() => {
    return items.find(item => String(item.user_id) === String(selectedUserId)) || items.find(item => item.track_id) || items[0] || null
  }, [items, selectedUserId])

  const configuredPins = useMemo(() => getConfiguredPins(settings, serverPins), [settings, serverPins])
  const activeCount = items.filter(item => item.attendance_status && !item.jam_pulang).length
  const trackedCount = items.filter(item => item.track_id).length

  const loadLatest = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await locationTrackingAPI.getLatest(date)
      const nextItems = response.data?.items || []
      setItems(nextItems)
      setSettings(response.data?.settings || {})
      setServerPins(response.data?.pins || [])
      setSelectedUserId(prev => {
        if (prev && nextItems.some(item => String(item.user_id) === String(prev))) return prev
        return nextItems.find(item => item.track_id)?.user_id || nextItems[0]?.user_id || null
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async (userId = selectedItem?.user_id) => {
    if (!userId) return
    try {
      setHistoryLoading(true)
      const response = await locationTrackingAPI.getHistory(userId, date, 300)
      setHistory(response.data || [])
    } catch (err) {
      setError(err.message)
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadLatest()
  }, [date])

  useEffect(() => {
    if (selectedItem?.user_id) {
      loadHistory(selectedItem.user_id)
    } else {
      setHistory([])
    }
  }, [selectedItem?.user_id, date])

  useEffect(() => {
    const timer = setInterval(() => {
      loadLatest()
    }, 60000)
    return () => clearInterval(timer)
  }, [date])

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tracking Lokasi Guru</h1>
          <p className="text-sm text-gray-500 mt-1">Pantau titik lokasi terakhir guru yang sedang hadir.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={loadLatest}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-xs text-gray-500">Guru Hadir Aktif</p>
              <p className="text-2xl font-bold text-gray-800">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <MapPin className="w-8 h-8 text-emerald-600" />
            <div>
              <p className="text-xs text-gray-500">Sudah Ada Titik</p>
              <p className="text-2xl font-bold text-gray-800">{trackedCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-indigo-600" />
            <div>
              <p className="text-xs text-gray-500">Status Tracking</p>
              <p className="text-sm font-bold text-gray-800">
                {settings.location_tracking_enabled === '1'
                  ? `Aktif tiap ${settings.location_tracking_interval_minutes || 15} menit`
                  : 'Nonaktif'}
              </p>
              <p className="text-xs text-gray-500">Akurasi maks {settings.location_tracking_accuracy_limit || 100}m</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,440px)_1fr] gap-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800">Daftar Guru</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-[640px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-gray-500">Memuat data...</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Belum ada data guru.</div>
            ) : (
              items.map(item => {
                const selected = String(selectedItem?.user_id) === String(item.user_id)
                return (
                  <button
                    key={item.user_id}
                    type="button"
                    onClick={() => setSelectedUserId(item.user_id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{item.nama}</p>
                        <p className="text-xs text-gray-500">{item.id_guru || '-'} - {item.jenis_kelamin || '-'}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.track_id ? formatDateTime(item.recorded_at) : 'Belum ada titik lokasi'}
                        </p>
                        {item.track_id && (
                          <p className="text-xs text-blue-600 mt-1">
                            {formatNearestPin(item, configuredPins)}
                          </p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                        item.track_id ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {item.track_id ? `${Math.round(parseFloat(item.accuracy_meters || 0))}m` : 'kosong'}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-800">{selectedItem?.nama || 'Pilih Guru'}</h2>
                <p className="text-xs text-gray-500">
                  {selectedItem?.track_id ? `Lokasi terakhir ${formatDateTime(selectedItem.recorded_at)}` : 'Belum ada lokasi terakhir'}
                </p>
                {selectedItem?.track_id && (
                  <p className="text-xs text-blue-600 mt-1">{formatNearestPin(selectedItem, configuredPins)}</p>
                )}
              </div>
              {selectedItem?.track_id && (
                <a
                  href={mapsUrl(selectedItem)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Navigation className="w-4 h-4" />
                  Maps
                </a>
              )}
            </div>
            {selectedItem?.track_id ? (
              <iframe
                title="Peta lokasi guru"
                src={osmEmbedUrl(selectedItem)}
                className="w-full h-[360px] border-0"
                loading="lazy"
              />
            ) : (
              <div className="h-[360px] flex items-center justify-center bg-gray-50 text-gray-500">
                Belum ada titik lokasi untuk ditampilkan.
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Riwayat Titik Hari Ini</h2>
              {historyLoading && <span className="text-xs text-gray-500">Memuat...</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Waktu</th>
                    <th className="px-4 py-3 text-left font-semibold">Koordinat</th>
                    <th className="px-4 py-3 text-left font-semibold">Pin Terdekat</th>
                    <th className="px-4 py-3 text-left font-semibold">Akurasi</th>
                    <th className="px-4 py-3 text-left font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-6 text-center text-gray-500">Belum ada riwayat lokasi.</td>
                    </tr>
                  ) : (
                    history.slice(0, 80).map(point => (
                      <tr key={point.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{formatDateTime(point.recorded_at)}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {parseFloat(point.latitude).toFixed(6)}, {parseFloat(point.longitude).toFixed(6)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{formatNearestPin(point, configuredPins)}</td>
                        <td className="px-4 py-3 text-gray-700">{point.accuracy_meters ? `${Math.round(parseFloat(point.accuracy_meters))}m` : '-'}</td>
                        <td className="px-4 py-3">
                          <a
                            href={mapsUrl(point)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Buka
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LocationTracking
