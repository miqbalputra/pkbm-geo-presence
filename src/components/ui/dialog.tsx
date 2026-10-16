import { useRef, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

export function AppDialog({ open, onOpenChange, title, description, busy = false, dismissible = true, children, className, fallbackFocusId }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string;
  busy?: boolean; dismissible?: boolean; children: ReactNode; className?: string; fallbackFocusId?: string;
}) {
  const opener = useRef<HTMLElement | null>(null)
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!busy && dismissible) onOpenChange(next) }}>
    <Dialog.Portal><Dialog.Overlay className="ui-dialog-overlay" />
      <Dialog.Content className={cn('ui-dialog academy-dashboard', className)} aria-busy={busy}
        onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
        onCloseAutoFocus={(event) => {
          const target = opener.current?.isConnected ? opener.current : fallbackFocusId ? document.getElementById(fallbackFocusId) : null
          if (target instanceof HTMLElement) { event.preventDefault(); target.focus() }
        }}
        onEscapeKeyDown={(event) => { if (busy || !dismissible) event.preventDefault() }}
        onPointerDownOutside={(event) => event.preventDefault()}>
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div><Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
            {description ? <Dialog.Description className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          </div>
          {dismissible && <Dialog.Close disabled={busy} aria-label="Tutup dialog" className="ui-icon-button"><X className="h-5 w-5" /></Dialog.Close>}
        </div>
        <div className="ui-dialog-body p-5">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
