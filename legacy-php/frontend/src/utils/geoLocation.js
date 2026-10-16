// Haversine Formula untuk menghitung jarak antara 2 koordinat
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3 // Radius bumi dalam meter
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Jarak dalam meter
}

let lastKnownLocation = null
let warmupPromise = null

const normalizePosition = (position) => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy,
  timestamp: position.timestamp || Date.now()
})

export const getLocationErrorMessage = (error) => {
  if (!error) {
    return 'Gagal mendapatkan lokasi. Pastikan GPS aktif dan izin lokasi diberikan.'
  }

  if (error.code === 1) {
    return 'Izin lokasi ditolak. Buka pengaturan browser, izinkan lokasi untuk situs ini, lalu coba lagi.'
  }

  if (error.code === 2) {
    return 'Lokasi belum tersedia. Pastikan GPS aktif, mode akurasi tinggi menyala, dan coba di area yang lebih terbuka.'
  }

  if (error.code === 3) {
    return 'GPS terlalu lama merespons. Pastikan GPS aktif lalu coba lagi.'
  }

  return error.message || 'Gagal mendapatkan lokasi. Pastikan GPS aktif dan izin lokasi diberikan.'
}

export const getLastKnownLocation = (maxAgeMs = 15000) => {
  if (!lastKnownLocation) return null
  if (Date.now() - lastKnownLocation.timestamp > maxAgeMs) return null
  return lastKnownLocation
}

// Fungsi untuk mendapatkan lokasi user
export const getUserLocation = (options = {}) => {
  const {
    timeout = 12000,
    maximumAge = 10000,
    enableHighAccuracy = true
  } = options

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung oleh browser Anda'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = normalizePosition(position)
        lastKnownLocation = location
        resolve(location)
      },
      (error) => {
        reject(error)
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge
      }
    )
  })
}

export const warmUpUserLocation = () => {
  if (warmupPromise) return warmupPromise

  warmupPromise = getUserLocation({
    timeout: 15000,
    maximumAge: 30000,
    enableHighAccuracy: true
  }).finally(() => {
    warmupPromise = null
  })

  return warmupPromise
}

export const getReliableUserLocation = async (options = {}) => {
  const {
    minAccuracy = 80,
    cacheMaxAgeMs = 15000,
    firstTimeout = 12000,
    retryTimeout = 8000
  } = options

  const cached = getLastKnownLocation(cacheMaxAgeMs)
  if (cached && (!cached.accuracy || cached.accuracy <= minAccuracy)) {
    return cached
  }

  let bestLocation = cached

  try {
    const fresh = await getUserLocation({
      timeout: firstTimeout,
      maximumAge: cacheMaxAgeMs,
      enableHighAccuracy: true
    })
    bestLocation = fresh

    if (!fresh.accuracy || fresh.accuracy <= minAccuracy) {
      return fresh
    }
  } catch (error) {
    if (bestLocation) return bestLocation
    throw error
  }

  try {
    const retry = await getUserLocation({
      timeout: retryTimeout,
      maximumAge: 0,
      enableHighAccuracy: true
    })

    if (!bestLocation || (retry.accuracy || Infinity) < (bestLocation.accuracy || Infinity)) {
      bestLocation = retry
    }
  } catch (_) {
    // Use the best location from the first attempt.
  }

  return bestLocation
}

// Validasi apakah user berada dalam radius sekolah
export const validateLocation = (userLat, userLon, schoolLat, schoolLon, radius) => {
  const distance = calculateDistance(userLat, userLon, schoolLat, schoolLon)
  return {
    isValid: distance <= radius,
    distance: Math.round(distance)
  }
}
