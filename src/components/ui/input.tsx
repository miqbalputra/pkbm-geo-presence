import * as React from 'react'
import { cn } from '../../lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn('flex min-h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50', className)}
    ref={ref}
    {...props}
  />
))
Input.displayName = 'Input'
