import { Button } from '../ui/button'
import { AppDialog } from '../ui/dialog'
import { Sparkles } from 'lucide-react'
import type { AttendanceFeedback } from './attendance-feedback'

const toneStyles = {
  success: { icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', button: 'bg-emerald-600 hover:bg-emerald-700' },
  warning: { icon: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', button: 'bg-amber-600 hover:bg-amber-700' },
  error: { icon: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', button: 'bg-rose-600 hover:bg-rose-700' },
  info: { icon: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300', button: 'bg-blue-600 hover:bg-blue-700' },
}

export function AttendanceFeedbackDialog({ feedback, onClose }: { feedback: AttendanceFeedback | null; onClose: () => void }) {
  if (!feedback) return null

  const Icon = feedback.icon
  const styles = toneStyles[feedback.tone]
  const isCheckout = feedback.status === 'pulang'

  return (
    <AppDialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={feedback.title}
      description={feedback.message}
      fallbackFocusId="attendance-action-title"
    >
      <div className="space-y-5 text-center">
        {isCheckout ? <div className="relative mx-auto flex size-24 items-center justify-center rounded-3xl border-2 border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-400/30 dark:bg-emerald-500/10" aria-hidden="true">
          <Icon className="size-12 text-emerald-600 dark:text-emerald-300" strokeWidth={2.2} />
          <span className="absolute -right-2 -top-2 flex size-9 items-center justify-center rounded-full border-2 border-white bg-amber-100 text-amber-600 shadow-sm dark:border-slate-900 dark:bg-amber-400/20 dark:text-amber-300">
            <Sparkles className="size-5" strokeWidth={2.2} />
          </span>
        </div> : <span className={`mx-auto flex size-16 items-center justify-center rounded-full ${styles.icon}`} aria-hidden="true">
          <Icon className="size-8" strokeWidth={2} />
        </span>}
        <Button type="button" className={`w-full text-base ${styles.button} ${isCheckout ? 'font-semibold shadow-md' : ''}`} onClick={onClose}>Tutup</Button>
      </div>
    </AppDialog>
  )
}
