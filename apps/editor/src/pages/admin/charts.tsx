import { compact } from '@/lib/format'

export const SERIES_COLORS = { input: '#0B3DD0', output: '#FF5722', reasoning: '#7C3AED', cached: '#94A3B8' } as const

interface Point { t: string; input: number; output: number; reasoning: number }

/** Stacked token columns over time (input / output / reasoning). Accessible: values in <title>, summary in aria-label. */
export function TokenBars({ points, bucket }: { points: Point[]; bucket: string }) {
  const W = 900, H = 260, pad = { l: 56, r: 12, t: 12, b: 28 }
  if (points.length === 0) return <Empty />
  const max = Math.max(1, ...points.map((p) => p.input + p.output + p.reasoning))
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b
  const bw = Math.min(48, (iw / points.length) * 0.7)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const label = (t: string) => new Date(t).toLocaleDateString(undefined, bucket === 'hour' ? { hour: 'numeric' } : { month: 'short', day: 'numeric' })
  const every = Math.ceil(points.length / 10)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Token usage per ${bucket}, ${points.length} periods`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="#E2E8F0" />
          <text x={pad.l - 8} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#64748B">{compact(max * f)}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const x = pad.l + (iw / points.length) * i + (iw / points.length - bw) / 2
        let base = 0
        return (
          <g key={p.t}>
            <title>{`${label(p.t)} — input ${compact(p.input)}, output ${compact(p.output)}, reasoning ${compact(p.reasoning)}`}</title>
            {(['input', 'output', 'reasoning'] as const).map((k) => {
              const h = (p[k] / max) * ih
              const r = <rect key={k} x={x} y={y(base + p[k])} width={bw} height={h} fill={SERIES_COLORS[k]} />
              base += p[k]
              return r
            })}
            {i % every === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748B">{label(p.t)}</text>}
          </g>
        )
      })}
    </svg>
  )
}

export function Legend() {
  return (
    <div className="flex gap-4 text-xs text-slate-600">
      {(['input', 'output', 'reasoning'] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: SERIES_COLORS[k] }} />{k}</span>
      ))}
    </div>
  )
}

/** Horizontal share bars for "top N" lists. */
export function ShareBars({ rows, format }: { rows: { key: string; label: string; value: number }[]; format: (n: number) => string }) {
  if (rows.length === 0) return <Empty />
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="flex justify-between gap-3"><span className="truncate" title={r.label}>{r.label}</span><span className="tabular-nums text-slate-600">{format(r.value)}</span></div>
          <div className="h-2 rounded-full bg-slate-100 mt-1"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

export const Empty = () => <p className="py-10 text-center text-sm text-slate-500">No usage in this range.</p>
