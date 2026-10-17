type TeacherSignature = {
  punyaTandaTangan?: boolean
  tandaTangan?: string | null
  tanda_tangan?: string | null
}

export function getTeacherSignature(guru: TeacherSignature): string {
  return (guru.tandaTangan || guru.tanda_tangan || '').trim()
}

export function hasTeacherSignature(guru: TeacherSignature): boolean {
  return guru.punyaTandaTangan ?? Boolean(getTeacherSignature(guru))
}
