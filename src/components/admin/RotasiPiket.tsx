import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Clock3, RotateCw, Users } from 'lucide-react'
import { PageHeader, Notice, PageLoading, EmptyState } from '../ui/page'
import { guruAPI, jadwalPiketAPI } from '../../services/api'

function RotasiPiket() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await jadwalPiketAPI.getRotation()
      setData(response.data || null)
    } catch (failure: any) {
      setError(failure.message || 'Rotasi piket belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const setGroup = async (teacher: any, group: string) => {
    if ((teacher.piket_group || '') === group || teacher.pokjar) return
    setSavingId(teacher.user_id)
    try {
      await guruAPI.update({ id: teacher.user_id, piketGroup: group })
      await load()
    } catch (failure: any) {
      setError(failure.message || `Grup piket ${teacher.nama} gagal disimpan.`)
    } finally {
      setSavingId(null)
    }
  }

  if (loading && !data) return <PageLoading />
  const config = data?.config || {}
  const today = data?.today || {}
  const teachers = (data?.guru || []).filter((teacher: any) => !teacher.pokjar)
  const assigned = data?.piket_today || []
  const week5Label = ({ all: 'Semua guru', none: 'Tidak ada', A: 'Grup A', B: 'Grup B' } as Record<string, string>)[config.piket_week5_mode] || 'Semua guru'
  const weeks = (value: string) => String(value || '').split(',').map((part) => part.trim()).filter(Boolean).map((week) => `Pekan ${week}`).join(', ') || 'Tidak ada'
  const groupCard = (group: 'A' | 'B', title: string, color: string) => {
    const members = teachers.filter((teacher: any) => teacher.piket_group === group)
    return <section className="rounded-xl border border-border bg-card p-4" key={group}><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{title}</h2><span className={`rounded-full px-2 py-1 text-xs ${color}`}>{members.length} guru</span></div>{members.length ? <ul className="space-y-2">{members.map((teacher: any) => <li key={teacher.user_id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-3"><span className="min-w-0"><span className="block truncate text-sm font-medium">{teacher.nama}</span><span className="block truncate text-xs text-muted-foreground">@{teacher.username}</span></span><div className="flex shrink-0 gap-1">{['A', 'B', ''].map((choice) => <button type="button" key={choice || 'none'} onClick={() => void setGroup(teacher, choice)} disabled={savingId === teacher.user_id} aria-pressed={(teacher.piket_group || '') === choice} className={`rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-border disabled:opacity-50 ${((teacher.piket_group || '') === choice) ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>{choice || '—'}</button>)}</div></li>)}</ul> : <EmptyState title="Belum ada guru" />}</section>
  }

  return <div className="space-y-5">
    <PageHeader title="Rotasi Piket Sabtu" description="Atur grup A/B dan pekan tugas guru PKBM. Guru Pokjar dikecualikan dari rotasi." />
    {error && <Notice onRetry={() => void load()}>{error}</Notice>}
    <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-semibold">Sabtu pekan ke-{today.week_of_month || '—'} · {config.piket_rotation_enabled === '1' ? `Piket grup ${(today.groups_piket || []).join(' & ') || 'tidak ada'}` : 'Rotasi nonaktif'}</h2><p className="mt-1 text-sm opacity-80">Pekan ke-5: {week5Label} · Masuk {config.piket_jam_masuk || '07:00'} · Pulang {config.piket_jam_pulang || '13:00'}</p></div><RotateCw className="ml-auto hidden h-5 w-5 sm:block" /></div></section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Rotasi aktif</p><p className="mt-1 font-semibold">{config.piket_rotation_enabled === '1' ? 'Ya' : 'Tidak'}</p></div><div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Grup A bertugas</p><p className="mt-1 font-semibold">{weeks(config.piket_group_a_weeks)}</p></div><div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Grup B bertugas</p><p className="mt-1 font-semibold">{weeks(config.piket_group_b_weeks)}</p></div></section>
    <div className="grid gap-3 lg:grid-cols-2">{groupCard('A', 'Grup A', 'bg-blue-50 text-blue-700')}{groupCard('B', 'Grup B', 'bg-violet-50 text-violet-700')}</div>
    <section className="rounded-xl border border-border bg-card p-4"><div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h2 className="font-semibold">Guru belum mendapat grup</h2></div>{teachers.filter((teacher: any) => teacher.piket_group !== 'A' && teacher.piket_group !== 'B').length === 0 ? <p className="text-sm text-muted-foreground">Semua guru non-Pokjar sudah ditugaskan.</p> : <div className="space-y-2">{teachers.filter((teacher: any) => teacher.piket_group !== 'A' && teacher.piket_group !== 'B').map((teacher: any) => <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-3" key={teacher.user_id}><span className="text-sm font-medium">{teacher.nama}</span><div className="flex gap-1">{['A', 'B'].map((group) => <button key={group} type="button" disabled={savingId === teacher.user_id} onClick={() => void setGroup(teacher, group)} className="rounded-md bg-background px-3 py-1 text-xs font-semibold ring-1 ring-border">{group}</button>)}</div></div>)}</div>}</section>
    <section className="rounded-xl border border-border bg-card p-4"><div className="mb-3 flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h2 className="font-semibold">Daftar piket pekan ini ({assigned.length})</h2></div>{assigned.length ? <div className="grid gap-2 sm:grid-cols-2">{assigned.map((teacher: any) => <div key={teacher.user_id} className="flex items-center justify-between rounded-lg bg-muted/50 p-3"><span className="text-sm font-medium">{teacher.nama}</span><span className="text-xs text-muted-foreground">Grup {teacher.piket_group} · {teacher.jam_piket}–{teacher.jam_pulang_piket}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Belum ada jadwal piket untuk pekan ini.</p>}</section>
  </div>
}

export default RotasiPiket
