import { Award, BadgeCheck, BriefcaseBusiness, Clock3, Stethoscope, type LucideIcon } from 'lucide-react'

export type AttendanceFeedbackTone = 'success' | 'warning' | 'error' | 'info'

export type AttendanceFeedback = {
  status: string
  title: string
  message: string
  tone: AttendanceFeedbackTone
  icon: LucideIcon
}

const feedbackByStatus: Record<string, AttendanceFeedback> = {
  hadir: {
    status: 'hadir',
    title: 'Alhamdulillah, tepat waktu',
    message: 'Jazakumullahu khaira sudah berusaha hadir tepat waktu.',
    tone: 'success',
    icon: BadgeCheck,
  },
  hadir_terlambat: {
    status: 'hadir_terlambat',
    title: 'Tetap semangat',
    message: "Terimakasih sudah berusaha hadir hari ini. Mohon kedepan bisa tepat waktu nggih. Semoga Allah ta'ala mudahkan.",
    tone: 'warning',
    icon: Clock3,
  },
  hadir_izin_terlambat: {
    status: 'hadir_izin_terlambat',
    title: 'Tetap semangat',
    message: "Terimakasih sudah berusaha hadir hari ini. Mohon kedepan bisa tepat waktu nggih. Semoga Allah ta'ala mudahkan.",
    tone: 'warning',
    icon: Clock3,
  },
  sakit: {
    status: 'sakit',
    title: 'Semoga lekas pulih',
    message: "Syafaakallah syifaa an 'aajilan - Semoga diberikan kesembuhan oleh Allah ta'ala dan diampuni semua dosa-dosa.",
    tone: 'error',
    icon: Stethoscope,
  },
  izin: {
    status: 'izin',
    title: 'Izin telah tercatat',
    message: "Semoga Allah ta'ala lancarkan dan mudahkan urusan Anda.",
    tone: 'info',
    icon: BriefcaseBusiness,
  },
}

const checkoutFeedback: AttendanceFeedback = {
  status: 'pulang',
  title: 'Presensi pulang tercatat',
  message: "Jazakumullahu khaira katsira atas kerja keras hari ini.\nSemoga Allah ta'ala memberikan balasan pahala terbaik untuk Ustadz/Ustadzah",
  tone: 'success',
  icon: Award,
}

export function getAttendanceFeedback(status: unknown): AttendanceFeedback | null {
  return typeof status === 'string' ? feedbackByStatus[status] || null : null
}

export function getCheckoutFeedback(): AttendanceFeedback {
  return checkoutFeedback
}
