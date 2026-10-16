import type { ReactNode } from 'react'
import { AlertCircle, Inbox, RefreshCw, X } from 'lucide-react'
import { Button } from './button'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div className="min-w-0"><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</div>
}

export function Notice({ children, tone = 'error', onRetry, onDismiss }: { children: ReactNode; tone?: string; onRetry?: () => void; onDismiss?: () => void }) {
  return <div className={`ui-notice ui-notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1 whitespace-pre-line">{children}{onRetry && <Button type="button" variant="outline" className="mt-3 flex" onClick={onRetry}><RefreshCw aria-hidden="true" />Coba lagi</Button>}</div>
    {onDismiss && <Button type="button" size="icon" variant="ghost" aria-label="Tutup pesan" onClick={onDismiss}><X aria-hidden="true" /></Button>}
  </div>
}

export function EmptyState({ title = 'Belum ada data', description }: { title?: string; description?: string }) {
  return <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-muted-foreground"><Inbox className="mb-2 h-8 w-8" aria-hidden="true" /><p className="font-semibold text-foreground">{title}</p>{description && <p className="max-w-md text-sm">{description}</p>}</div>
}

export function PageLoading() {
  return <div className="space-y-4" role="status" aria-label="Memuat data"><div className="h-8 w-48 animate-pulse rounded-lg bg-muted" /><div className="h-40 animate-pulse rounded-xl bg-muted" /><span className="sr-only">Memuat data...</span></div>
}
