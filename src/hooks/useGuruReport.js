import { useState, useEffect, useCallback } from 'react'
import { formatDateForInput, getWorkdayDates, parseWorkdayDays } from '../utils/dateUtils'
import {
  presensiAPI,
  holidaysAPI,
  settingsAPI,
  weekendOverridesAPI,
  optionalWorkdaysAPI,
  teacherWorkdaysAPI,
  teachersWorkdaysAPI,
} from '../services/api'

/**
 * useGuruReport — shared report logic used by both Admin "Download Laporan"
 * and Guru "Riwayat" menus so they always show identical data.
 *
 * Given a teacher (guru) id + date range, it loads all supporting data
 * (holidays, settings, weekend overrides, optional workdays, backend workdays)
 * and computes the same report rows & summary as the admin report.
 *
 * @param {Object}   guru        - guru object ({ id, jenisKelamin, ... }) or null
 * @param {string}   startDate   - yyyy-mm-dd
 * @param {string}   endDate     - yyyy-mm-dd
 * @param {Object}   [options]
 * @param {boolean}  [options.allGuru=false] - when true, load ALL presensi logs
 *                                   (admin context); when false, only the guru's
 *                                   own logs are fetched (lighter for teachers).
 */
export function useGuruReport(guru, startDate, endDate, options = {}) {
  const { allGuru = false } = options

  const [attendanceLogs, setAttendanceLogs] = useState([])
  const [holidays, setHolidays] = useState([])
  const [settings, setSettings] = useState({
    weekend_workday_enabled: '0',
    saturday_male_workday_enabled: '0',
    saturday_female_workday_enabled: '0',
    sunday_male_workday_enabled: '0',
    sunday_female_workday_enabled: '0',
  })
  const [overrides, setOverrides] = useState([])
  const [optionalWorkdays, setOptionalWorkdays] = useState([])
  const [workdaysCache, setWorkdaysCache] = useState({})
  const [loading, setLoading] = useState(true)

  // ── Load base data (holidays, settings, presensi) ──────────────────────────
  useEffect(() => {
    let cancelled = false
    async function loadBase() {
      try {
        setLoading(true)
        const presFilters = allGuru ? {} : { user_id: guru?.id }
        const [presensiResponse, holidaysResponse, settingsResponse] = await Promise.all([
          presensiAPI.getAll(presFilters),
          holidaysAPI.getAll(),
          settingsAPI.getAll(),
        ])
        if (cancelled) return
        setAttendanceLogs(presensiResponse.data || [])
        setHolidays(holidaysResponse.data || [])
        setSettings((prev) => ({ ...prev, ...(settingsResponse.data || {}) }))
      } catch (error) {
        console.error('useGuruReport: failed to load base data:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadBase()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guru?.id, allGuru])

  // ── Load period-dependent data (overrides, optional workdays, workdays) ───
  // Untuk guru (allGuru=false): gunakan teacherWorkdaysAPI (singular) yang
  // dapat diakses guru. Untuk admin (allGuru=true): gunakan teachersWorkdaysAPI
  // (bulk) yang butuh auth admin.
  useEffect(() => {
    let cancelled = false
    async function loadPeriod() {
      if (!startDate || !endDate) return
      try {
        const optionalPromise = optionalWorkdaysAPI.getAll({ start_date: startDate, end_date: endDate })

        if (allGuru) {
          // Admin context: bulk API untuk semua guru + override admin.
          const [overridesResponse, optionalResponse, allResponse] = await Promise.all([
            weekendOverridesAPI.getAll({ start_date: startDate, end_date: endDate }),
            optionalPromise,
            teachersWorkdaysAPI.getAll(startDate, endDate),
          ])
          if (cancelled) return
          setOverrides(overridesResponse.data || [])

          const optionalDates = (optionalResponse.data || []).map((o) => o.tanggal || o)
          setOptionalWorkdays(
            optionalDates.length > 0 ? optionalDates : allResponse.data?.optional_dates || []
          )

          const newCache = {}
          if (allResponse.data?.teachers) {
            Object.values(allResponse.data.teachers).forEach((t) => {
              newCache[`${t.user_id}_${startDate}_${endDate}`] = t.workday_dates || []
            })
          }
          setWorkdaysCache(newCache)
        } else {
          // Guru context: jangan panggil weekendOverridesAPI karena endpoint itu
          // hanya untuk admin/kepala sekolah. teacherWorkdaysAPI singular sudah
          // menghitung hari kerja guru termasuk override/optional dari backend.
          const userId = guru?.id
          if (!userId) return
          const [optionalResponse, workdaysResponse] = await Promise.all([
            optionalPromise,
            teacherWorkdaysAPI.getWorkdays(userId, startDate, endDate),
          ])
          if (cancelled) return

          const userOverrides = (workdaysResponse.data?.breakdown || [])
            .filter((d) => d.override)
            .map((d) => ({ ...d.override, tanggal: d.tanggal, user_id: userId }))
          setOverrides(userOverrides)

          const optionalDates = (optionalResponse.data || []).map((o) => o.tanggal || o)
          setOptionalWorkdays(
            optionalDates.length > 0 ? optionalDates : (workdaysResponse.data?.optional_dates || [])
          )

          const newCache = {}
          newCache[`${userId}_${startDate}_${endDate}`] = workdaysResponse.data?.workday_dates || []
          setWorkdaysCache(newCache)
        }
      } catch (error) {
        console.error('useGuruReport: failed to load period data:', error)
      }
    }
    loadPeriod()
    return () => {
      cancelled = true
    }
  }, [startDate, endDate, allGuru, guru?.id])

  const getGender = useCallback((g) => g?.jenisKelamin || g?.jenis_kelamin || '', [])

  const getRangeWorkdays = useCallback(
    (g = null) => {
      if (g?.id) {
        const cached = workdaysCache[`${g.id}_${startDate}_${endDate}`]
        if (cached) return cached
      }
      return getWorkdayDates(startDate, endDate, holidays, {
        weekendWorkdayEnabled: settings.weekend_workday_enabled,
        saturday_male_workday_enabled: settings.saturday_male_workday_enabled,
        saturday_female_workday_enabled: settings.saturday_female_workday_enabled,
        sunday_male_workday_enabled: settings.sunday_male_workday_enabled,
        sunday_female_workday_enabled: settings.sunday_female_workday_enabled,
        workdayDays: parseWorkdayDays(settings.workday_days),
        gender: getGender(g),
      })
    },
    [workdaysCache, startDate, endDate, holidays, settings, getGender]
  )

  const getUserOverrides = useCallback((guruId) => {
    return new Map(
      (overrides || [])
        .filter((o) => {
          const overrideUserId = o.user_id || o.userId
          return String(overrideUserId) === String(guruId)
        })
        .map((o) => [o.tanggal, o.is_workday == 1])
    )
  }, [overrides])

  const getGuruLogsInRange = useCallback(
    (guruId) => {
      return attendanceLogs.filter((log) => {
        if (String(log.userId) !== String(guruId)) return false
        return log.tanggal >= startDate && log.tanggal <= endDate
      })
    },
    [attendanceLogs, startDate, endDate]
  )

  // Hari kerja yang dihitung sebagai riwayat/statistik hanya sampai hari ini.
  // Jika periode laporan melewati tanggal hari ini, tanggal kerja masa depan
  // tidak boleh muncul sebagai Alfa.
  const getRelevantDates = useCallback((g) => {
    const todayStr = formatDateForInput(new Date())
    return getRangeWorkdays(g).filter((date) => date <= todayStr)
  }, [getRangeWorkdays])

  const getGuruSummary = useCallback(
    (guruId, guruObj = null) => {
      const sourceGuru = guruObj || guru
      const g = sourceGuru && String(sourceGuru.id) === String(guruId) ? sourceGuru : { id: guruId, jenisKelamin: getGender(sourceGuru) }
      const relevantDates = getRelevantDates(g)
      const workdaySet = new Set(relevantDates)
      const optionalSet = new Set(optionalWorkdays)
      const guruLogs = getGuruLogsInRange(guruId)

      const workdayLogs = guruLogs.filter((l) => workdaySet.has(l.tanggal))
      const optionalLogs = guruLogs.filter((l) => optionalSet.has(l.tanggal))
      const optionalHadir = optionalLogs.filter(
        (l) => l.status === 'hadir' || l.status === 'hadir_terlambat' || l.status === 'hadir_izin_terlambat'
      ).length

      const totalHari = relevantDates.length + optionalHadir
      const hadir =
        workdayLogs.filter(
          (l) => l.status === 'hadir' || l.status === 'hadir_terlambat' || l.status === 'hadir_izin_terlambat'
        ).length + optionalHadir
      const izin = workdayLogs.filter((l) => l.status === 'izin').length
      const sakit = workdayLogs.filter((l) => l.status === 'sakit').length
      const alfa = Math.max(relevantDates.length - workdayLogs.length, 0)
      const persentase = totalHari > 0 ? ((hadir / totalHari) * 100).toFixed(1) : 0

      return { guruLogs: [...workdayLogs, ...optionalLogs], totalHari, hadir, izin, sakit, alfa, persentase }
    },
    [guru, getRelevantDates, optionalWorkdays, getGuruLogsInRange, getGender]
  )

  const getGuruReportRows = useCallback(
    (guruId, guruObj = null) => {
      const sourceGuru = guruObj || guru
      const g = sourceGuru && String(sourceGuru.id) === String(guruId) ? sourceGuru : { id: guruId, jenisKelamin: getGender(sourceGuru) }
      const logsByDate = new Map(getGuruLogsInRange(guruId).map((log) => [log.tanggal, log]))
      const userOverrides = getUserOverrides(g.id)
      const optionalSet = new Set(optionalWorkdays)

      // Bangun map hari libur (non-workday) untuk ditampilkan sebagai 'Libur'
      const holidayByDate = new Map()
      holidays.forEach((h) => {
        const isWorkdayHoliday = Number(h.is_workday) === 1
        if (!isWorkdayHoliday && h.tanggal >= startDate && h.tanggal <= endDate) {
          holidayByDate.set(h.tanggal, h)
        }
      })

      const workdayDates = getRelevantDates(g)
      const optionalDatesWithPresence = optionalWorkdays.filter((d) => logsByDate.has(d))
      const holidayDates = Array.from(holidayByDate.keys())
      const allDates = Array.from(new Set([...workdayDates, ...optionalDatesWithPresence, ...holidayDates])).sort()

      return allDates.map((date) => {
        const log = logsByDate.get(date)
        const isOverrideOff = userOverrides.has(date) && !userOverrides.get(date)
        if (log) return log
        if (optionalSet.has(date)) {
          return {
            id: `opsional-${guruId}-${date}`,
            tanggal: date,
            jamMasuk: '-',
            jamPulang: '-',
            status: 'opsional',
            keterangan: 'Hari kerja opsional (tidak hadir)',
          }
        }
        // Hari libur (non-workday holiday) — tampilkan sebagai Libur
        const holiday = holidayByDate.get(date)
        if (holiday) {
          const namaLibur = holiday.nama || 'Libur'
          return {
            id: `libur-${guruId}-${date}`,
            tanggal: date,
            jamMasuk: '-',
            jamPulang: '-',
            status: 'libur',
            keterangan: `${namaLibur} — tidak presensi`,
          }
        }
        return {
          id: `alfa-${guruId}-${date}`,
          tanggal: date,
          jamMasuk: '-',
          jamPulang: '-',
          status: isOverrideOff ? 'libur_override' : 'alfa',
          keterangan: isOverrideOff ? 'Libur khusus (override admin)' : 'Tidak presensi',
        }
      })
    },
    [guru, getGuruLogsInRange, getUserOverrides, optionalWorkdays, getRelevantDates, getGender, holidays, startDate, endDate]
  )

  return {
    loading,
    attendanceLogs,
    holidays,
    settings,
    overrides,
    optionalWorkdays,
    getRangeWorkdays,
    getUserOverrides,
    getGuruLogsInRange,
    getGuruSummary,
    getGuruReportRows,
  }
}

export default useGuruReport