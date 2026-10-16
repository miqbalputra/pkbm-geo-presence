export const attendanceStatuses = {
  hadir: { label: 'Hadir', tone: 'success' },
  hadir_terlambat: { label: 'Terlambat', tone: 'warning' },
  hadir_izin_terlambat: { label: 'Izin terlambat', tone: 'info' },
  izin: { label: 'Izin', tone: 'info' },
  sakit: { label: 'Sakit', tone: 'error' },
  alfa: { label: 'Alfa', tone: 'neutral' },
  libur: { label: 'Libur', tone: 'holiday' },
  libur_override: { label: 'Libur khusus', tone: 'holiday' },
  opsional: { label: 'Opsional', tone: 'neutral' },
}

export function AttendanceStatus({ status }: { status: string }) {
  const item = attendanceStatuses[status] || { label: status || 'Belum tercatat', tone: 'neutral' }
  return <span className={`attendance-badge attendance-badge-${item.tone}`}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />{item.label}</span>
}
