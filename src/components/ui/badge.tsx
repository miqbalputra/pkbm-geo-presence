import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva('inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
      success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
      warning: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
      danger: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
      neutral: 'bg-muted text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
