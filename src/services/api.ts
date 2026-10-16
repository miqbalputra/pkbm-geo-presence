// API Configuration
// GANTI dengan URL API Anda setelah deploy
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

let accessToken = null
let refreshInFlight = null

type FetchOptions = RequestInit & {
  timeoutMs?: number
  _retried?: boolean
  silent?: boolean
}

export const authTokenStore = {
  set(token) {
    accessToken = token || null
  },
  clear() {
    accessToken = null
  },
  get() {
    return accessToken
  },
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = fetch(`${API_BASE_URL}/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success || !data.data?.accessToken) {
        authTokenStore.clear()
        return false
      }
      authTokenStore.set(data.data.accessToken)
      return true
    })
    .catch(() => {
      authTokenStore.clear()
      return false
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

async function readResponseBody(response: Response) {
  const raw = await response.text()
  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    // Reverse proxies and framework limiters may return a plain-text body
    // (for example, "Too Many Requests") instead of the normal API envelope.
    // Keep the original message so the UI can explain the failure cleanly.
    return { success: false, message: raw.trim() }
  }
}

// Helper function untuk fetch dengan error handling
async function fetchAPI(endpoint: string, options: FetchOptions = {}) {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs || 15000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const externalSignal = options.signal
  const abortFromCaller = () => controller.abort()
  if (externalSignal?.aborted) controller.abort()
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const requestHeaders = new Headers(options.headers)
    if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json')
    if (accessToken) {
      requestHeaders.set('Authorization', `Bearer ${accessToken}`)
    }

    const { timeoutMs: _timeoutMs, _retried, silent: _silent, signal: _signal, ...requestOptions } = options

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...requestOptions,
      signal: controller.signal,
      headers: requestHeaders,
      credentials: 'include',
    })

    if (response.status === 401 && !endpoint.includes('/v1/auth/') && _retried !== true) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        return fetchAPI(endpoint, { ...options, _retried: true })
      }
    }

    const data = await readResponseBody(response)

    if (!response.ok || !data.success) {
      const retryAfter = Number(response.headers.get('Retry-After'))
      const retryHint = Number.isFinite(retryAfter) && retryAfter > 0
        ? ` Coba lagi dalam ${Math.ceil(retryAfter / 60)} menit.`
        : ''
      const message = response.status === 429
        ? `Terlalu banyak percobaan. Silakan tunggu sebentar sebelum mencoba login lagi.${retryHint}`
        : (data.message || `Permintaan gagal (${response.status}).`)
      const reference = data.requestId ? ` (Kode referensi: ${data.requestId})` : ''
      const error = Object.assign(new Error(message + reference), {
        status: response.status,
        code: data.code,
      })
      throw error
    }

    return data
  } catch (error) {
    if (options.silent !== true) console.error('API Error:', error)
    if (error.name === 'AbortError') {
      throw new Error('Koneksi server terlalu lama merespons. Silakan coba lagi.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
}

// Google OAuth Config API (public, no auth needed)
export const configAPI = {
  getGoogleConfig: async () => {
    return fetchAPI(`/v1/config?_t=${Date.now()}`, {
      method: 'GET',
      timeoutMs: 10000,
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      silent: true,
    })
  },
}

// Auth API
export const authAPI = {
  login: async (username, password, turnstileToken = '') => {
    const response = await fetchAPI('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, turnstileToken }),
    })
    authTokenStore.set(response.data?.accessToken)
    return { ...response, data: response.data?.user }
  },

  logout: async () => {
    const response = await fetchAPI('/v1/auth/logout', {
      method: 'POST',
    })
    authTokenStore.clear()
    return response
  },

  checkSession: async () => {
    if (!accessToken) await refreshAccessToken()
    return fetchAPI('/v1/auth/me', {
      method: 'GET',
    })
  },

  restoreSession: async () => {
    const response = await fetchAPI('/v1/auth/refresh', {
      method: 'POST',
      timeoutMs: 10000,
    })
    authTokenStore.set(response.data?.accessToken)
    return { ...response, data: response.data?.user }
  },

  // Login dengan Google (kirim credential JWT dari Google Identity Services)
  googleLogin: async (credential, turnstileToken = '') => {
    const response = await fetchAPI('/v1/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential, turnstileToken }),
      timeoutMs: 12000,
    })
    authTokenStore.set(response.data?.accessToken)
    return { ...response, data: response.data?.user }
  },
}

// Guru API
export const guruAPI = {
  getAll: async () => {
    return fetchAPI('/v1/users', {
      method: 'GET',
    })
  },

  getById: async (id) => {
    return fetchAPI(`/v1/users?id=${id}`, {
      method: 'GET',
    })
  },

  create: async (guruData) => {
    return fetchAPI('/v1/users', {
      method: 'POST',
      body: JSON.stringify(guruData),
    })
  },

  update: async (guruData) => {
    return fetchAPI('/v1/users', {
      method: 'PUT',
      body: JSON.stringify(guruData),
    })
  },

  delete: async (id) => {
    return fetchAPI(`/v1/users?id=${id}`, {
      method: 'DELETE',
    })
  },

  // ── Arsip Guru (soft-archive, data presensi tetap utuh) ──
  getArchived: async () => {
    return fetchAPI('/v1/users?archived=1', {
      method: 'GET',
    })
  },

  // Ambil semua guru (aktif + arsip) — dipakai dropdown laporan agar
  // riwayat presensi guru arsip tetap bisa dicetak.
  getAllIncludingArchived: async () => {
    return fetchAPI('/v1/users?include_archived=1', {
      method: 'GET',
    })
  },

  archive: async (id, reason = '') => {
    return fetchAPI('/v1/users?action=archive', {
      method: 'POST',
      body: JSON.stringify({ id, reason }),
    })
  },

  unarchive: async (id) => {
    return fetchAPI('/v1/users?action=unarchive', {
      method: 'POST',
      body: JSON.stringify({ id }),
    })
  },
}

// Presensi API
export const presensiAPI = {
  getAll: async (filters = {}) => {
    const params = new URLSearchParams(filters)
    return fetchAPI(`/v1/attendance?${params}`, {
      method: 'GET',
    })
  },

  create: async (presensiData) => {
    return fetchAPI('/v1/attendance', {
      method: 'POST',
      body: JSON.stringify(presensiData),
    })
  },

  update: async (presensiData) => {
    return fetchAPI('/v1/attendance', {
      method: 'PUT',
      body: JSON.stringify(presensiData),
    })
  },

  delete: async (id) => {
    return fetchAPI(`/v1/attendance?id=${id}`, {
      method: 'DELETE',
    })
  },
}

// Activity Logs API
export const activityAPI = {
  create: async (activityData) => {
    return fetchAPI('/v1/activities', {
      method: 'POST',
      body: JSON.stringify(activityData),
    })
  },

  getAll: async () => {
    return fetchAPI('/v1/activities', {
      method: 'GET',
    })
  },
}

// Optional Workdays API
export const optionalWorkdaysAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString()
    return fetchAPI(`/v1/operations/optional-workdays${queryString ? '?' + queryString : ''}`, {
      method: 'GET',
    })
  },

  create: async (data) => {
    return fetchAPI('/v1/operations/optional-workdays', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  update: async (id, data) => {
    return fetchAPI('/v1/operations/optional-workdays', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    })
  },

  delete: async (id) => {
    return fetchAPI('/v1/operations/optional-workdays', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
  },
}

// Holidays API
export const holidaysAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString()
    return fetchAPI(`/v1/holidays${queryString ? '?' + queryString : ''}`, {
      method: 'GET',
    })
  },

  checkDate: async (tanggal, params = {}) => {
    const query = new URLSearchParams({ check: tanggal, ...params })
    return fetchAPI(`/v1/holidays?${query}`, {
      method: 'GET',
    })
  },

  create: async (holidayData) => {
    return fetchAPI('/v1/holidays', {
      method: 'POST',
      body: JSON.stringify(holidayData),
    })
  },

  update: async (holidayData) => {
    return fetchAPI('/v1/holidays', {
      method: 'PUT',
      body: JSON.stringify(holidayData),
    })
  },

  delete: async (id) => {
    return fetchAPI(`/v1/holidays?id=${id}`, {
      method: 'DELETE',
    })
  },
}

// Settings API
export const settingsAPI = {
  getAll: async () => {
    return fetchAPI('/v1/settings', {
      method: 'GET',
    })
  },

  update: async (settingKey, settingValue) => {
    return fetchAPI('/v1/settings', {
      method: 'PUT',
      body: JSON.stringify({ setting_key: settingKey, setting_value: settingValue }),
    })
  },
}

// Pengaturan Harian API (override jam pulang per-tanggal)
export const pengaturanHarianAPI = {
  getAll: async () => {
    return fetchAPI('/v1/operations/daily-settings', {
      method: 'GET',
    })
  },

  upsert: async (payload) => {
    return fetchAPI('/v1/operations/daily-settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  delete: async (tanggal) => {
    return fetchAPI(`/v1/operations/daily-settings?tanggal=${encodeURIComponent(tanggal)}`, {
      method: 'DELETE',
    })
  },
}

// Jadwal Piket API
export const jadwalPiketAPI = {
  getAll: async (filters = {}) => {
    const params = new URLSearchParams(filters)
    return fetchAPI(`/v1/schedules/piket?${params}`, {
      method: 'GET',
    })
  },

  getToday: async () => {
    return fetchAPI('/v1/schedules/rotation?today=1', {
      method: 'GET',
    })
  },

  getRotation: async () => fetchAPI('/v1/schedules/rotation', { method: 'GET' }),

  create: async (jadwalData) => {
    return fetchAPI('/v1/schedules/piket', {
      method: 'POST',
      body: JSON.stringify(jadwalData),
    })
  },

  update: async (jadwalData) => {
    return fetchAPI('/v1/schedules/piket', {
      method: 'PUT',
      body: JSON.stringify(jadwalData),
    })
  },

  delete: async (id) => {
    return fetchAPI(`/v1/schedules/piket?id=${id}`, {
      method: 'DELETE',
    })
  },

  // Toggle status aktif/nonaktif jadwal piket (PATCH)
  toggleActive: async (id) => {
    return fetchAPI('/v1/schedules/piket', {
      method: 'PATCH',
      body: JSON.stringify({ id }),
    })
  },
}

// Admin Summary API - compact dashboard payload
export const adminSummaryAPI = {
  getDashboard: async (period = 'today') => {
    const params = new URLSearchParams({ period })
    return fetchAPI(`/v1/reports/admin-summary?${params}`, {
      method: 'GET',
      timeoutMs: 8000,
    })
  },
}

export const adminChartsAPI = {
  getOverview: async () => {
    return fetchAPI('/v1/reports/charts?chart=overview', {
      method: 'GET',
      timeoutMs: 8000,
    })
  },

  getLeaderboard: async (period = 'month', startDate = null, endDate = null) => {
    const params = new URLSearchParams({ chart: 'leaderboard' })
    if (startDate && endDate) {
      params.set('period', 'custom')
      params.set('start_date', startDate)
      params.set('end_date', endDate)
    } else {
      params.set('period', period)
    }
    return fetchAPI(`/v1/reports/charts?${params}`, {
      method: 'GET',
      timeoutMs: 8000,
    })
  },

  getCheckout: async ({ startA, endA, startB, endB, userId = 'all' }) => {
    const params = new URLSearchParams({
      chart: 'checkout',
      startA,
      endA,
      startB,
      endB,
      user_id: userId,
    })
    return fetchAPI(`/v1/reports/charts?${params}`, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },

  getCompleteStats: async (days = 30) => {
    const params = new URLSearchParams({ chart: 'complete_stats', days: String(days) })
    return fetchAPI(`/v1/reports/charts?${params}`, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },
}

// Status Rekan API - compact teacher peer status payload
export const statusRekanAPI = {
  getToday: async () => {
    return fetchAPI(`/v1/guru/peers?_t=${Date.now()}`, {
      method: 'GET',
      timeoutMs: 8000,
    })
  },
}

// Guru ranking API - current month's attendance discipline leaderboard
export const guruRankingAPI = {
  getMonthly: async () => {
    return fetchAPI(`/v1/guru/ranking?_t=${Date.now()}`, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },
}

// Guru Profile Self-Service API - guru dapat melihat & update data dirinya
export const guruProfileAPI = {
  getProfile: async () => {
    return fetchAPI('/v1/profile', {
      method: 'GET',
      timeoutMs: 8000,
    })
  },

  updateProfile: async ({ email, noHP, alamat }) => {
    return fetchAPI('/v1/profile', {
      method: 'PUT',
      body: JSON.stringify({ email, noHP, alamat }),
      timeoutMs: 8000,
    })
  },

  saveSignature: async (tandaTangan) => fetchAPI('/v1/profile', {
    method: 'PUT',
    body: JSON.stringify({ tandaTangan }),
    timeoutMs: 8000,
  }),

  // Ganti password guru sendiri (password lama, baru, konfirmasi)
  changePassword: async ({ passwordLama, passwordBaru, konfirmasiBaru }) => {
    return fetchAPI('/v1/profile', {
      method: 'POST',
      body: JSON.stringify({ passwordLama, passwordBaru, konfirmasiBaru }),
      timeoutMs: 8000,
    })
  },
}

// Guru Home API - compact initial payload for faster guru dashboard load
export const guruHomeAPI = {
  getInitialData: async () => {
    return fetchAPI('/v1/guru/home', {
      method: 'GET',
      timeoutMs: 5000,
    })
  },
}

// QR Scan API
export const qrScanAPI = {
  // Submit QR scan attendance
  submit: async (qrData, latitude, longitude, isPulang = false, izinPulangAwal = false, keterangan = '', accuracy = null) => {
    return fetchAPI('/v1/qr/scan', {
      method: 'POST',
      body: JSON.stringify({
        qr_data: qrData,
        latitude,
        longitude,
        accuracy,
        is_pulang: isPulang,
        izin_pulang_awal: izinPulangAwal,
        keterangan: keterangan
      }),
    })
  },

  // Check today's attendance status
  checkStatus: async () => {
    return fetchAPI('/v1/qr/scan', {
      method: 'GET',
    })
  },
}

// QR Generate API (Admin only)
export const qrGenerateAPI = {
  // Get QR Code data for printing
  generate: async () => {
    return fetchAPI('/v1/qr', {
      method: 'GET',
    })
  },

  // Regenerate QR secret (invalidates old QR codes)
  regenerateSecret: async (newSecret = null) => {
    return fetchAPI('/v1/qr', {
      method: 'PUT',
      body: JSON.stringify({ new_secret: newSecret }),
    })
  },
}

// Location Tracking API
export const locationTrackingAPI = {
  submit: async ({ latitude, longitude, accuracy }) => {
    return fetchAPI('/v1/location-tracking', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude, accuracy }),
      timeoutMs: 10000,
    })
  },

  getLatest: async (date) => {
    const params = new URLSearchParams()
    if (date) params.set('date', date)
    return fetchAPI(`/v1/location-tracking${params.toString() ? '?' + params.toString() : ''}`, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },

  getHistory: async (userId, date, limit = 300) => {
    const params = new URLSearchParams({
      action: 'history',
      user_id: String(userId),
      limit: String(limit),
    })
    if (date) params.set('date', date)
    return fetchAPI(`/v1/location-tracking?${params}`, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },
}

// Teacher Workdays API - backend-calculated workdays with overrides
export const teacherWorkdaysAPI = {
  getWorkdays: async (userId, startDate, endDate) => {
    const params = new URLSearchParams({ user_id: userId, start_date: startDate, end_date: endDate })
    return fetchAPI(`/v1/reports/teacher-workdays?${params}`, {
      method: 'GET',
    })
  },
}

// Bulk Teachers Workdays API - all teachers workdays in one call
export const teachersWorkdaysAPI = {
  getAll: async (startDate, endDate) => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    return fetchAPI(`/v1/reports/teachers-workdays?${params}`, {
      method: 'GET',
    })
  },
}

// Weekend Override API
export const weekendOverridesAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString()
    return fetchAPI(`/v1/operations/weekend-overrides${queryString ? '?' + queryString : ''}`, {
      method: 'GET',
    })
  },

  create: async (payload) => {
    return fetchAPI('/v1/operations/weekend-overrides', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  update: async (id, data) => {
    return fetchAPI('/v1/operations/weekend-overrides', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    })
  },

  delete: async (id) => {
    return fetchAPI('/v1/operations/weekend-overrides', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
  },
}

// Manual Entry API (Admin only)
export const manualEntryAPI = {
  // Get list of guru for dropdown
  getGurus: async () => {
    return fetchAPI('/v1/attendance/manual', {
      method: 'GET',
    })
  },

  // Submit manual attendance entry
  submit: async (data) => {
    return fetchAPI('/v1/attendance/manual', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

// Recalculate one selected day's saved check-in statuses after an administrator
// corrected the normal arrival time. The server rejects future dates and still
// applies each teacher's active piket target for that date.
export const todayCheckInRecalculationAPI = {
  preview: async (date) => {
    const query = date ? `?date=${encodeURIComponent(date)}` : ''
    return fetchAPI('/v1/operations/checkin-recalculation' + query, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },

  apply: async (date) => {
    return fetchAPI('/v1/operations/checkin-recalculation', {
      method: 'POST',
      body: JSON.stringify({ date }),
      timeoutMs: 15000,
    })
  },
}

// Satu sumber data untuk seluruh dashboard Analitik. Endpoint ini hanya
// membaca laporan; filter tidak mengubah data presensi atau aturan kalender.
export const adminAnalyticsAPI = {
  get: async ({ startDate, endDate, tipeGuru = '', userId = '' }, signal?: AbortSignal) => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    if (tipeGuru) params.set('tipe_guru', tipeGuru)
    if (userId) params.set('user_id', String(userId))
    return fetchAPI(`/v1/reports/analytics?${params}`, {
      method: 'GET',
      timeoutMs: 15000,
      signal,
      silent: true,
    })
  },
}

// Canonical individual report. The backend owns all workday and Alfa rules so
// the guru view and integrations consume the exact same calculation.
export const teacherAttendanceReportAPI = {
  getMine: async (startDate, endDate) => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    return fetchAPI(`/v1/reports/my-attendance?${params}`, {
      method: 'GET',
    })
  },
}

// Mandatory monthly payroll-period acknowledgement for teacher accounts.
export const monthlyAttendanceConfirmationAPI = {
  getMine: async () => fetchAPI(`/v1/guru/monthly-confirmation?_t=${Date.now()}`, {
    method: 'GET',
    timeoutMs: 15000,
  }),

  confirm: async () => fetchAPI('/v1/guru/monthly-confirmation/confirm', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 20000,
  }),

  requestCorrection: async () => fetchAPI('/v1/guru/monthly-confirmation/correction-request', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 10000,
  }),
}

export const adminMonthlyAttendanceConfirmationAPI = {
  getSummary: async () => fetchAPI(`/v1/admin/monthly-confirmations?_t=${Date.now()}`, {
    method: 'GET',
    timeoutMs: 10000,
  }),

  confirmForTeacher: async (userId) => fetchAPI(`/v1/admin/monthly-confirmations/${encodeURIComponent(userId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 20000,
  }),

  getContact: async () => fetchAPI('/v1/admin/monthly-confirmation-contact', {
    method: 'GET',
    timeoutMs: 10000,
  }),

  updateContact: async (adminPhone) => fetchAPI('/v1/admin/monthly-confirmation-contact', {
    method: 'PUT',
    body: JSON.stringify({ adminPhone }),
    timeoutMs: 10000,
  }),
}

// Backup & Pemulihan API (admin only)
export const backupAPI = {
  list: async (limit = 50) => {
    return fetchAPI(`/v1/admin/backups?limit=${limit}`, { method: 'GET', timeoutMs: 10000 })
  },

  create: async (kind, idempotencyKey = '') => {
    return fetchAPI('/v1/admin/backups', {
      method: 'POST',
      body: JSON.stringify({ kind, idempotencyKey }),
      timeoutMs: 10000,
    })
  },

  get: async (id) => {
    return fetchAPI(`/v1/admin/backups/${encodeURIComponent(id)}`, { method: 'GET', timeoutMs: 10000 })
  },

  verify: async (id) => {
    return fetchAPI(`/v1/admin/backups/${encodeURIComponent(id)}/verify`, { method: 'GET', timeoutMs: 15000 })
  },

  restore: async (id, confirmationPhrase) => {
    return fetchAPI(`/v1/admin/backups/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ confirmationPhrase }),
      timeoutMs: 10000,
    })
  },

  getRestoreStatus: async (id) => {
    return fetchAPI(`/v1/admin/restores/${encodeURIComponent(id)}`, { method: 'GET', timeoutMs: 10000 })
  },

  listRestores: async (limit = 50) => {
    return fetchAPI(`/v1/admin/restores?limit=${limit}`, { method: 'GET', timeoutMs: 10000 })
  },

  startRestoreUpload: async (fileName, expectedSize, expectedSha256 = '') => {
    return fetchAPI('/v1/admin/restore-uploads', {
      method: 'POST',
      body: JSON.stringify({ fileName, expectedSize, expectedSha256 }),
      timeoutMs: 10000,
    })
  },

  appendRestoreUpload: async (id, offset, chunk) => {
    return fetchAPI(`/v1/admin/restore-uploads/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: chunk,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Chunk-Offset': String(offset),
      },
      timeoutMs: 30000,
    })
  },

  download: async (id) => {
    const response = await fetch(`${API_BASE_URL}/v1/admin/backups/${encodeURIComponent(id)}/download`, {
      method: 'GET',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.message || 'File backup gagal diunduh')
    }
    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="([^"]+)"/i)
    const fileName = match?.[1] || `backup-${id}.gz`
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
}

export default {
  authAPI,
  configAPI,
  guruAPI,
  guruProfileAPI,
  guruHomeAPI,
  presensiAPI,
  adminSummaryAPI,
  adminChartsAPI,
  statusRekanAPI,
  activityAPI,
  holidaysAPI,
  settingsAPI,
  pengaturanHarianAPI,
  todayCheckInRecalculationAPI,
  jadwalPiketAPI,
  qrScanAPI,
  qrGenerateAPI,
  locationTrackingAPI,
  manualEntryAPI,
  weekendOverridesAPI,
  teacherAttendanceReportAPI,
  teacherWorkdaysAPI,
  teachersWorkdaysAPI,
  optionalWorkdaysAPI,
  backupAPI,
}
