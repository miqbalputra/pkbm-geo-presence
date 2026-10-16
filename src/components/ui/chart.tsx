import * as React from 'react'
import * as RechartsPrimitive from 'recharts'
import { cn } from '../../lib/utils'

const THEMES = { light: '', dark: '.dark' } as const

export type ChartConfig = Record<string, {
  label?: React.ReactNode
  icon?: React.ComponentType
  color?: string
  theme?: Record<keyof typeof THEMES, string>
}>

type ChartContextProps = { config: ChartConfig }
const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error('useChart must be used within a <ChartContainer />')
  return context
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item && ('color' in item || 'theme' in item))
  if (!colorConfig.length) return null

  const css = Object.entries(THEMES)
    .map(([theme, prefix]) => {
      const rules = colorConfig.map(([key, item]) => {
        const color = 'theme' in item && item.theme?.[theme as keyof typeof THEMES] ? item.theme[theme as keyof typeof THEMES] : 'color' in item ? item.color : undefined
        const variable = key.replace(/[^a-zA-Z0-9_-]/g, '-')
        return color ? `  --color-${variable}: ${color};` : ''
      }).filter(Boolean).join('\n')
      return `${prefix ? `${prefix} ` : ''}[data-chart="${id}"] {\n${rules}\n}`
    }).join('\n')

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

export function ChartContainer({ id, className, children, config, ...props }: React.ComponentProps<'div'> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'] }) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div data-chart={chartId} className={cn('flex min-h-[220px] w-full justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke="#fff"]]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-pie-sector[stroke="#fff"]]:stroke-transparent [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_line]:stroke-border [&_.recharts-sector[stroke="#fff"]]:stroke-transparent [&_.recharts-sector]:outline-none', className)} {...props}>
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

export function ChartTooltip({ ...props }: React.ComponentProps<typeof RechartsPrimitive.Tooltip>) {
  return <RechartsPrimitive.Tooltip {...props} />
}

export function ChartTooltipContent({ active, payload, label, hideLabel = false, indicator = 'dot', className }: React.ComponentProps<'div'> & { active?: boolean; payload?: Array<{ name?: string; value?: React.ReactNode; dataKey?: string; color?: string; fill?: string }>; label?: React.ReactNode; hideLabel?: boolean; indicator?: 'dot' | 'line' | 'dashed' }) {
  const { config } = useChart()
  if (!active || !payload?.length) return null

  return (
    <div className={cn('grid min-w-[8rem] gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl', className)}>
      {!hideLabel && <div className="font-medium text-foreground">{label}</div>}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = String(item.dataKey || item.name || index)
          const itemConfig = config[key]
          const color = item.color || item.fill || ('color' in (itemConfig || {}) ? itemConfig?.color : undefined) || 'var(--color-primary)'
          return (
            <div key={`${key}-${index}`} className="flex w-full items-center gap-2">
              <span className={cn('shrink-0 rounded-[2px]', indicator === 'dot' && 'size-2', indicator === 'line' && 'h-2 w-0.5', indicator === 'dashed' && 'h-0 w-2 border-t-2 border-dashed')} style={{ backgroundColor: indicator === 'dashed' ? 'transparent' : color, borderColor: color }} />
              <span className="flex-1 text-muted-foreground">{itemConfig?.label || item.name || key}</span>
              <span className="font-mono font-medium tabular-nums text-foreground">{item.value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ChartLegend(props: any) {
  return <RechartsPrimitive.Legend {...props} />
}

export function ChartLegendContent({ payload, className }: { payload?: Array<{ value?: React.ReactNode; dataKey?: string; color?: string }>; className?: string }) {
  const { config } = useChart()
  if (!payload?.length) return null
  return <div className={cn('flex items-center justify-center gap-4 pt-3', className)}>{payload.map((item, index) => { const key = String(item.dataKey || item.value || index); return <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-[2px]" style={{ backgroundColor: item.color || ('color' in (config[key] || {}) ? config[key]?.color : undefined) || 'var(--color-primary)' }} />{('label' in (config[key] || {}) ? config[key]?.label : undefined) || item.value || key}</div> })}</div>
}
