import type { Theme } from '@prompttoppt/validation'

type ChartProps = { chartType: 'bar' | 'line' | 'pie' | 'doughnut'; labels: string[]; series: { name: string; values: number[] }[]; unit?: string | undefined; width: number; height: number; theme: Theme }

/** Minimal SVG charts (read-only, themed). Rich chart editing/export arrives in Phase 3–4. */
export function Chart({ chartType, labels, series, unit, width: W, height: H, theme }: ChartProps) {
  const palette = [theme.colors.primary, theme.colors.accent, theme.colors.secondary, theme.colors.textSecondary]
  const text = theme.colors.textSecondary
  const font = { fontFamily: theme.fonts.body, fontSize: 24, fill: text }

  if (chartType === 'pie' || chartType === 'doughnut') {
    const values = series[0]!.values.slice(0, labels.length)
    const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1
    const r = Math.min(W * 0.4, H * 0.45)
    const cx = r + 20
    const cy = H / 2
    const bounds = values.reduce<number[]>((acc, v) => [...acc, acc[acc.length - 1]! + (Math.max(0, v) / total) * Math.PI * 2], [-Math.PI / 2])
    return (
      <svg width={W} height={H}>
        {values.map((v, i) => {
          void v
          const a0 = bounds[i]!
          const a1 = bounds[i + 1]!
          const large = a1 - a0 > Math.PI ? 1 : 0
          const p = (a: number, rad: number) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`
          const hole = chartType === 'doughnut' ? r * 0.55 : 0
          const d = `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, hole)} ${hole ? `A ${hole} ${hole} 0 ${large} 0 ${p(a0, hole)}` : ''} Z`
          return <path key={i} d={d} fill={palette[i % palette.length]} stroke={theme.colors.background} strokeWidth={4} />
        })}
        {labels.slice(0, values.length).map((l, i) => (
          <g key={l + i} transform={`translate(${cx * 2 + 30}, ${60 + i * 44})`}>
            <rect width={22} height={22} rx={4} fill={palette[i % palette.length]} />
            <text x={34} y={19} {...font}>{`${l} (${values[i]}${unit ?? ''})`}</text>
          </g>
        ))}
      </svg>
    )
  }

  const pad = { l: 70, r: 20, t: 20, b: 60 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const max = Math.max(1, ...series.flatMap((s) => s.values)) * 1.1
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const gw = iw / labels.length
  return (
    <svg width={W} height={H}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} stroke={theme.colors.textSecondary} strokeOpacity={0.2} />
          <text x={pad.l - 10} y={y(max * t) + 8} textAnchor="end" {...font}>{Math.round(max * t)}</text>
        </g>
      ))}
      {labels.map((l, i) => <text key={l + i} x={pad.l + gw * i + gw / 2} y={H - 20} textAnchor="middle" {...font}>{l}</text>)}
      {chartType === 'bar'
        ? series.map((s, si) => {
            const bw = (gw * 0.7) / series.length
            return s.values.slice(0, labels.length).map((v, i) => (
              <rect key={`${si}-${i}`} x={pad.l + gw * i + gw * 0.15 + bw * si} y={y(v)} width={bw - 4} height={pad.t + ih - y(v)} rx={4} fill={palette[si % palette.length]} />
            ))
          })
        : series.map((s, si) => (
            <polyline key={si} fill="none" stroke={palette[si % palette.length]} strokeWidth={5} points={s.values.slice(0, labels.length).map((v, i) => `${pad.l + gw * i + gw / 2},${y(v)}`).join(' ')} />
          ))}
    </svg>
  )
}
