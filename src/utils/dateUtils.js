// Format tanggal ke dd-mm-yyyy
export const formatDate = (date) => {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

// Format tanggal untuk input date (yyyy-mm-dd)
export const formatDateForInput = (date) => {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${year}-${month}-${day}`
}

export const addDays = (date, days) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export const eachDateInRange = (startDate, endDate) => {
  const dates = []
  const current = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)

  while (current <= end) {
    dates.push(formatDateForInput(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}

// Parse setting `workday_days` (CSV "0=Minggu..6=Sabtu") ke array angka.
// Default [6] (Sabtu saja) — sesuai aturan PKBM Tunas Ilmu.
export const parseWorkdayDays = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return [6]
  const days = raw.split(/[\s,]+/).map(p => parseInt(p, 10)).filter(n => n >= 0 && n <= 6)
  return days.length ? days : [6]
}

// Nomor pekan dalam bulan (1..5). Pekan 1 = tanggal 1-7, pekan 2 = 8-14, dst.
// Dipakai untuk rotasi piket dwi-pekanan Sabtu.
export const getWeekOfMonth = (date) => {
  const d = new Date(`${date}T00:00:00`)
  return Math.floor((d.getDate() - 1) / 7) + 1
}

export const getWorkdayDates = (startDate, endDate, holidays = [], options = {}) => {
  const holidaysByDate = new Map(holidays.map(holiday => [holiday.tanggal, holiday]))
  const isEnabled = (value) => value === true || value === '1' || value === 1
  const normalizeGender = (gender) => {
    const value = String(gender || '').toLowerCase().trim()
    if (['laki-laki', 'laki laki', 'male'].includes(value)) return 'male'
    if (['perempuan', 'female'].includes(value)) return 'female'
    return null
  }
  const gender = normalizeGender(options.gender || options.jenisKelamin)
  const hasSpecificWeekendSettings = [
    'saturday_male_workday_enabled',
    'saturday_female_workday_enabled',
    'sunday_male_workday_enabled',
    'sunday_female_workday_enabled'
  ].some(key => Object.prototype.hasOwnProperty.call(options, key))

  const isWeekendWorkday = (day) => {
    if (!hasSpecificWeekendSettings) {
      return isEnabled(options.weekendWorkdayEnabled)
    }

    if (day === 6) {
      if (gender === 'male') return isEnabled(options.saturday_male_workday_enabled)
      if (gender === 'female') return isEnabled(options.saturday_female_workday_enabled)
      return isEnabled(options.saturday_male_workday_enabled) || isEnabled(options.saturday_female_workday_enabled)
    }

    if (day === 0) {
      if (gender === 'male') return isEnabled(options.sunday_male_workday_enabled)
      if (gender === 'female') return isEnabled(options.sunday_female_workday_enabled)
      return isEnabled(options.sunday_male_workday_enabled) || isEnabled(options.sunday_female_workday_enabled)
    }

    return false
  }

  // Hari kerja reguler ditentukan oleh setting `workday_days` (default Sabtu saja).
  // Bila tidak disediakan, fallback ke logika weekend lama (backward-compat).
  const workdayDays = options.workdayDays || parseWorkdayDays(options.workday_days)
  const useWorkdayDays = workdayDays && workdayDays.length > 0

  return eachDateInRange(startDate, endDate).filter(date => {
    const holiday = holidaysByDate.get(date)
    const day = new Date(`${date}T00:00:00`).getDay()
    const isWeekend = day === 0 || day === 6
    // Selaras dengan backend gpw_is_special_workday(): hanya is_workday=1 yang
    // dianggap hari kerja khusus. Libur jenis 'sekolah' dengan is_workday=0
    // adalah libur total, BUKAN hari kerja.
    const isSpecialWorkday = holiday && Number(holiday.is_workday) === 1
    const isRegularWorkday = useWorkdayDays
      ? workdayDays.includes(day)
      : (!isWeekend || isWeekendWorkday(day))

    return isSpecialWorkday || (!holiday && isRegularWorkday)
  })
}

// Hitung lama bertugas
export const calculateWorkDuration = (startDate) => {
  const start = new Date(startDate)
  const now = new Date()
  
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  
  if (months < 0) {
    years--
    months += 12
  }
  
  return `${years} Tahun ${months} Bulan`
}

// Get hari dalam bahasa Indonesia
export const getDayName = (date) => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  return days[new Date(date).getDay()]
}

// Get nama bulan dalam bahasa Indonesia
export const getMonthName = (monthIndex) => {
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  return months[monthIndex]
}

// Format tanggal lengkap (Senin, 12 Desember 2025)
export const formatFullDate = (date) => {
  const d = new Date(date)
  const dayName = getDayName(d)
  const day = d.getDate()
  const monthName = getMonthName(d.getMonth())
  const year = d.getFullYear()
  return `${dayName}, ${day} ${monthName} ${year}`
}

// Format waktu untuk database (HH:MM:SS)
export const formatTimeForDB = (date = new Date()) => {
  const d = new Date(date)
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}
