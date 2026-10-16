// Format tanggal ke dd-mm-yyyy
type Holiday = { tanggal: string; is_workday?: string | number | boolean }
type WorkdayOptions = Record<string, unknown> & {
  gender?: unknown
  jenisKelamin?: unknown
  weekendWorkdayEnabled?: unknown
  saturday_male_workday_enabled?: unknown
  saturday_female_workday_enabled?: unknown
  sunday_male_workday_enabled?: unknown
  sunday_female_workday_enabled?: unknown
}

export const formatDate = (date) => {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

// Format tanggal untuk tampilan manusia tanpa mengubah nilai tanggal sumber.
// Tanggal dari API kadang berupa ISO timestamp lengkap, sementara input Excel
// bisa berupa yyyy-mm-dd. Keduanya ditampilkan konsisten dalam bahasa Indonesia.
export const formatDisplayDate = (date) => {
  if (!date) return '-'

  const raw = String(date).trim()
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(raw)

  if (Number.isNaN(parsed.getTime())) return raw

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
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

export const getWorkdayDates = (startDate: string, endDate: string, holidays: Holiday[] = [], options: WorkdayOptions = {}) => {
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

  return eachDateInRange(startDate, endDate).filter(date => {
    const holiday = holidaysByDate.get(date)
    const day = new Date(`${date}T00:00:00`).getDay()
    const isWeekend = day === 0 || day === 6
    // Selaras dengan backend gpw_is_special_workday(): hanya is_workday=1 yang
    // dianggap hari kerja khusus. Libur jenis 'sekolah' dengan is_workday=0
    // adalah libur total, BUKAN hari kerja.
    const isSpecialWorkday = holiday && Number(holiday.is_workday) === 1

    return isSpecialWorkday || (!holiday && (!isWeekend || isWeekendWorkday(day)))
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
