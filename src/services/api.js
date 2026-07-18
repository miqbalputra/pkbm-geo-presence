// API Configuration
// GANTI dengan URL API Anda setelah deploy
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost/api'

// Helper function untuk fetch dengan error handling
async function fetchAPI(endpoint, options = {}) {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs || 15000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies for session
    })

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.message || 'API request failed')
    }

    return data
  } catch (error) {
    console.error('API Error:', error)
    if (error.name === 'AbortError') {
      throw new Error('Koneksi server terlalu lama merespons. Silakan coba lagi.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// Google OAuth Config API (public, no auth needed)
export const configAPI = {
  getGoogleConfig: async () => {
    return fetchAPI(`/google_config.php?_t=${Date.now()}`, {
      method: 'GET',
      timeoutMs: 10000,
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })
  },
}

// Auth API
export const authAPI = {
  login: async (username, password) => {
    return fetchAPI('/auth.php?action=login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  logout: async () => {
    return fetchAPI('/auth.php?action=logout', {
      method: 'POST',
    })
  },

  checkSession: async () => {
    return fetchAPI('/auth.php?action=check', {
      method: 'GET',
    })
  },

  restoreSession: async (rememberToken) => {
    return fetchAPI('/auth.php?action=restore', {
      method: 'POST',
      body: JSON.stringify({ rememberToken }),
      timeoutMs: 10000,
    })
  },

  // Login dengan Google (kirim credential JWT dari Google Identity Services)
  googleLogin: async (credential) => {
    return fetchAPI('/auth.php?action=google_login', {
      method: 'POST',
      body: JSON.stringify({ credential }),
      timeoutMs: 12000,
    })
  },
}

// Guru API
export const guruAPI = {
  getAll: async () => {
    return fetchAPI('/guru.php', {
      method: 'GET',
    })
  },

  getById: async (id) => {
    return fetchAPI(`/guru.php?id=${id}`, {
      method: 'GET',
    })
  },

  create: async (guruData) => {
    return fetchAPI('/guru.php', {
      method: 'POST',
      body: JSON.stringify(guruData),
    })
  },

  update: async (guruData) => {
    return fetchAPI('/guru.php', {
      method: 'PUT',
      body: JSON.stringify(guruData),
    })
  },

  delete: async (id) => {
    return fetchAPI(`/guru.php?id=${id}`, {
      method: 'DELETE',
    })
  },

  // ── Arsip Guru (soft-archive, data presensi tetap utuh) ──
  getArchived: async () => {
    return fetchAPI('/guru.php?archived=1', {
      method: 'GET',
    })
  },

  // Ambil semua guru (aktif + arsip) — dipakai dropdown laporan agar
  // riwayat presensi guru arsip tetap bisa dicetak.
  getAllIncludingArchived: async () => {
    return fetchAPI('/guru.php?include_archived=1', {
      method: 'GET',
    })
  },

  archive: async (id, reason = '') => {
    return fetchAPI('/guru.php?action=archive', {
      method: 'POST',
      body: JSON.stringify({ id, reason }),
    })
  },

  unarchive: async (id) => {
    return fetchAPI('/guru.php?action=unarchive', {
      method: 'POST',
      body: JSON.stringify({ id }),
    })
  },
}

// Presensi API
export const presensiAPI = {
  getAll: async (filters = {}) => {
    const params = new URLSearchParams(filters)
    return fetchAPI(`/presensi.php?${params}`, {
      method: 'GET',
    })
  },

  create: async (presensiData) => {
    return fetchAPI('/presensi.php', {
      method: 'POST',
      body: JSON.stringify(presensiData),
    })
  },

  update: async (presensiData) => {
    return fetchAPI('/presensi.php', {
      method: 'PUT',
      body: JSON.stringify(presensiData),
    })
  },

  delete: async (id) => {
    return fetchAPI(`/presensi.php?id=${id}`, {
      method: 'DELETE',
    })
  },
}

// Activity Logs API
export const activityAPI = {
  create: async (activityData) => {
    return fetchAPI('/activity.php', {
      method: 'POST',
      body: JSON.stringify(activityData),
    })
  },

  getAll: async () => {
    return fetchAPI('/activity.php', {
      method: 'GET',
    })
  },
}

// Optional Workdays API
export const optionalWorkdaysAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString()
    return fetchAPI(`/optional_workdays.php${queryString ? '?' + queryString : ''}`, {
      method: 'GET',
    })
  },

  create: async (data) => {
    return fetchAPI('/optional_workdays.php', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  update: async (id, data) => {
    return fetchAPI('/optional_workdays.php', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    })
  },

  delete: async (id) => {
    return fetchAPI('/optional_workdays.php', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
  },
}

// Holidays API
export const holidaysAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString()
    return fetchAPI(`/holidays.php${queryString ? '?' + queryString : ''}`, {
      method: 'GET',
    })
  },

  checkDate: async (tanggal, params = {}) => {
    const query = new URLSearchParams({ check: tanggal, ...params })
    return fetchAPI(`/holidays.php?${query}`, {
      method: 'GET',
    })
  },

  create: async (holidayData) => {
    return fetchAPI('/holidays.php', {
      method: 'POST',
      body: JSON.stringify(holidayData),
    })
  },

  update: async (holidayData) => {
    return fetchAPI('/holidays.php', {
      method: 'PUT',
      body: JSON.stringify(holidayData),
    })
  },

  delete: async (id) => {
    return fetchAPI(`/holidays.php?id=${id}`, {
      method: 'DELETE',
    })
  },
}

// Settings API
export const settingsAPI = {
  getAll: async () => {
    return fetchAPI('/settings.php', {
      method: 'GET',
    })
  },

  update: async (settingKey, settingValue) => {
    return fetchAPI('/settings.php', {
      method: 'PUT',
      body: JSON.stringify({ setting_key: settingKey, setting_value: settingValue }),
    })
  },
}

// Jadwal Piket API — kini rotasi dwi-pekanan (bukan CRUD per-hari).
export const jadwalPiketAPI = {
  // Overview rotasi: config (settings) + daftar guru beserta piket_group +
  // info "Sabtu ini pekan ke-N, grup X piket".
  getRotation: async () => {
    return fetchAPI('/jadwal_piket.php', {
      method: 'GET',
    })
  },

  // Status piket hari ini untuk guru yang sedang login (response.data.jadwal).
  getToday: async () => {
    return fetchAPI('/jadwal_piket.php?today=1', {
      method: 'GET',
    })
  },
}

// Admin Summary API - compact dashboard payload
export const adminSummaryAPI = {
  getDashboard: async (period = 'today') => {
    const params = new URLSearchParams({ period })
    return fetchAPI(`/admin_summary.php?${params}`, {
      method: 'GET',
      timeoutMs: 8000,
    })
  },
}

export const adminChartsAPI = {
  getOverview: async () => {
    return fetchAPI('/admin_charts.php?chart=overview', {
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
    return fetchAPI(`/admin_charts.php?${params}`, {
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
    return fetchAPI(`/admin_charts.php?${params}`, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },

  getCompleteStats: async (days = 30) => {
    const params = new URLSearchParams({ chart: 'complete_stats', days })
    return fetchAPI(`/admin_charts.php?${params}`, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },
}

// Status Rekan API - compact teacher peer status payload
export const statusRekanAPI = {
  getToday: async () => {
    return fetchAPI(`/status_rekan.php?_t=${Date.now()}`, {
      method: 'GET',
      timeoutMs: 8000,
    })
  },
}

// Guru Profile Self-Service API - guru dapat melihat & update data dirinya
export const guruProfileAPI = {
  getProfile: async () => {
    return fetchAPI('/guru_profile.php', {
      method: 'GET',
      timeoutMs: 8000,
    })
  },

  updateProfile: async ({ email, noHP, alamat }) => {
    return fetchAPI('/guru_profile.php', {
      method: 'PUT',
      body: JSON.stringify({ email, noHP, alamat }),
      timeoutMs: 8000,
    })
  },

  // Ganti password guru sendiri (password lama, baru, konfirmasi)
  changePassword: async ({ passwordLama, passwordBaru, konfirmasiBaru }) => {
    return fetchAPI('/guru_profile.php', {
      method: 'POST',
      body: JSON.stringify({ passwordLama, passwordBaru, konfirmasiBaru }),
      timeoutMs: 8000,
    })
  },

  // Simpan / hapus tanda tangan digital per akun (base64 PNG; '' = hapus)
  saveSignature: async (tandaTangan) => {
    return fetchAPI('/guru_profile.php?action=signature', {
      method: 'POST',
      body: JSON.stringify({ tanda_tangan: tandaTangan }),
      timeoutMs: 12000,
    })
  },
}

// Admin Account Self-Service API - admin melihat & ubah username/password sendiri
export const adminProfileAPI = {
  getAccount: async () => {
    return fetchAPI('/admin_profile.php', {
      method: 'GET',
      timeoutMs: 8000,
    })
  },

  // Ubah username dan/atau password admin.
  // passwordLama wajib; usernameBaru & passwordBaru opsional (minimal satu diisi).
  changeCredentials: async ({ passwordLama, usernameBaru, passwordBaru, konfirmasiBaru }) => {
    return fetchAPI('/admin_profile.php?action=change_credentials', {
      method: 'POST',
      body: JSON.stringify({ passwordLama, usernameBaru, passwordBaru, konfirmasiBaru }),
      timeoutMs: 8000,
    })
  },
}

// Kelola Akun Kepala Sekolah API - admin membuat/melihat/mengubah akun Kepala Sekolah
export const kepalaSekolahAPI = {
  // Ambil akun Kepala Sekolah saat ini (atau null bila belum ada).
  getAccount: async () => {
    return fetchAPI('/kepala_sekolah.php', {
      method: 'GET',
      timeoutMs: 8000,
    })
  },

  // Buat (bila belum ada) atau perbarui akun Kepala Sekolah.
  // passwordLama = password Admin saat ini (wajib untuk konfirmasi).
  // Saat membuat akun baru, passwordBaru wajib diisi.
  save: async ({ passwordLama, username, nama, email, passwordBaru, konfirmasiBaru }) => {
    return fetchAPI('/kepala_sekolah.php?action=save', {
      method: 'POST',
      body: JSON.stringify({ passwordLama, username, nama, email, passwordBaru, konfirmasiBaru }),
      timeoutMs: 8000,
    })
  },
}

// Guru Home API - compact initial payload for faster guru dashboard load
export const guruHomeAPI = {
  getInitialData: async () => {
    return fetchAPI('/guru_home.php', {
      method: 'GET',
      timeoutMs: 5000,
    })
  },
}

// QR Scan API
export const qrScanAPI = {
  // Submit QR scan attendance
  submit: async (qrData, latitude, longitude, isPulang = false, izinPulangAwal = false, keterangan = '') => {
    return fetchAPI('/qr_scan.php', {
      method: 'POST',
      body: JSON.stringify({ 
        qr_data: qrData, 
        latitude, 
        longitude,
        is_pulang: isPulang,
        izin_pulang_awal: izinPulangAwal,
        keterangan: keterangan
      }),
    })
  },

  // Check today's attendance status
  checkStatus: async () => {
    return fetchAPI('/qr_scan.php', {
      method: 'GET',
    })
  },
}

// QR Generate API (Admin only)
export const qrGenerateAPI = {
  // Get QR Code data for printing
  generate: async () => {
    return fetchAPI('/qr_generate.php', {
      method: 'GET',
    })
  },

  // Regenerate QR secret (invalidates old QR codes)
  regenerateSecret: async (newSecret = null) => {
    return fetchAPI('/qr_generate.php', {
      method: 'PUT',
      body: JSON.stringify({ new_secret: newSecret }),
    })
  },
}

// Location Tracking API
export const locationTrackingAPI = {
  submit: async ({ latitude, longitude, accuracy }) => {
    return fetchAPI('/location_tracking.php', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude, accuracy }),
      timeoutMs: 10000,
    })
  },

  getLatest: async (date) => {
    const params = new URLSearchParams()
    if (date) params.set('date', date)
    return fetchAPI(`/location_tracking.php${params.toString() ? '?' + params.toString() : ''}`, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },

  getHistory: async (userId, date, limit = 300) => {
    const params = new URLSearchParams({
      action: 'history',
      user_id: userId,
      limit,
    })
    if (date) params.set('date', date)
    return fetchAPI(`/location_tracking.php?${params}`, {
      method: 'GET',
      timeoutMs: 10000,
    })
  },
}

// Teacher Workdays API - backend-calculated workdays with overrides
export const teacherWorkdaysAPI = {
  getWorkdays: async (userId, startDate, endDate) => {
    const params = new URLSearchParams({ user_id: userId, start_date: startDate, end_date: endDate })
    return fetchAPI(`/teacher_workdays.php?${params}`, {
      method: 'GET',
    })
  },
}

// Bulk Teachers Workdays API - all teachers workdays in one call
export const teachersWorkdaysAPI = {
  getAll: async (startDate, endDate) => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    return fetchAPI(`/teachers_workdays.php?${params}`, {
      method: 'GET',
    })
  },
}

// Weekend Override API
export const weekendOverridesAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString()
    return fetchAPI(`/weekend_overrides.php${queryString ? '?' + queryString : ''}`, {
      method: 'GET',
    })
  },

  create: async (payload) => {
    return fetchAPI('/weekend_overrides.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  update: async (id, data) => {
    return fetchAPI('/weekend_overrides.php', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    })
  },

  delete: async (id) => {
    return fetchAPI('/weekend_overrides.php', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
  },
}

// Manual Entry API (Admin only)
export const manualEntryAPI = {
  // Get list of guru for dropdown
  getGurus: async () => {
    return fetchAPI('/manual_entry.php', {
      method: 'GET',
    })
  },

  // Submit manual attendance entry
  submit: async (data) => {
    return fetchAPI('/manual_entry.php', {
      method: 'POST',
      body: JSON.stringify(data),
    })
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
  jadwalPiketAPI,
  qrScanAPI,
  qrGenerateAPI,
  locationTrackingAPI,
  manualEntryAPI,
  weekendOverridesAPI,
  teacherWorkdaysAPI,
  teachersWorkdaysAPI,
  optionalWorkdaysAPI,
  kepalaSekolahAPI,
}
