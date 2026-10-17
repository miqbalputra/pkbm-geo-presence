import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { AppDialog } from '../ui/dialog'
import { Notice } from '../ui/page'
import { guruAPI } from '../../services/api'
import { getTeacherSignature } from '../../utils/teacherSignature'

export default function TeacherSignaturePreview({ guru, onClose, onStatusLoaded }: {
  guru: { id: number; nama: string; idGuru?: string }
  onClose: () => void
  onStatusLoaded: (id: number, hasSignature: boolean) => void
}) {
  const [image, setImage] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setImage('')
    guruAPI.getById(guru.id)
      .then((response) => {
        if (cancelled) return
        const signature = getTeacherSignature(response.data || {})
        onStatusLoaded(guru.id, Boolean(signature))
        if (signature && !signature.startsWith('data:image/png;base64,')) {
          setError('Format gambar tanda tangan belum dapat ditampilkan.')
          return
        }
        setImage(signature)
      })
      .catch(() => {
        if (!cancelled) setError('Tanda tangan belum dapat dimuat. Silakan coba lagi.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [guru.id, revision, onStatusLoaded])

  return (
    <AppDialog open onOpenChange={(open) => { if (!open) onClose() }} title="Tanda Tangan Guru"
      description={`${guru.nama}${guru.idGuru ? ` · ${guru.idGuru}` : ''}`}>
      {loading ? (
        <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Memuat tanda tangan...
        </div>
      ) : error ? (
        <Notice onRetry={() => setRevision((value) => value + 1)}>{error}</Notice>
      ) : image ? (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Sudah membuat tanda tangan</p>
          <img src={image} alt={`Tanda tangan ${guru.nama}`} onError={() => setError('Gambar tanda tangan tidak dapat ditampilkan. Silakan coba lagi.')}
            className="max-h-64 min-h-40 w-full rounded-xl border border-border bg-white object-contain p-4" />
          <a href={image} download={`tanda-tangan-${guru.idGuru || guru.id}.png`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <Download className="h-4 w-4" aria-hidden="true" />Unduh PNG
          </a>
        </div>
      ) : (
        <p role="status" className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Guru ini belum memiliki tanda tangan tersimpan. Guru dapat membuatnya melalui menu Akun.
        </p>
      )}
    </AppDialog>
  )
}
