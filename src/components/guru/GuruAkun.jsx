import { useState, useEffect, useRef } from 'react'
import { User, Mail, Phone, MapPin, Save, Loader2, ShieldCheck, Hash, BadgeCheck, Lock, KeyRound, Eye, EyeOff, CheckCircle2, Trash2, Eraser, FileSignature, PenLine } from 'lucide-react'
import { guruProfileAPI } from '../../services/api'

function GuruAkun({ user }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ email: '', noHP: '', alamat: '' })
  const [original, setOriginal] = useState({ email: '', noHP: '', alamat: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [errors, setErrors] = useState({})

  // State untuk ganti password
  const [pwForm, setPwForm] = useState({ passwordLama: '', passwordBaru: '', konfirmasiBaru: '' })
  const [pwErrors, setPwErrors] = useState({})
  const [showPw, setShowPw] = useState({ lama: false, baru: false, konfirmasi: false })
  const [savingPw, setSavingPw] = useState(false)
  const [pwMessage, setPwMessage] = useState({ type: '', text: '' })

  // State untuk tanda tangan digital
  const [tandaTangan, setTandaTangan] = useState(null)
  const [punyaTandaTangan, setPunyaTandaTangan] = useState(false)
  const [savingSignature, setSavingSignature] = useState(false)
  const [signAction, setSignAction] = useState(null) // 'save' | 'delete' | null
  const [hasDrawn, setHasDrawn] = useState(false)
  const [signatureMessage, setSignatureMessage] = useState({ type: '', text: '' })

  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPosRef = useRef(null)
  const hasDrawnRef = useRef(false)

  // Muat profil guru saat komponen pertama kali dirender
  useEffect(() => {
    let cancelled = false
    const loadProfile = async () => {
      setLoading(true)
      try {
        const res = await guruProfileAPI.getProfile()
        if (cancelled) return
        const data = res.data || {}
        const filled = {
          email: data.email || '',
          noHP: data.noHP || data.no_hp || '',
          alamat: data.alamat || '',
        }
        setProfile(data)
        setForm(filled)
        setOriginal(filled)
        setTandaTangan(data.tandaTangan || null)
        setPunyaTandaTangan(!!data.punyaTandaTangan)
      } catch (err) {
        if (!cancelled) {
          // Fallback: gunakan data dari props user bila API gagal
          const filled = {
            email: user?.email || '',
            noHP: user?.noHP || user?.no_hp || '',
            alamat: user?.alamat || '',
          }
          setProfile({
            id: user?.id,
            idGuru: user?.idGuru || user?.id_guru,
            username: user?.username,
            nama: user?.nama,
            googleLinked: !!user?.googleId,
            ...filled,
          })
          setForm(filled)
          setOriginal(filled)
          setTandaTangan(null)
          setPunyaTandaTangan(false)
          setMessage({ type: 'error', text: 'Gagal memuat data profil: ' + err.message })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadProfile()
    return () => { cancelled = true }
  }, [])

  const handleChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
    setMessage({ type: '', text: '' })
  }

  const validate = () => {
    const errs = {}
    const email = form.email.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Format email tidak valid.'
    }
    if (form.noHP && form.noHP.length > 20) {
      errs.noHP = 'Nomor HP maksimal 20 karakter.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const hasChanges = () => {
    return (
      form.email.trim() !== original.email ||
      form.noHP.trim() !== original.noHP ||
      form.alamat.trim() !== original.alamat
    )
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    if (!validate()) return

    setSaving(true)
    try {
      const res = await guruProfileAPI.updateProfile({
        email: form.email.trim(),
        noHP: form.noHP.trim(),
        alamat: form.alamat.trim(),
      })
      const data = res.data || {}
      const filled = {
        email: data.email || '',
        noHP: data.noHP || data.no_hp || '',
        alamat: data.alamat || '',
      }
      setProfile(prev => ({ ...prev, ...data }))
      setForm(filled)
      setOriginal(filled)
      setMessage({ type: 'success', text: res.message || 'Profil berhasil diperbarui.' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal memperbarui profil: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  // --- Ganti password ---
  const handlePwChange = (field) => (e) => {
    setPwForm(prev => ({ ...prev, [field]: e.target.value }))
    setPwErrors(prev => ({ ...prev, [field]: '' }))
    setPwMessage({ type: '', text: '' })
  }

  const validatePassword = () => {
    const errs = {}
    if (!pwForm.passwordLama) errs.passwordLama = 'Password lama harus diisi.'
    if (!pwForm.passwordBaru) {
      errs.passwordBaru = 'Password baru harus diisi.'
    } else if (pwForm.passwordBaru.length < 6) {
      errs.passwordBaru = 'Password baru minimal 6 karakter.'
    }
    if (!pwForm.konfirmasiBaru) {
      errs.konfirmasiBaru = 'Konfirmasi password harus diisi.'
    } else if (pwForm.passwordBaru !== pwForm.konfirmasiBaru) {
      errs.konfirmasiBaru = 'Konfirmasi password tidak cocok.'
    } else if (pwForm.passwordBaru && pwForm.passwordBaru === pwForm.passwordLama) {
      errs.passwordBaru = 'Password baru tidak boleh sama dengan password lama.'
    }
    setPwErrors(errs)
    return Object.keys(errs).length === 0
  }

  const hasPwChanges = () =>
    !!pwForm.passwordLama || !!pwForm.passwordBaru || !!pwForm.konfirmasiBaru

  const handleSavePassword = async (e) => {
    e.preventDefault()
    setPwMessage({ type: '', text: '' })

    if (!validatePassword()) return

    setSavingPw(true)
    try {
      const res = await guruProfileAPI.changePassword({
        passwordLama: pwForm.passwordLama,
        passwordBaru: pwForm.passwordBaru,
        konfirmasiBaru: pwForm.konfirmasiBaru,
      })
      setPwMessage({ type: 'success', text: res.message || 'Password berhasil diubah.' })
      setPwForm({ passwordLama: '', passwordBaru: '', konfirmasiBaru: '' })
    } catch (err) {
      setPwMessage({ type: 'error', text: 'Gagal mengubah password: ' + err.message })
    } finally {
      setSavingPw(false)
    }
  }

  const togglePw = (field) => () => {
    setShowPw(prev => ({ ...prev, [field]: !prev[field] }))
  }

  // --- Tanda tangan digital ---
  // Siapkan canvas (DPR + ukuran responsif) setelah profil selesai dimuat.
  useEffect(() => {
    if (loading) return
    const canvas = canvasRef.current
    if (!canvas) return

    const setupCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const cssWidth = rect.width || canvas.clientWidth || 300
      const cssHeight = 200
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
      canvas.style.height = cssHeight + 'px'
      const ctx = canvas.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0) // reset sebelum scale ulang
      ctx.scale(dpr, dpr)
      ctx.strokeStyle = '#1e293b' // slate-800
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }

    setupCanvas()
    const onResize = () => {
      // Ukuran berubah -> reset konteks (gambar tidak dipertahankan saat resize).
      hasDrawnRef.current = false
      setHasDrawn(false)
      setupCanvas()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [loading])

  const getPointerPos = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    drawingRef.current = true
    const pos = getPointerPos(e)
    lastPosRef.current = pos
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    // titik awal: gambar setitik agar klik tunggal tetap meninggalkan tanda
    ctx.lineTo(pos.x + 0.1, pos.y + 0.1)
    ctx.stroke()
    if (!hasDrawnRef.current) {
      hasDrawnRef.current = true
      setHasDrawn(true)
    }
  }

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pos = getPointerPos(e)
    const last = lastPosRef.current || pos
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPosRef.current = pos
  }

  const handlePointerUp = () => {
    drawingRef.current = false
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasDrawnRef.current = false
    setHasDrawn(false)
  }

  const handleSaveSignature = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!hasDrawn) {
      setSignatureMessage({ type: 'error', text: 'Tanda tangan masih kosong. Silakan gambar terlebih dahulu.' })
      return
    }
    setSignatureMessage({ type: '', text: '' })
    setSavingSignature(true)
    setSignAction('save')
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const res = await guruProfileAPI.saveSignature(dataUrl)
      const data = res.data || {}
      setTandaTangan(data.tandaTangan || null)
      setPunyaTandaTangan(!!data.punyaTandaTangan)
      clearCanvas()
      setSignatureMessage({ type: 'success', text: res.message || 'Tanda tangan berhasil disimpan.' })
    } catch (err) {
      setSignatureMessage({ type: 'error', text: 'Gagal menyimpan tanda tangan: ' + err.message })
    } finally {
      setSavingSignature(false)
      setSignAction(null)
    }
  }

  const handleDeleteSignature = async () => {
    setSignatureMessage({ type: '', text: '' })
    setSavingSignature(true)
    setSignAction('delete')
    try {
      const res = await guruProfileAPI.saveSignature('')
      const data = res.data || {}
      setTandaTangan(data.tandaTangan || null)
      setPunyaTandaTangan(!!data.punyaTandaTangan)
      clearCanvas()
      setSignatureMessage({ type: 'success', text: res.message || 'Tanda tangan berhasil dihapus.' })
    } catch (err) {
      setSignatureMessage({ type: 'error', text: 'Gagal menghapus tanda tangan: ' + err.message })
    } finally {
      setSavingSignature(false)
      setSignAction(null)
    }
  }

  const handleClearCanvas = () => {
    clearCanvas()
    setSignatureMessage({ type: '', text: '' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[260px]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Header kartu identitas (read-only) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-5 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-2xl" />
        <div className="flex items-center gap-3 pl-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-md shrink-0">
            {(profile?.nama || user?.nama || 'G').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-widest">Akun Guru</p>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight truncate">
              {profile?.nama || user?.nama || 'Guru'}
            </h2>
          </div>
        </div>

        <div className="mt-4 pl-2 space-y-2.5">
          <InfoRow icon={Hash} label="ID Guru" value={profile?.idGuru || profile?.id_guru || '-'} />
          <InfoRow icon={User} label="Username" value={profile?.username || user?.username || '-'} />
          <InfoRow icon={BadgeCheck} label="Role" value="Guru" />
          {/* Indikator login Google */}
          <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium">
              <GoogleG className="w-3.5 h-3.5" /> Login Google
            </span>
            {profile?.googleLinked ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Terhubung
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Belum terhubung</span>
            )}
          </div>
        </div>
      </div>

      {/* Form edit profil */}
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-5 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Informasi Akun</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Data berikut akan otomatis tersimpan ke database utama Guru.
          </p>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
            <Mail className="w-3.5 h-3.5" /> Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange('email')}
            placeholder="contoh@email.com"
            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-800/60 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors ${
              errors.email ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700'
            }`}
          />
          {errors.email && <p className="text-xs text-rose-500 mt-1">{errors.email}</p>}
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            ⓘ Email yang sama dipakai untuk login Google. Pastikan email valid.
          </p>
        </div>

        {/* No HP */}
        <div>
          <label htmlFor="noHP" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
            <Phone className="w-3.5 h-3.5" /> No. HP
          </label>
          <input
            id="noHP"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.noHP}
            onChange={handleChange('noHP')}
            placeholder="08xxxxxxxxxx"
            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-800/60 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors ${
              errors.noHP ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700'
            }`}
          />
          {errors.noHP && <p className="text-xs text-rose-500 mt-1">{errors.noHP}</p>}
        </div>

        {/* Alamat */}
        <div>
          <label htmlFor="alamat" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
            <MapPin className="w-3.5 h-3.5" /> Alamat
          </label>
          <textarea
            id="alamat"
            value={form.alamat}
            onChange={handleChange('alamat')}
            placeholder="Jl. Contoh No. 123, Kota..."
            rows={3}
            className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-800/60 placeholder:text-slate-300 dark:placeholder:text-slate-600 resize-none transition-colors"
          />
        </div>

        {/* Message */}
        {message.text && (
          <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20'
              : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20'
          }`}>
            {message.type === 'success' ? <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> : null}
            <span className="whitespace-pre-line">{message.text}</span>
          </div>
        )}

        {/* Tombol simpan */}
        <button
          type="submit"
          disabled={saving || !hasChanges()}
          className="w-full bg-indigo-600 dark:bg-indigo-500 text-white py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm hover:bg-indigo-700 dark:hover:bg-indigo-400 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
          ) : (
            <><Save className="w-4 h-4" /> Simpan Perubahan</>
          )}
        </button>
        {!hasChanges() && !saving && (
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Belum ada perubahan yang perlu disimpan.
          </p>
        )}
      </form>

      {/* Form ganti password */}
      <form onSubmit={handleSavePassword} className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-5 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-indigo-500" /> Keamanan Akun
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Ubah password Anda untuk menjaga keamanan akun.
          </p>
        </div>

        {/* Password lama */}
        <div>
          <label htmlFor="passwordLama" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
            <Lock className="w-3.5 h-3.5" /> Password Lama
          </label>
          <div className="relative">
            <input
              id="passwordLama"
              type={showPw.lama ? 'text' : 'password'}
              value={pwForm.passwordLama}
              onChange={handlePwChange('passwordLama')}
              autoComplete="current-password"
              placeholder="Masukkan password lama"
              className={`w-full px-4 py-3 pr-11 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-800/60 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors ${
                pwErrors.passwordLama ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            <button type="button" onClick={togglePw('lama')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              {showPw.lama ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {pwErrors.passwordLama && <p className="text-xs text-rose-500 mt-1">{pwErrors.passwordLama}</p>}
        </div>

        {/* Password baru */}
        <div>
          <label htmlFor="passwordBaru" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
            <KeyRound className="w-3.5 h-3.5" /> Password Baru
          </label>
          <div className="relative">
            <input
              id="passwordBaru"
              type={showPw.baru ? 'text' : 'password'}
              value={pwForm.passwordBaru}
              onChange={handlePwChange('passwordBaru')}
              autoComplete="new-password"
              placeholder="Minimal 6 karakter"
              className={`w-full px-4 py-3 pr-11 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-800/60 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors ${
                pwErrors.passwordBaru ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            <button type="button" onClick={togglePw('baru')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              {showPw.baru ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {pwErrors.passwordBaru && <p className="text-xs text-rose-500 mt-1">{pwErrors.passwordBaru}</p>}
        </div>

        {/* Konfirmasi password baru */}
        <div>
          <label htmlFor="konfirmasiBaru" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ulangi Password Baru
          </label>
          <div className="relative">
            <input
              id="konfirmasiBaru"
              type={showPw.konfirmasi ? 'text' : 'password'}
              value={pwForm.konfirmasiBaru}
              onChange={handlePwChange('konfirmasiBaru')}
              autoComplete="new-password"
              placeholder="Ketik ulang password baru"
              className={`w-full px-4 py-3 pr-11 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-800/60 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors ${
                pwErrors.konfirmasiBaru ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            <button type="button" onClick={togglePw('konfirmasi')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              {showPw.konfirmasi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {pwErrors.konfirmasiBaru && <p className="text-xs text-rose-500 mt-1">{pwErrors.konfirmasiBaru}</p>}
        </div>

        {/* Message password */}
        {pwMessage.text && (
          <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-medium ${
            pwMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20'
              : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20'
          }`}>
            {pwMessage.type === 'success' ? <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> : null}
            <span className="whitespace-pre-line">{pwMessage.text}</span>
          </div>
        )}

        {/* Tombol simpan password */}
        <button
          type="submit"
          disabled={savingPw || !hasPwChanges()}
          className="w-full bg-slate-900 dark:bg-indigo-500 text-white py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm hover:bg-slate-800 dark:hover:bg-indigo-400 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
        >
          {savingPw ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Mengubah...</>
          ) : (
            <><KeyRound className="w-4 h-4" /> Ubah Password</>
          )}
        </button>
      </form>

      {/* Kartu tanda tangan digital */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-5 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <FileSignature className="w-4 h-4 text-indigo-500" /> Tanda Tangan Digital
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Tanda tangan disimpan sekali di akun Anda dan dapat dilihat admin sebagai bukti. Presensi Hadir tidak memerlukan tanda tangan ulang.
          </p>
        </div>

        {/* Preview tanda tangan yang sudah tersimpan */}
        {punyaTandaTangan && tandaTangan ? (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/10 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Tersimpan</span>
            </div>
            <img
              src={tandaTangan}
              alt="Tanda tangan tersimpan"
              className="max-h-24 w-full object-contain bg-white dark:bg-slate-50 rounded-lg border border-slate-100 dark:border-slate-800 p-2"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center text-xs text-slate-400 dark:text-slate-500">
            Belum ada tanda tangan tersimpan.
          </div>
        )}

        {/* Canvas menggambar */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
            <PenLine className="w-3.5 h-3.5" /> Gambar Tanda Tangan
          </label>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onTouchStart={(e) => e.preventDefault()}
            onTouchMove={(e) => e.preventDefault()}
            style={{ touchAction: 'none', height: 200 }}
            className="w-full bg-white dark:bg-slate-50 rounded-xl border border-slate-200 dark:border-slate-700 cursor-crosshair touch-none"
          />
        </div>

        {/* Pesan */}
        {signatureMessage.text && (
          <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-medium ${
            signatureMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20'
              : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20'
          }`}>
            {signatureMessage.type === 'success' ? <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> : null}
            <span className="whitespace-pre-line">{signatureMessage.text}</span>
          </div>
        )}

        {/* Tombol aksi */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleSaveSignature}
            disabled={savingSignature || !hasDrawn}
            className="bg-indigo-600 dark:bg-indigo-500 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 shadow-sm hover:bg-indigo-700 dark:hover:bg-indigo-400 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
          >
            {signAction === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
          </button>
          <button
            type="button"
            onClick={handleClearCanvas}
            disabled={savingSignature}
            className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Eraser className="w-4 h-4" /> Bersihkan
          </button>
          <button
            type="button"
            onClick={handleDeleteSignature}
            disabled={savingSignature || !punyaTandaTangan}
            className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-rose-100 dark:hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {signAction === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Hapus
          </button>
        </div>
      </div>
    </div>
  )
}

// Ikon "G" Google sederhana (inline SVG agar tidak butuh dependency tambahan)
function GoogleG({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-right ml-2 break-all">{value}</span>
    </div>
  )
}

export default GuruAkun