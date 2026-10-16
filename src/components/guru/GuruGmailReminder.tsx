import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { AppDialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { guruProfileAPI } from '../../services/api'
import { isGmailAddress } from '../../utils/email'

const ONE_HOUR_MS = 60 * 60 * 1000

function readDismissedUntil(key: string): number {
  if (!key) return 0
  try {
    const value = Number(window.localStorage.getItem(key))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function removeDismissedUntil(key: string) {
  if (!key) return
  try { window.localStorage.removeItem(key) } catch { /* local storage may be unavailable */ }
}

export default function GuruGmailReminder({ user, activeTab, blocked = false, onGmailStatusChange }: { user: any; activeTab: string; blocked?: boolean; onGmailStatusChange?: (complete: boolean) => void }) {
  const accountId = user?.id ?? user?.user_id ?? user?.username
  const storageKey = accountId ? `guru-gmail-reminder-dismissed-until:${accountId}` : ''
  const [profile, setProfile] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const timerRef = useRef<number | null>(null)
  const profileCheckRef = useRef(0)

  useEffect(() => {
    let active = true
    const checkId = ++profileCheckRef.current
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)

    const checkProfile = async () => {
      try {
        const response = await guruProfileAPI.getProfile()
        if (!active || checkId !== profileCheckRef.current) return
        const data = response.data || {}
        const currentEmail = String(data.email || '').trim()
        setProfile(data)
        setEmail(currentEmail)

        if (isGmailAddress(currentEmail)) {
          onGmailStatusChange?.(true)
          removeDismissedUntil(storageKey)
          setOpen(false)
          return
        }

        onGmailStatusChange?.(false)
        const dismissedUntil = readDismissedUntil(storageKey)
        if (dismissedUntil > Date.now()) {
          setOpen(false)
          timerRef.current = window.setTimeout(
            () => setRefreshVersion((version) => version + 1),
            dismissedUntil - Date.now(),
          )
          return
        }

        removeDismissedUntil(storageKey)
        setOpen(true)
      } catch {
        // Keep the dashboard available; the next tab change or page load retries.
      }
    }

    void checkProfile()
    return () => {
      active = false
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [storageKey, activeTab, refreshVersion, onGmailStatusChange])

  const dismiss = () => {
    const dismissedUntil = Date.now() + ONE_HOUR_MS
    if (storageKey) {
      try { window.localStorage.setItem(storageKey, String(dismissedUntil)) } catch { /* local storage may be unavailable */ }
    }
    setOpen(false)
    setError('')
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(
      () => setRefreshVersion((version) => version + 1),
      ONE_HOUR_MS,
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    const normalizedEmail = email.trim()
    if (!isGmailAddress(normalizedEmail)) {
      setError('Mohon gunakan alamat Gmail yang valid dan berakhiran @gmail.com.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await guruProfileAPI.updateProfile({
        email: normalizedEmail,
        noHP: profile?.noHP ?? profile?.no_hp ?? '',
        alamat: profile?.alamat ?? '',
      })
      profileCheckRef.current += 1
      removeDismissedUntil(storageKey)
      setProfile((current) => ({ ...current, email: normalizedEmail }))
      setEmail(normalizedEmail)
      onGmailStatusChange?.(true)
      setOpen(false)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    } catch (failure) {
      setError(failure?.message || 'Gmail belum berhasil disimpan. Silakan coba kembali.')
    } finally {
      setSaving(false)
    }
  }

  const gender = String(profile?.jenisKelamin ?? profile?.jenis_kelamin ?? user?.jenisKelamin ?? user?.jenis_kelamin ?? '').trim().toLowerCase()
  const honorific = gender === 'laki-laki' ? 'Ustadz' : gender === 'perempuan' ? 'Ustadzah' : 'Ustadz/Ustadzah'
  const name = String(profile?.nama || user?.nama || '').trim()
  const existingEmailNeedsReplacement = Boolean(email.trim() && !isGmailAddress(email))

  return (
    <AppDialog
      open={open && !blocked}
      onOpenChange={(nextOpen) => { if (!nextOpen && !saving) dismiss() }}
      title={`Mohon Lengkapi Gmail, ${honorific}`}
      description={`Assalamu’alaikum warahmatullahi wabarakatuh, ${honorific}${name ? ` ${name}` : ''}. Mohon berkenan melengkapi data email pada akun Presensi PKBM.`}
      busy={saving}
      className="sm:max-w-xl"
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-4 dark:border-blue-900/70 dark:from-sky-950/40 dark:via-card dark:to-indigo-950/30 sm:p-5">
          <div className="flex items-start gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Mail className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${existingEmailNeedsReplacement ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200'}`}>
                {existingEmailNeedsReplacement ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                {existingEmailNeedsReplacement ? 'Perlu diperbarui' : 'Data akun perlu dilengkapi'}
              </span>
              <h2 className="mt-2 text-base font-bold text-slate-950 dark:text-slate-50 sm:text-lg">Gunakan Gmail yang aktif</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Gmail membantu {honorific} masuk ke Presensi PKBM melalui Google. Email yang disimpan juga tercatat pada data guru dan dapat dilihat oleh admin.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex gap-3 rounded-xl border border-border bg-card p-3.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">Pakai alamat milik sendiri</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Pastikan Gmail masih aktif dan dapat dibuka.</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-xl border border-border bg-card p-3.5">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">Gunakan format Gmail</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Contoh: nama@gmail.com. Alamat lain tidak dapat disimpan.</p>
            </div>
          </div>
        </div>

        {existingEmailNeedsReplacement && (
          <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Alamat yang tersimpan saat ini bukan Gmail. Silakan ganti dengan alamat yang berakhiran <strong>@gmail.com</strong>.</p>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="guru-reminder-gmail" className="mb-1.5 block text-sm font-semibold text-foreground">Alamat Gmail</label>
            <input
              id="guru-reminder-gmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => { setEmail(event.target.value); setError('') }}
              placeholder="nama@gmail.com"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'guru-reminder-gmail-error' : 'guru-reminder-gmail-hint'}
              className="academy-input w-full rounded-xl border px-3.5 py-3 text-base shadow-sm transition focus-visible:ring-2 focus-visible:ring-blue-500"
              disabled={saving}
            />
            {error
              ? <p id="guru-reminder-gmail-error" role="alert" className="mt-1.5 text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
              : <p id="guru-reminder-gmail-hint" className="mt-1.5 text-xs text-muted-foreground">Contoh penulisan: nama@gmail.com</p>}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <p>Belum sempat mengisi? Pilih <strong className="font-semibold text-foreground">Nanti</strong> untuk menutup sementara. Pengingat akan muncul kembali dalam satu jam jika Gmail belum dilengkapi.</p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="sm:min-w-28" onClick={dismiss} disabled={saving}>Nanti</Button>
            <Button type="submit" className="sm:min-w-44" disabled={saving}>
              {saving ? <><Loader2 className="animate-spin" aria-hidden="true" />Menyimpan Gmail…</> : <><CheckCircle2 aria-hidden="true" />Simpan Gmail</>}
            </Button>
          </div>
        </form>
      </div>
    </AppDialog>
  )
}
