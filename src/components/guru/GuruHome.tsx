import { useState, useEffect, useRef } from 'react'
import { RefreshCw, CheckCircle, FileText, AlertCircle, Clock, History, Users, LogOut, MapPin, ArrowRight, Home, HelpCircle, BarChart3, ClipboardList, ArrowUpRight, ShieldCheck, X } from 'lucide-react'
import { formatFullDate, formatDate, formatDateForInput } from '../../utils/dateUtils'
import { calculateDistance, getReliableUserLocation, warmUpUserLocation, getLastKnownLocation, getLocationErrorMessage } from '../../utils/geoLocation'
import { authAPI, guruHomeAPI, presensiAPI, holidaysAPI, settingsAPI, jadwalPiketAPI, qrScanAPI, locationTrackingAPI } from '../../services/api'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { Progress } from '../ui/progress'
import { Button } from '../ui/button'
import { AppDialog } from '../ui/dialog'
import { AttendanceStatus } from '../ui/attendance-status'
import { PageLoading, Notice, EmptyState } from '../ui/page'
import { AttendanceFeedbackDialog } from './AttendanceFeedbackDialog'
import { getAttendanceFeedback, getCheckoutFeedback, type AttendanceFeedback } from './attendance-feedback'

function GuruHome({ user, onChangeTab, gmailComplete = false }) {
  const isPokjar = Boolean(user?.pokjar)
  const [todayAttendance, setTodayAttendance] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [attendanceFeedback, setAttendanceFeedback] = useState<AttendanceFeedback | null>(null)
  const [initialError, setInitialError] = useState('')
  const [formError, setFormError] = useState('')
  const [monthlyError, setMonthlyError] = useState('')
  const [monthlyLoading, setMonthlyLoading] = useState(true)
  const monthlyRequest = useRef(0)
  const checkoutPreparation = useRef(false)
  const [, setClockTick] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [isHoliday, setIsHoliday] = useState(false)
  const [holidayInfo, setHolidayInfo] = useState(null)
  const [settings, setSettings] = useState<Record<string, any>>({
    jam_masuk_normal: '07:20',
    toleransi_terlambat: '15',
    radius_gps: '500',
    sekolah_latitude: '-5.1477',
    sekolah_longitude: '119.4327',
    lokasi_laki_latitude: '',
    lokasi_laki_longitude: '',
    lokasi_perempuan_latitude: '',
    lokasi_perempuan_longitude: '',
    lokasi_apel_latitude: '',
    lokasi_apel_longitude: '',
    mode_testing: '1',
    button_enabled: '0',
    jam_min_pulang: '12:30',
    weekend_workday_enabled: '0',
    saturday_male_workday_enabled: '0',
    saturday_female_workday_enabled: '0',
    sunday_male_workday_enabled: '0',
    sunday_female_workday_enabled: '0',
    qr_enabled: '1',
    location_tracking_enabled: '0',
    location_tracking_interval_minutes: '15',
    location_tracking_accuracy_limit: '100'
  })
  const [jadwalPiketHariIni, setJadwalPiketHariIni] = useState(null)
  const [isPiketToday, setIsPiketToday] = useState(false)
  const [showPiketModal, setShowPiketModal] = useState(false)
  const [piketCheckoutTime, setPiketCheckoutTime] = useState('')
	const [piketPulangTarget, setPiketPulangTarget] = useState('')
  const [pendingQRData, setPendingQRData] = useState(null)
  // Jam minimal pulang efektif hari ini (dari guru_home, mengikuti override
  // per-tanggal pengaturan_harian). Null = pakai settings.jam_min_pulang.
  const [pulangThreshold, setPulangThreshold] = useState('')
  const [keteranganPiket, setKeteranganPiket] = useState('')
  const [piketStep, setPiketStep] = useState(1) // 1: Info, 2: Input Alasan
  const [locationStatus, setLocationStatus] = useState({ state: 'idle', location: null, message: '' })
  const [trackingStatus, setTrackingStatus] = useState({ state: 'idle', message: '' })
  const [monthlyStats, setMonthlyStats] = useState({ hadir: 0, izin: 0, sakit: 0, alfa: 0, percentage: 0, total: 0 })
  const [recentLogs, setRecentLogs] = useState([])
  const attendanceActionRef = useRef(false)

  // Presensi pulang di luar sekolah (lupa): popup konfirmasi lokasi
  const [pulangLuarModal, setPulangLuarModal] = useState(false)
  const [pendingPulang, setPendingPulang] = useState(null) // { izinPulangAwal, keteranganCustom, location }

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    loadInitialData()

    // HEARTBEAT: Ping server setiap 10 menit untuk menjaga session tetap aktif
    const heartbeat = setInterval(() => {
      console.log('💓 Heartbeat: Keeping session alive...')
      authAPI.checkSession().catch(err => {
        console.error('Heartbeat failed:', err)
        if (user?.rememberToken) {
          authAPI.restoreSession().catch(restoreErr => {
            console.error('Failed to restore guru session:', restoreErr)
          })
        }
      })
    }, 10 * 60 * 1000)

    return () => clearInterval(heartbeat)
  }, [])

  useEffect(() => {
    warmUpLocation()
  }, [settings.mode_testing])

  useEffect(() => {
    const activeStatuses = ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat']
    const hasCheckedOut = !!(todayAttendance?.jam_pulang || todayAttendance?.jamPulang)
    const isActiveAttendance = todayAttendance && activeStatuses.includes(todayAttendance.status) && !hasCheckedOut

    if (settings.location_tracking_enabled != '1' || !isActiveAttendance) {
      setTrackingStatus({
        state: 'idle',
        message: settings.location_tracking_enabled == '1' ? 'Tracking menunggu presensi hadir' : 'Tracking lokasi nonaktif'
      })
      return undefined
    }

    let cancelled = false
    let intervalId = null
    const intervalMinutes = Math.min(Math.max(parseInt(settings.location_tracking_interval_minutes || '15', 10) || 15, 5), 60)
    const accuracyLimit = Math.min(Math.max(parseInt(settings.location_tracking_accuracy_limit || '100', 10) || 100, 20), 1000)
    let lastTrackingAttemptAt = 0

    const sendTrackingPoint = async () => {
      const now = Date.now()
      if (now - lastTrackingAttemptAt < 15000) return
      lastTrackingAttemptAt = now

      try {
        setTrackingStatus({ state: 'loading', message: 'Mengirim lokasi tracking...' })
        const location = await getReliableUserLocation({
          minAccuracy: accuracyLimit,
          cacheMaxAgeMs: 60000,
          firstTimeout: 12000,
          retryTimeout: 8000
        })

        await locationTrackingAPI.submit({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy
        })

        if (!cancelled) {
          setTrackingStatus({
            state: 'ready',
            message: `Tracking aktif tiap ${intervalMinutes} menit${location.accuracy ? ` (akurasi ${Math.round(location.accuracy)}m)` : ''}`
          })
        }
      } catch (error) {
        if (!cancelled) {
          setTrackingStatus({
            state: 'error',
            message: error.message || getLocationErrorMessage(error)
          })
        }
      }
    }

    sendTrackingPoint()
    intervalId = setInterval(sendTrackingPoint, intervalMinutes * 60 * 1000)
    const sendTrackingOnResume = () => {
      if (!document.hidden) {
        sendTrackingPoint()
      }
    }

    document.addEventListener('visibilitychange', sendTrackingOnResume)
    window.addEventListener('focus', sendTrackingOnResume)
    window.addEventListener('pageshow', sendTrackingOnResume)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      document.removeEventListener('visibilitychange', sendTrackingOnResume)
      window.removeEventListener('focus', sendTrackingOnResume)
      window.removeEventListener('pageshow', sendTrackingOnResume)
    }
  }, [
    todayAttendance?.id,
    todayAttendance?.status,
    todayAttendance?.jam_pulang,
    todayAttendance?.jamPulang,
    settings.location_tracking_enabled,
    settings.location_tracking_interval_minutes,
    settings.location_tracking_accuracy_limit
  ])

  const warmUpLocation = async () => {
    if (settings.mode_testing == '1') {
      setLocationStatus({ state: 'ready', location: null, message: 'Mode testing aktif' })
      return
    }

    setLocationStatus({ state: 'loading', location: null, message: 'Menyiapkan GPS...' })
    try {
      const location = await warmUpUserLocation()
      setLocationStatus({
        state: 'ready',
        location,
        message: location.accuracy ? `GPS siap (akurasi ${Math.round(location.accuracy)}m)` : 'GPS siap'
      })
    } catch (error) {
      setLocationStatus({
        state: 'error',
        location: null,
        message: getLocationErrorMessage(error)
      })
    }
  }

  const updateLocationReady = (location) => {
    setLocationStatus({
      state: 'ready',
      location,
      message: location?.accuracy ? `GPS siap (akurasi ${Math.round(location.accuracy)}m)` : 'GPS siap'
    })
  }

  const getFastLocation = async () => {
    if (settings.mode_testing == '1') {
      return {
        latitude: parseFloat(settings.sekolah_latitude),
        longitude: parseFloat(settings.sekolah_longitude),
        accuracy: 0,
        timestamp: Date.now()
      }
    }

    const accuracyLimit = Math.min(Math.max(parseInt(settings.location_tracking_accuracy_limit || '100', 10) || 100, 20), 1000)
    const cached = getLastKnownLocation(30000)
    if (cached && cached.accuracy && cached.accuracy <= accuracyLimit) {
      updateLocationReady(cached)
      return cached
    }

    const location = await getReliableUserLocation({
      minAccuracy: accuracyLimit,
      cacheMaxAgeMs: 30000,
      firstTimeout: 10000,
      retryTimeout: 5000
    })
    if (location?.accuracy && location.accuracy > accuracyLimit) {
      const error: any = new Error(`Akurasi GPS terlalu rendah (${Math.round(location.accuracy)}m). Maksimal ${accuracyLimit}m. Coba aktifkan mode akurasi tinggi atau pindah ke area terbuka.`)
      error.code = 'GPS_ACCURACY_LOW'
      throw error
    }
    updateLocationReady(location)
    return location
  }

  const getAttendanceFromResponse = (response) => response?.data?.attendance || null

  const getAttendanceLocationTargets = (isCheckout = false) => {
    const targets = []
    const addTarget = (label, lat, lon) => {
      const parsedLat = parseFloat(lat)
      const parsedLon = parseFloat(lon)
      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) return
      if (targets.some(target => target.lat === parsedLat && target.lon === parsedLon)) return
      targets.push({ label, lat: parsedLat, lon: parsedLon })
    }

    const isMonday = new Date().getDay() === 1
    const isApelEnabled = settings.apel_senin_enabled == '1'

    if (isMonday && isApelEnabled) {
      addTarget('apel senin', settings.lokasi_apel_latitude, settings.lokasi_apel_longitude)
    }

    addTarget('sekolah', settings.sekolah_latitude, settings.sekolah_longitude)
    addTarget('pos guru laki-laki', settings.lokasi_laki_latitude, settings.lokasi_laki_longitude)
    addTarget('area guru perempuan', settings.lokasi_perempuan_latitude, settings.lokasi_perempuan_longitude)

    return targets
  }

  const validateAttendanceLocation = (location, isCheckout = false) => {
    const radius = parseInt(settings.radius_gps, 10)
    const targets = getAttendanceLocationTargets(isCheckout)

    if (!targets.length || !Number.isFinite(radius)) {
      return { isValid: false, message: 'Lokasi presensi belum dikonfigurasi. Hubungi admin.' }
    }

    let nearest = null
    for (const target of targets) {
      const distance = Math.round(calculateDistance(location.latitude, location.longitude, target.lat, target.lon))
      if (distance <= radius) {
        return { isValid: true }
      }

      if (!nearest || distance < nearest.distance) {
        nearest = { ...target, distance }
      }
    }

    const areaLabel = targets.map(target => target.label).join(' / ')
    return {
      isValid: false,
      message: `Anda berada di luar jangkauan ${areaLabel} (${nearest.distance}m dari ${nearest.label}). Maksimal jarak: ${settings.radius_gps}m`
    }
  }

  const applyInitialPayload = (data) => {
    if (!data) return

    if (data.settings) {
      setSettings(prev => ({ ...prev, ...data.settings }))
    }

    if (data.pulangThreshold) {
      setPulangThreshold(data.pulangThreshold)
    }

    setPiketPulangTarget(data.piketPulangTarget || '')

    if (data.holiday) {
      const { isWorkday, isHoliday: holidayFound, isWeekend, holidayName, dayName } = data.holiday
      if (!isWorkday) {
        setIsHoliday(true)
        if (isWeekend) {
          setHolidayInfo({ type: 'weekend', message: `Hari ${dayName} adalah hari libur` })
        } else if (holidayFound) {
          setHolidayInfo({ type: 'holiday', message: `Hari Libur: ${holidayName}` })
        }
      } else {
        setIsHoliday(false)
        setHolidayInfo(null)
      }
    }

    if (data.piket) {
      setJadwalPiketHariIni(data.piket.mine || null)
      setIsPiketToday(!!data.piket.isPiketToday)
    }

    setTodayAttendance(data.attendance || null)
  }

  const loadInitialData = async () => {
    console.log('=== 🚀 Loading Initial Data ===')
    console.log('User:', user)
    setPageLoading(true)
    setInitialError('')

    try {
      let loadedCompactData = false

      try {
        const response = await guruHomeAPI.getInitialData()
        applyInitialPayload(response.data)
        loadedCompactData = true
      } catch (error) {
        console.error('Failed to load compact guru data, falling back:', error)
      }

      if (!loadedCompactData) {
        const results = await Promise.all([
          loadSettings(),
          checkIfHoliday(),
          checkJadwalPiket(),
          checkTodayAttendance()
        ])
        if (results.some((result) => result === false)) throw new Error('Data presensi belum dapat dimuat. Coba lagi sebelum melakukan presensi.')
      }

      // Statistik bukan dependency tombol presensi. Muat di belakang agar
      // tombol presensi siap segera setelah status hari ini tersedia.
      void loadMonthlyStats()

      console.log('=== ✅ Data Loaded ===')
    } catch (error) {
      setInitialError(error.message || 'Data presensi belum dapat dimuat.')
      console.error('❌ Failed to load initial data:', error)
      setMessage({
        type: 'error',
        text: 'Sebagian data belum berhasil dimuat. Silakan refresh atau login ulang jika tombol presensi belum muncul.'
      })
    } finally {
      setPageLoading(false)
      console.log('=== 🏁 Page Loading Complete ===')
    }
  }

  const loadMonthlyStats = async () => {
    const request = ++monthlyRequest.current
    setMonthlyLoading(true)
    setMonthlyError('')
    try {
      const today = new Date()
      const start = formatDateForInput(new Date(today.getFullYear(), today.getMonth(), 1))
      const end = formatDateForInput(today)
      const response = await presensiAPI.getAll({ user_id: user.id, start_date: start, end_date: end })
      if (request !== monthlyRequest.current) return
      const logs = response.data || []
      const monthLogs = logs

      const hadir = monthLogs.filter(log => ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'].includes(log.status)).length
      const izin = monthLogs.filter(log => log.status === 'izin').length
      const sakit = monthLogs.filter(log => log.status === 'sakit').length
      const alfa = monthLogs.filter(log => log.status === 'alfa').length
      const total = hadir + izin + sakit + alfa
      const percentage = total > 0 ? Math.round((hadir / total) * 100) : 0

      setMonthlyStats({ hadir, izin, sakit, alfa, total, percentage })
      setRecentLogs(monthLogs.slice().sort((a, b) => (b.tanggal > a.tanggal ? 1 : -1)).slice(0, 5))
    } catch (error) {
      if (request === monthlyRequest.current) setMonthlyError('Ringkasan bulanan belum dapat dimuat.')
      console.error('Failed to load monthly stats:', error)
    } finally {
      if (request === monthlyRequest.current) setMonthlyLoading(false)
    }
  }

  const checkJadwalPiket = async () => {
    console.log('🔵🔵🔵 CHECKING JADWAL PIKET START 🔵🔵🔵')
    console.log('🔵 User object:', user)

    try {
      console.log('🔵 Calling API jadwalPiketAPI.getToday()...')
      const response = await jadwalPiketAPI.getToday()
      console.log('🔵 API call completed')
      console.log('🔵 API Response:', JSON.stringify(response, null, 2))
      console.log('🔵 Response keys:', response ? Object.keys(response) : 'null')
      console.log('🔵 Response.data:', response?.data)
      console.log('🔵 Response.data type:', typeof response?.data)
      console.log('🔵 Response.data keys:', response?.data ? Object.keys(response.data) : 'null')

      if (response && response.success && response.data && response.data.jadwal) {
        const { jadwal } = response.data
        console.log('🔵 Jadwal list:', jadwal)
        console.log('🔵 Current user ID:', user.id)

        // Cek apakah user ada di jadwal piket hari ini
        const myPiket = jadwal.find(j => {
          console.log('🔵 Comparing:', j.user_id, 'with', user.id)
          return j.user_id === user.id
        })

        if (myPiket) {
          setJadwalPiketHariIni(myPiket)
          setIsPiketToday(true)
          console.log('🔵✅ Piket hari ini:', myPiket)
        } else {
          console.log('🔵ℹ️ Tidak ada piket hari ini untuk user:', user.id)
          setJadwalPiketHariIni(null)
          setIsPiketToday(false)
        }
      } else {
        console.log('🔵❌ No piket data or empty response')
        console.log('🔵❌ Condition check:', {
          hasResponse: !!response,
          hasSuccess: response?.success,
          hasData: !!response?.data,
          hasJadwal: !!response?.data?.jadwal
        })
        setJadwalPiketHariIni(null)
        setIsPiketToday(false)
      }
      console.log('🔵🔵🔵 CHECKING JADWAL PIKET END 🔵🔵🔵')
      return true
    } catch (error) {
      console.error('🔵❌ Failed to check jadwal piket:', error)
      // Set default values on error
      setJadwalPiketHariIni(null)
      setIsPiketToday(false)
      return false
    }
  }

  const loadSettings = async () => {
    try {
      const response = await settingsAPI.getAll()
      setSettings(prev => ({ ...prev, ...response.data }))
      console.log('⚙️ Settings loaded:', response.data)
      return true
    } catch (error) {
      console.error('Failed to load settings:', error)
      // Use default settings if API fails
      return false
    }
  }

  const checkIfHoliday = async () => {
    try {
      const today = formatDateForInput(new Date())
      console.log('🔍 Checking holiday for:', today)

      const response = await holidaysAPI.checkDate(today, { jenis_kelamin: user?.jenisKelamin || user?.jenis_kelamin || '' })
      console.log('📅 Holiday API response:', response)

      if (response && response.success && response.data) {
        const { isWorkday, isHoliday, isWeekend, holidayName, dayName } = response.data
        console.log('📊 Holiday data:', { isWorkday, isHoliday, isWeekend, holidayName, dayName })

        // Jika bukan hari kerja (libur atau weekend)
        if (!isWorkday) {
          console.log('🚫 NOT A WORKDAY - Setting isHoliday to TRUE')
          setIsHoliday(true)

          if (isWeekend) {
            console.log('📆 Weekend detected')
            setHolidayInfo({ type: 'weekend', message: `Hari ${dayName} adalah hari libur` })
          } else if (isHoliday) {
            console.log('🎉 Holiday detected:', holidayName)
            setHolidayInfo({ type: 'holiday', message: `Hari Libur: ${holidayName}` })
          }
        } else {
          console.log('✅ Workday - Setting isHoliday to FALSE')
          setIsHoliday(false)
          setHolidayInfo(null)
        }
      } else {
        console.log('⚠️ No valid response from holiday API')
        setIsHoliday(false)
        setHolidayInfo(null)
      }
      return true
    } catch (error) {
      console.error('❌ Failed to check holiday:', error)
      // Jika API error, anggap bukan hari libur (fail-safe)
      setIsHoliday(false)
      setHolidayInfo(null)
      return false
    }
  }

  const checkTodayAttendance = async () => {
    try {
      const today = formatDateForInput(new Date())
      console.log('Checking attendance for:', { user_id: user.id, tanggal: today })

      const response = await presensiAPI.getAll({
        user_id: user.id,
        tanggal: today
      })

      console.log('Attendance response:', response)

      if (response.data && response.data.length > 0) {
        console.log('Today attendance found:', response.data[0])
        setTodayAttendance(response.data[0])
      } else {
        console.log('No attendance found for today')
        setTodayAttendance(null) // Always reset to null if no record
      }
      return true
    } catch (error) {
      console.error('Failed to check attendance:', error)
      return false
    }
  }

  const startAttendanceAction = () => {
    if (!isPokjar && !gmailComplete) {
      setMessage({ type: 'error', text: 'Lengkapi Gmail aktif berakhiran @gmail.com di menu Akun sebelum melakukan presensi.' })
      return false
    }
    if (attendanceActionRef.current) return false
    attendanceActionRef.current = true
    setLoading(true)
    return true
  }

  const finishAttendanceAction = () => {
    attendanceActionRef.current = false
    setLoading(false)
  }

  const handleHadir = async () => {
    if (!startAttendanceAction()) return
    setMessage({ type: '', text: '' })

    if (isPokjar) {
      try {
        const result = await saveAttendance('hadir', '')
        if (result.feedback) setAttendanceFeedback(result.feedback)
      } finally {
        finishAttendanceAction()
      }
      return
    }

    // MODE TESTING dari settings (bukan hardcoded)
    const TESTING_MODE = settings.mode_testing == '1' // Gunakan == agar int(1) tetap true sebagai '1'

    try {
      const location = await getFastLocation()

      if (!TESTING_MODE) {
        const validation = validateAttendanceLocation(location, false)

        if (!validation.isValid) {
          setMessage({
            type: 'error',
            text: validation.message
          })
          return
        }
      }

      const result = await saveAttendance('hadir', '', location)
      if (result.feedback) setAttendanceFeedback(result.feedback)
    } catch (error) {
      // Jika gagal mendapatkan lokasi
      if (TESTING_MODE) {
        // Testing mode: gunakan koordinat sekolah
        const result = await saveAttendance('hadir', '', {
          latitude: parseFloat(settings.sekolah_latitude),
          longitude: parseFloat(settings.sekolah_longitude),
          accuracy: 0
        })
        if (result.feedback) setAttendanceFeedback(result.feedback)
      } else {
        // Produksi: tampilkan error
        setMessage({
          type: 'error',
          text: getLocationErrorMessage(error)
        })
      }
    } finally {
      finishAttendanceAction()
    }
  }

  const handleIzinSakit = (type) => {
    setFormError('')
    setMessage({ type: '', text: '' })
    setModalType(type)
    setKeterangan('')
    setShowModal(true)
  }

  const submitIzinSakit = async () => {
    if (!keterangan.trim()) {
      setFormError('Keterangan wajib diisi.')
      return
    }
    if (!startAttendanceAction()) return
    setFormError('')
    setMessage({ type: '', text: '' })
    try {
      const result = await saveAttendance(modalType, keterangan)
      if (result.success) {
        setShowModal(false)
        setKeterangan('')
        if (result.feedback) setAttendanceFeedback(result.feedback)
      }
    } finally {
      finishAttendanceAction()
    }
  }

  const saveAttendance = async (status, ket, location = null) => {
    try {
      const attendanceData: any = {
        userId: user.id,
        status,
        keterangan: ket
      }

      if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
        attendanceData.latitude = location.latitude
        attendanceData.longitude = location.longitude
        if (Number.isFinite(location?.accuracy)) {
          attendanceData.accuracy = location.accuracy
        }
      }

      const response = await presensiAPI.create(attendanceData)

      const attendance = getAttendanceFromResponse(response)
      if (attendance) {
        setTodayAttendance(attendance)
      } else {
        await checkTodayAttendance()
      }

      const saved = attendance || {}
      let successMessage = response.message || `Presensi ${status} berhasil disimpan!`
      const isLate = ['hadir_terlambat', 'hadir_izin_terlambat'].includes(saved.status)
      if (isLate && saved.keterangan) {
        successMessage += ` (${saved.keterangan})`
      }

      setMessage({ type: isLate ? 'warning' : 'success', text: successMessage })
      void loadMonthlyStats()
      return { success: true, feedback: getAttendanceFeedback(attendance?.status) }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Gagal menyimpan presensi: ' + error.message
      })
      return { success: false, feedback: null }
    }
  }

  // Batas minimal jam presensi pulang efektif hari ini. Mengikuti override
  // per-tanggal (pengaturan_harian) bila aktif (pulangThreshold dari guru_home);
  // jika tidak ada, pakai settings.jam_min_pulang (default 12:30).
  const effectivePulangThreshold = () => (pulangThreshold || settings.jam_min_pulang || '12:30').substring(0, 5)

  // Batas minimal jam presensi pulang (menit sejak 00:00).
  const getPulangThresholdMinutes = () => {
    const val = effectivePulangThreshold().trim()
    const [h, m] = val.split(':')
    return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0)
  }

  const formatPulangThreshold = () => effectivePulangThreshold()

  // Fungsi untuk cek apakah tombol pulang bisa ditampilkan (sesuai setting jam_min_pulang)
  const canShowPulangButton = () => {
    const now = new Date()
    const currentTimeInMinutes = (now.getHours() * 60) + now.getMinutes()
    return currentTimeInMinutes >= getPulangThresholdMinutes()
  }

  const handlePulang = async (izinPulangAwal = false, keteranganCustom = '') => {
    if (!todayAttendance || (todayAttendance.status !== 'hadir' && todayAttendance.status !== 'hadir_terlambat' && todayAttendance.status !== 'hadir_izin_terlambat')) return

    // Cek apakah sudah presensi pulang (cek kedua field untuk compatibility)
    if (todayAttendance.jam_pulang || todayAttendance.jamPulang) {
      setMessage({ type: 'error', text: 'Anda sudah melakukan presensi pulang!' })
      return
    }

    // Cek waktu minimal (sesuai setting jam_min_pulang)
    const now = new Date()
    const currentTimeInMinutes = (now.getHours() * 60) + now.getMinutes()

    if (currentTimeInMinutes < getPulangThresholdMinutes()) {
      setMessage({
        type: 'error',
        text: `Presensi pulang hanya bisa dilakukan mulai pukul ${formatPulangThreshold()} WIB`
      })
      return
    }

    if (checkoutPreparation.current || attendanceActionRef.current) return
    checkoutPreparation.current = true
    setLoading(true)
    setMessage({ type: '', text: '' })

    // MODE TESTING dari settings (bukan hardcoded)
    const TESTING_MODE = settings.mode_testing == '1' // Gunakan == agar int(1) tetap true sebagai '1'

    try {
      const location = await getFastLocation()
      // Cek apakah di dalam radius sekolah. Jika di luar (dan bukan testing),
      // munculkan popup konfirmasi: apakah presensi pulang di sekolah atau di luar (lupa)?
      if (!TESTING_MODE) {
        const validation = validateAttendanceLocation(location, true)

        if (!validation.isValid) {
          // Jangan blokir — simpan draf & tanyakan lokasi pulang.
          setPendingPulang({ izinPulangAwal, keteranganCustom, location })
          setShowPiketModal(false)
          setPulangLuarModal(true)
          setLoading(false)
          return
        }
      }

      // Di dalam radius (atau mode testing) → langsung submit sebagai 'sekolah'
      return await submitPulang(izinPulangAwal, keteranganCustom, location, 'sekolah')
    } catch (error) {
      if (error.message.startsWith('PIKET_RESTRICTION|')) {
        const jam = error.message.split('|')[1]
        setPiketCheckoutTime(jam)
        setPiketStep(1)
        setPulangLuarModal(false)
        setShowPiketModal(true)
        setPendingQRData(null) // Reset QR data if any
      } else {
        setMessage({
          type: 'error',
          text: 'Gagal menyimpan presensi pulang: ' + error.message
        })
      }
      setLoading(false)
    } finally {
      checkoutPreparation.current = false
      setLoading(false)
    }
  }

  // Submit presensi pulang ke server dengan penanda lokasi (sekolah/luar).
  const submitPulang = async (izinPulangAwal, keteranganCustom, location, lokasiPulang) => {
    if (!startAttendanceAction()) return
    try {
      const updatedData = {
        id: todayAttendance.id,
        keterangan: keteranganCustom,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        izin_pulang_awal: izinPulangAwal,
        lokasi_pulang: lokasiPulang
      }

      const response = await presensiAPI.update(updatedData)

      setMessage({
        type: 'success',
        text: lokasiPulang === 'luar'
          ? 'Presensi pulang dicatat (di luar sekolah — lupa pulang).'
          : 'Presensi pulang berhasil disimpan!'
      })

      const attendance = getAttendanceFromResponse(response)
      if (attendance) {
        setTodayAttendance(attendance)
      } else {
        await checkTodayAttendance()
      }

      setAttendanceFeedback(getCheckoutFeedback())

      setPulangLuarModal(false)
      setPendingPulang(null)
      setShowPiketModal(false)
      setKeteranganPiket('')
      void loadMonthlyStats()
      return true
    } catch (error) {
      if (error.message.startsWith('PIKET_RESTRICTION|')) {
        const jam = error.message.split('|')[1]
        setPiketCheckoutTime(jam)
        setPiketStep(1)
        setPulangLuarModal(false)
        setShowPiketModal(true)
        setPendingQRData(null)
      } else {
        setMessage({
          type: 'error',
          text: 'Gagal menyimpan presensi pulang: ' + error.message
        })
      }
    } finally {
      finishAttendanceAction()
    }
  }

  // Konfirmasi pilihan lokasi pulang dari popup (dipanggil tombol modal).
  const confirmPulangLocation = (lokasiPulang) => {
    if (!pendingPulang) return
    const { izinPulangAwal, keteranganCustom, location } = pendingPulang
    submitPulang(izinPulangAwal, keteranganCustom, location, lokasiPulang)
  }

  const handleQRScanPiketRestriction = (jam, qrData) => {
    setPiketCheckoutTime(jam)
    setPendingQRData(qrData)
    setKeteranganPiket('')
    setPiketStep(1) // Start at step 1
    setShowPiketModal(true)
  }

  const handleIzinPulangAwal = async () => {
    if (!keteranganPiket.trim()) {
      setFormError('Alasan izin pulang lebih awal wajib diisi.')
      return
    }

    setFormError('')
    setMessage({ type: '', text: '' })
    if (pendingQRData) {
      // Jika dari QR Scan
      setLoading(true)
      try {
        const location = await getFastLocation()
        const response = await qrScanAPI.submit(
          pendingQRData,
          location.latitude,
          location.longitude,
          true, // isPulang
          true, // izin_pulang_awal
          keteranganPiket, // pass the reason
          location.accuracy
        )
        setShowPiketModal(false)
        setPendingQRData(null)
        setKeteranganPiket('')
        setMessage({ type: 'success', text: '✅ Presensi pulang (izin awal) berhasil!' })
        const attendance = getAttendanceFromResponse(response)
        if (attendance) {
          setTodayAttendance(attendance)
        } else {
          checkTodayAttendance()
        }
      } catch (error) {
        setMessage({ type: 'error', text: error.message })
      } finally {
        setLoading(false)
      }
    } else {
      // Jika dari tombol manual
      setLoading(true)
      try {
        await handlePulang(true, keteranganPiket)
      } catch (error) {
        console.error('Error early checkout manual:', error)
      } finally {
        setLoading(false)
      }
    }
  }

  // Loading state
  if (pageLoading) {
    return (
      <div className="space-y-4">
        <div className="guru-surface p-6">
          <h2 className="text-base font-bold text-slate-700 dark:text-slate-200">{formatFullDate(new Date())}</h2>
        </div>
        <div className="guru-surface flex flex-col items-center justify-center p-12">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-slate-800" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">Memuat data presensi...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <div className="guru-surface p-6">
          <h2 className="text-base font-bold text-slate-700 dark:text-slate-200">{formatFullDate(new Date())}</h2>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-500/20 dark:bg-rose-500/10">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300">
            <AlertCircle className="h-7 w-7" />
          </span>
          <h3 className="mt-4 text-lg font-bold text-rose-800 dark:text-rose-200">User tidak ditemukan</h3>
          <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">Silakan logout dan login kembali</p>
        </div>
      </div>
    )
  }

  if (initialError) return <Notice onRetry={loadInitialData}>{initialError}</Notice>

  const scheduleInfo = (() => {
    const today = new Date()
    const isMonday = today.getDay() === 1
    const isApel = settings.apel_senin_enabled == '1'
    const piketTime = jadwalPiketHariIni?.jam_piket?.substring(0, 5)

    if (isMonday && isApel) {
      return { label: isPiketToday ? 'Apel & Piket' : 'Apel Senin', time: isPiketToday ? piketTime : '07:00' }
    }

    if (isPiketToday) {
      return { label: 'Jadwal piket', time: piketTime }
    }

    return { label: 'Jam masuk normal', time: settings.jam_masuk_normal }
  })()

  const isTestingMode = settings.mode_testing == '1'
  const isGpsReady = isTestingMode || locationStatus.state === 'ready'
  const gpsLabel = isTestingMode ? 'Mode testing aktif' : locationStatus.state === 'ready' ? 'Lokasi siap digunakan' : locationStatus.state === 'loading' ? 'Sedang mencari lokasi...' : 'Lokasi perlu diperbarui'
  const checkedOut = Boolean(todayAttendance?.jamPulang || todayAttendance?.jam_pulang)
  const isLeave = ['izin', 'sakit'].includes(todayAttendance?.status)
  const isPresent = ['hadir', 'hadir_terlambat', 'hadir_izin_terlambat'].includes(todayAttendance?.status)
  const actionVisible = !isHoliday && !checkedOut && !isLeave && (!todayAttendance || (isPresent && !isPokjar))
  // The existing checkout path is available independently of button_enabled.
  const actionAllowed = isPresent || settings.button_enabled == '1'
  const checkoutReady = !isPresent || canShowPulangButton()
  const title = isHoliday ? 'Hari ini libur' : checkedOut ? 'Presensi hari ini selesai' : isLeave ? (todayAttendance.status === 'izin' ? 'Izin sudah tercatat' : 'Sakit sudah tercatat') : isPresent ? isPokjar ? 'Presensi Pokjar tercatat' : 'Presensi masuk tercatat' : isPokjar ? 'Presensi Pokjar' : 'Mulai hari Anda'
  const time = (value) => value ? String(value).slice(0, 5) : 'Belum tercatat'
  const closeLeave = () => { setShowModal(false); setKeterangan(''); setFormError('') }
  const closePiket = () => { setShowPiketModal(false); setKeteranganPiket(''); setFormError('') }

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0"><h1 className="break-words text-xl font-semibold text-foreground">{user.nama}</h1><p className="mt-1 text-sm text-muted-foreground">{formatFullDate(new Date())}</p></div>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground" aria-hidden="true">{(user.nama || 'G').charAt(0).toUpperCase()}</span>
    </div>

    <Card className="gap-4 p-5 sm:p-6" aria-labelledby="attendance-action-title" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Presensi hari ini</p>{todayAttendance && <AttendanceStatus status={todayAttendance.status} />}</div>
      <div><h2 id="attendance-action-title" tabIndex={-1} className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {isHoliday ? (holidayInfo?.message || 'Tidak perlu melakukan presensi hari ini.') : checkedOut ? 'Jam masuk dan pulang Anda sudah tersimpan.' : isLeave ? 'Tidak perlu presensi pulang untuk status ini.' : isPresent ? isPokjar ? 'Presensi sederhana Pokjar sudah tercatat. Tidak memerlukan GPS atau presensi pulang.' : checkoutReady ? 'Catat kepulangan untuk menyelesaikan presensi hari ini.' : 'Presensi pulang tersedia mulai ' + formatPulangThreshold() + ' WIB.' : isPokjar ? 'Catat Hadir, Izin, atau Sakit. Mode Pokjar tidak memakai GPS dan presensi pulang.' : 'Tekan tombol di bawah saat berada di area sekolah.'}
      </p></div>
      {!isPokjar && !gmailComplete && <div role="status" className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold">Gmail diperlukan untuk presensi</p><p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-100/80">Mohon lengkapi Gmail aktif berakhiran <strong>@gmail.com</strong> melalui menu Akun agar dapat melakukan presensi masuk, izin/sakit, dan pulang.</p></div>
        <Button type="button" variant="outline" className="shrink-0 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-amber-950" onClick={() => onChangeTab?.('akun')}>Lengkapi Gmail</Button>
      </div>}
      {actionVisible && (actionAllowed ? <Button type="button" size="lg" className={`w-full text-base ${isPresent ? 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500' : ''}`} onClick={() => isPresent ? handlePulang() : handleHadir()} disabled={loading || !checkoutReady || (!isPokjar && !gmailComplete)}>
        {loading ? <RefreshCw className="animate-spin" aria-hidden="true" /> : isPresent ? <LogOut aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}
        {loading ? 'Memproses presensi...' : !isPokjar && !gmailComplete ? 'Lengkapi Gmail untuk presensi' : isPresent ? checkoutReady ? 'Presensi pulang' : 'Pulang mulai ' + formatPulangThreshold() + ' WIB' : 'Presensi masuk'}
      </Button> : <Notice tone="warning">Presensi tombol sedang dinonaktifkan. Hubungi administrator untuk metode presensi yang ditetapkan sekolah.</Notice>)}
      {todayAttendance && <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/60 p-3">
        <div><dt className="text-xs text-muted-foreground">{isLeave ? 'Waktu laporan' : 'Jam masuk'}</dt><dd className="mt-1 text-base font-semibold tabular-nums">{time(isLeave ? (todayAttendance.jamIzin || todayAttendance.jam_izin || todayAttendance.jamSakit || todayAttendance.jam_sakit) : (todayAttendance.jamMasuk || todayAttendance.jam_masuk || todayAttendance.jamHadir || todayAttendance.jam_hadir))}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{isPokjar ? 'Mode presensi' : 'Jam pulang'}</dt><dd className="mt-1 text-base font-semibold tabular-nums">{isLeave ? 'Tidak diperlukan' : isPokjar ? 'Sederhana · tanpa pulang' : time(todayAttendance.jamPulang || todayAttendance.jam_pulang)}</dd></div>
      </dl>}
      {todayAttendance?.keterangan && <details className="text-sm"><summary className="cursor-pointer py-2 text-muted-foreground">Keterangan presensi</summary><p className="whitespace-pre-wrap break-words py-2">{todayAttendance.keterangan}</p></details>}
      {actionVisible && <div className="grid grid-cols-2 gap-3"><Button type="button" variant="outline" disabled={loading || (!isPokjar && !gmailComplete)} onClick={() => handleIzinSakit('izin')}><FileText aria-hidden="true" />Izin</Button><Button type="button" variant="outline" disabled={loading || (!isPokjar && !gmailComplete)} onClick={() => handleIzinSakit('sakit')}><AlertCircle aria-hidden="true" />Sakit</Button></div>}
      {message.text && !showModal && !showPiketModal && !pulangLuarModal && !attendanceFeedback && <Notice tone={message.type} onDismiss={() => setMessage({ type: '', text: '' })}>{message.text}</Notice>}
    </Card>

    {!isPokjar && <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4 text-primary" aria-hidden="true" />{scheduleInfo.label}</p><span className="text-sm tabular-nums">{scheduleInfo.time || '--:--'} WIB</span></div>
      <p className="text-xs text-muted-foreground">Toleransi {settings.toleransi_terlambat} menit{isPiketToday && piketPulangTarget ? ' · Piket pulang mulai ' + piketPulangTarget.substring(0, 5) + ' WIB' : ''}</p>
      {!isHoliday && <div className="border-t border-border pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm"><MapPin className={'h-4 w-4 ' + (isGpsReady ? 'text-emerald-600' : 'text-muted-foreground')} aria-hidden="true" />{gpsLabel}</p>{!isTestingMode && <Button type="button" variant="ghost" onClick={warmUpLocation} disabled={locationStatus.state === 'loading'}>Perbarui lokasi</Button>}</div>
        {locationStatus.state === 'error' && <div className="mt-2 text-sm text-muted-foreground"><p>{locationStatus.message}</p><p className="mt-2">Aktifkan lokasi dan izin lokasi pada browser, lalu coba lagi di area terbuka.</p></div>}
        {settings.location_tracking_enabled == '1' && <p className="mt-2 text-xs text-muted-foreground">{trackingStatus.message}</p>}
      </div>}
    </Card>}

    <Card className="gap-4 p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Ringkasan {new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date())}</h2><p className="mt-1 text-xs text-muted-foreground">Berdasarkan catatan presensi bulan ini.</p></div><BarChart3 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /></div>
      {monthlyLoading ? <PageLoading /> : monthlyError ? <Notice onRetry={loadMonthlyStats}>{monthlyError}</Notice> : <>
        <div className="grid grid-cols-4 gap-2">{[{ label: 'Hadir', value: monthlyStats.hadir }, { label: 'Izin', value: monthlyStats.izin }, { label: 'Sakit', value: monthlyStats.sakit }, { label: 'Alfa', value: monthlyStats.alfa }].map((item) => <div key={item.label} className="rounded-lg bg-muted/60 p-3 text-center"><p className="text-xl font-semibold tabular-nums">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.label}</p></div>)}</div>
        <div><div className="mb-2 flex justify-between gap-2 text-sm"><span className="text-muted-foreground">{monthlyStats.hadir} dari {monthlyStats.total} catatan</span><span className="font-semibold text-primary">{monthlyStats.percentage}%</span></div><Progress value={monthlyStats.percentage} aria-label="Persentase kehadiran bulan ini" /></div>
      </>}
      <Button type="button" variant="outline" onClick={() => onChangeTab?.('statistik')}>Lihat statistik<ArrowRight aria-hidden="true" /></Button>
    </Card>

    <Card className="gap-0 p-0">
      <div className="flex items-center justify-between gap-3 px-5 py-3"><h2 className="text-base font-semibold">Aktivitas terakhir</h2><Button type="button" variant="ghost" onClick={() => onChangeTab?.('riwayat')}>Riwayat<ArrowRight aria-hidden="true" /></Button></div>
      {monthlyLoading ? <div className="p-5"><PageLoading /></div> : monthlyError ? <div className="px-5 pb-5 text-sm text-muted-foreground">Aktivitas belum dapat dimuat.</div> : recentLogs.length ? <div className="divide-y divide-border border-t border-border">{recentLogs.slice(0, 3).map((log) => <div key={log.id || log.tanggal + '-' + log.status} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-medium">{log.tanggal}</p><p className="mt-1 text-xs text-muted-foreground">{time(log.jamMasuk || log.jam_masuk || log.jamHadir || log.jam_hadir)}</p></div><AttendanceStatus status={log.status} /></div>)}</div> : <EmptyState title="Belum ada aktivitas" description="Presensi yang tersimpan akan tampil di sini." />}
    </Card>

    <AppDialog open={showModal} onOpenChange={(open) => { if (!open) closeLeave() }} busy={loading} title={modalType === 'izin' ? 'Catat izin' : 'Catat sakit'} description="Isi keterangan sebelum menyimpan presensi.">
      <form onSubmit={(event) => { event.preventDefault(); void submitIzinSakit() }} className="space-y-4">
        <label htmlFor="leave-reason" className="block text-sm font-medium">Keterangan {modalType === 'izin' ? 'izin' : 'sakit'}</label>
        <textarea id="leave-reason" value={keterangan} onChange={(event) => { setKeterangan(event.target.value); setFormError('') }} rows={4} disabled={loading} aria-invalid={!!formError} aria-describedby={formError ? 'leave-error' : undefined} className="w-full rounded-lg border border-input p-3" placeholder="Tuliskan keterangan..." />
        {formError && <p id="leave-error" role="alert" className="text-sm text-rose-700 dark:text-rose-300">{formError}</p>}
        {message.type === 'error' && message.text && <Notice>{message.text}</Notice>}
        <div className="flex gap-3"><Button type="button" variant="outline" className="flex-1" disabled={loading} onClick={closeLeave}>Batal</Button><Button type="submit" className="flex-1" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan'}</Button></div>
      </form>
    </AppDialog>

    <AppDialog open={showPiketModal} onOpenChange={(open) => { if (!open) closePiket() }} busy={loading} title="Belum waktunya pulang" description={'Petugas piket pulang mulai ' + piketCheckoutTime + ' WIB. Pulang lebih awal memerlukan izin atasan.'}>
      {message.type === 'error' && message.text && <Notice>{message.text}</Notice>}
      {piketStep === 1 ? <div className="mt-4 space-y-3"><Button type="button" className="w-full" disabled={loading} onClick={() => setPiketStep(2)}>Saya sudah mendapat izin</Button><Button type="button" variant="outline" className="w-full" disabled={loading} onClick={closePiket}>Kembali</Button></div> :
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleIzinPulangAwal() }}>
          <label htmlFor="piket-reason" className="mt-4 block text-sm font-medium">Alasan izin pulang lebih awal</label><textarea id="piket-reason" value={keteranganPiket} onChange={(event) => { setKeteranganPiket(event.target.value); setFormError('') }} disabled={loading} rows={4} aria-invalid={!!formError} aria-describedby={formError ? 'piket-error' : undefined} className="w-full rounded-lg border border-input p-3" />
          {formError && <p id="piket-error" role="alert" className="text-sm text-rose-700 dark:text-rose-300">{formError}</p>}
          <div className="flex gap-3"><Button type="button" variant="outline" disabled={loading} onClick={() => setPiketStep(1)}>Kembali</Button><Button type="submit" className="flex-1" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan kepulangan'}</Button></div>
        </form>}
    </AppDialog>

    <AppDialog open={pulangLuarModal} onOpenChange={(open) => { if (!open) { setPulangLuarModal(false); setPendingPulang(null) } }} busy={loading} title="Konfirmasi lokasi pulang" description="Lokasi Anda terdeteksi di luar radius sekolah. Pilih posisi Anda saat ini.">
      <div className="space-y-3">
        {message.type === 'error' && message.text && <Notice>{message.text}</Notice>}
        <Button type="button" className="w-full" disabled={loading} onClick={() => confirmPulangLocation('sekolah')}>Saya di sekolah</Button>
        <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={() => confirmPulangLocation('luar')}>Di luar — lupa presensi pulang</Button>
        <p className="text-sm text-muted-foreground">Pilihan di luar sekolah akan ditandai sebagai lupa presensi pulang.</p>
        <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={() => { setPulangLuarModal(false); setPendingPulang(null) }}>Batal</Button>
      </div>
    </AppDialog>
    <AttendanceFeedbackDialog feedback={attendanceFeedback} onClose={() => setAttendanceFeedback(null)} />
  </div>
}

export default GuruHome
