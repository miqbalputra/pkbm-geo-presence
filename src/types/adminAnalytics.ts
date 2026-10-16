export type AnalyticsSummary = {
  totalGuru: number
  totalHariKerja: number
  hadir: number
  tepatWaktu: number
  terlambat: number
  izin: number
  sakit: number
  alfa: number
  checkoutLengkap: number
  lupaCheckout: number
  pulangAwal: number
  lemburHari: number
  lemburMenit: number
  persentaseKehadiran: number
  persentaseTepatWaktu: number
  persentaseCheckout: number
  rataRataMenitMasuk: number | null
  rataRataMenitPulang: number | null
  distribusiWaktuDatang: Record<string, number>
}

export type AnalyticsDaily = {
  tanggal: string
  label: string
  totalHariKerja: number
  hadir: number
  tepatWaktu: number
  terlambat: number
  izin: number
  sakit: number
  alfa: number
  checkoutLengkap: number
  lupaCheckout: number
  pulangAwal: number
  rataRataMenitMasuk: number | null
  rataRataMenitPulang: number | null
}

export type AnalyticsTeacher = {
  id: number
  nama: string
  jabatan: string
  tipeGuru: string
  totalHariKerja: number
  hadir: number
  tepatWaktu: number
  terlambat: number
  izin: number
  sakit: number
  alfa: number
  checkoutLengkap: number
  lupaCheckout: number
  pulangAwal: number
  lemburHari: number
  lemburMenit: number
  persentaseKehadiran: number
  persentaseTepatWaktu: number
  persentasePulang: number
  rataRataMenitMasuk: number | null
  rataRataMenitPulang: number | null
  skor: number
}

export type AnalyticsRecord = {
  id?: number
  userId?: number
  user_id?: number
  nama?: string
  tanggal?: string
  status?: string
  jamMasuk?: string | null
  jam_masuk?: string | null
  jamPulang?: string | null
  jam_pulang?: string | null
  keterangan?: string | null
}

export type AdminAnalyticsData = {
  period: { startDate: string; endDate: string; totalHari: number }
  filters: { tipeGuru: string; userId: number }
  filterOptions: { tipeGuru: string[]; guru: Array<{ id: number; nama: string; tipeGuru: string }> }
  summary: AnalyticsSummary
  today: AnalyticsSummary
  daily: AnalyticsDaily[]
  teachers: AnalyticsTeacher[]
  details: {
    terlambatPiket: AnalyticsRecord[]
    pulangAwal: AnalyticsRecord[]
    izinSakit: AnalyticsRecord[]
    lupaCheckout: AnalyticsRecord[]
  }
  comparison: { startDate: string; endDate: string; available: boolean; summary: AnalyticsSummary }
}

export type AdminAnalyticsFilters = {
  startDate: string
  endDate: string
  tipeGuru?: string
  userId?: string | number
}
