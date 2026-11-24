import { canStack, chartColor, chartInk, chartPalette, chartShowsFigures, legendPlace, highlightText, linearFitXY, linearTrend, scatterXs, stackLayout, type ChartType, type LegendPlace, type Theme } from '@prompttoppt/validation'

type ChartProps = {
  chartType: ChartType; labels: string[]; series: { name: string; values: number[] }[]; unit?: string | undefined; width: number; height: number; theme: Theme
  /** the editor's own choices (see packages/validation/src/chart-style.ts) */
  colors?: string[] | undefined; legend?: LegendPlace | undefined; trendline?: boolean | undefined; dataLabels?: boolean | undefined
  /** the colours the chart sits on (chart-style.ts slideBackdrop): its colours and words are chosen to show on them */
  backdrop?: readonly string[] | undefined
  /** bars on top of each other, or as shares of 100% (bar charts with two series or more) */
  stack?: 'stacked' | 'percent' | undefined
}

/** legend entries laid out in rows that fit `maxWidth` (each entry: a swatch and its text) */
function legendRows(items: string[], maxWidth: number, charW = 13): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  let x = 0, y = 0
  for (const t of items) {
    const w = 34 + t.length * charW + 24
    if (x > 0 && x + w > maxWidth) { x = 0; y += 38 }
    out.push({ x, y })
    x += w
  }
  return out
}

/** SVG charts (themed): the colour of each series or slice, the legend, a trend line and the figures on the marks are the person's choices (chart-style.ts), the rest follows the deck. */
export function Chart({ chartType, labels, series, unit, width: W, height: H, theme, colors, legend, trendline, dataLabels: figures, stack, backdrop: given }: ChartProps) {
  const dataLabels = chartShowsFigures({ dataLabels: figures, chartType, labels })
  const backdrop = given ?? [theme.colors.background]
  const deck = chartPalette(theme.colors, backdrop)
  const color = (i: number) => chartColor(colors, i, deck)
  const text = chartInk(theme.colors, backdrop)
  const font = { fontFamily: theme.fonts.body, fontSize: 24, fill: text }
  const circular = chartType === 'pie' || chartType === 'doughnut'
  const place = legendPlace({ legend, circular, series: series.length })
  const fmt = (v: number) => `${Math.round(v * 100) / 100}${unit ?? ''}`

  if (circular) {
    const values = series[0]!.values.slice(0, labels.length)
    const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1
    const entries = labels.slice(0, values.length).map((l, i) => `${l} (${fmt(values[i]!)})`)
    const rows = place === 'bottom' ? legendRows(entries, W - 40) : []
    const legendH = rows.length ? rows.at(-1)!.y + 38 : 0
    const r = Math.min(place === 'right' ? W * 0.4 : W * 0.45, (H - legendH - 20) * 0.5)
    const cx = place === 'right' ? r + 20 : W / 2
    const cy = (H - legendH) / 2
    const bounds = values.reduce<number[]>((acc, v) => [...acc, acc[acc.length - 1]! + (Math.max(0, v) / total) * Math.PI * 2], [-Math.PI / 2])
    return (
      <svg width={W} height={H}>
        {values.map((v, i) => {
          const a0 = bounds[i]!
          const a1 = bounds[i + 1]!
          const large = a1 - a0 > Math.PI ? 1 : 0
          const p = (a: number, rad: number) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`
          const hole = chartType === 'doughnut' ? r * 0.55 : 0
          const d = `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, hole)} ${hole ? `A ${hole} ${hole} 0 ${large} 0 ${p(a0, hole)}` : ''} Z`
          const mid = (a0 + a1) / 2, lr = hole ? (r + hole) / 2 : r * 0.62
          return (
            <g key={i}>
              <path d={d} fill={color(i)} stroke={backdrop[0]} strokeWidth={4} />
              {dataLabels && v > 0 && a1 - a0 > 0.25 && <text x={cx + lr * Math.cos(mid)} y={cy + lr * Math.sin(mid) + 8} textAnchor="middle" {...font} fill={theme.colors.onPrimary}>{fmt(v)}</text>}
            </g>
          )
        })}
        {place === 'right' && entries.map((t, i) => (
          <g key={t + i} transform={`translate(${cx * 2 + 30}, ${60 + i * 44})`}>
            <rect width={22} height={22} rx={4} fill={color(i)} />
            <text x={34} y={19} {...font}>{t}</text>
          </g>
        ))}
        {place === 'bottom' && entries.map((t, i) => (
          <g key={t + i} transform={`translate(${20 + rows[i]!.x}, ${H - legendH + rows[i]!.y})`}>
            <rect width={22} height={22} rx={4} fill={color(i)} />
            <text x={34} y={19} {...font}>{t}</text>
          </g>
        ))}
      </svg>
    )
  }

  const names = series.map((s) => s.name || 'Series')
  const rightW = place === 'right' ? Math.min(W * 0.35, 60 + Math.max(...names.map((n) => n.length)) * 13) : 0
  const rows = place === 'bottom' ? legendRows(names, W - 100) : []
  const bottomH = rows.length ? rows.at(-1)!.y + 44 : 0
  const pad = { l: 70, r: 20 + rightW, t: 20 + (dataLabels ? 22 : 0), b: 60 + bottomH }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  // stacked bars (chart-style.ts): the scale fits the biggest total, or 0-100 for shares
  const stacked = stack && canStack({ chartType, series }) ? stackLayout(series, labels.length, stack) : null
  const max = stacked ? stacked.max : Math.max(1, ...series.flatMap((s) => s.values)) * 1.1
  const axisFmt = (v: number) => (stack === 'percent' && stacked ? `${Math.round(v)}%` : `${Math.round(v)}`)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const gw = iw / labels.length
  // a scatter's x axis is numeric (its labels read as numbers: chart-style.ts scatterXs); labels that are not numbers draw it as a line chart instead
  const xs = chartType === 'scatter' ? scatterXs(labels) : null
  const xLo = xs ? Math.min(...xs) : 0, xHi = xs ? Math.max(...xs) : 1
  const xSpan = xHi - xLo || 1, x0 = xLo - xSpan * 0.05, x1 = xHi + xSpan * 0.05
  const px = (i: number) => (xs ? pad.l + ((xs[i]! - x0) / (x1 - x0)) * iw : pad.l + gw * i + gw / 2)
  const xTicks = xs ? [0, 0.25, 0.5, 0.75, 1].map((t) => xLo + (xHi - xLo) * t) : []
  return (
    <svg width={W} height={H}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} stroke={text} strokeOpacity={0.2} />
          <text x={pad.l - 10} y={y(max * t) + 8} textAnchor="end" {...font}>{axisFmt(max * t)}</text>
        </g>
      ))}
      {xs
        ? xTicks.map((v, i) => <text key={`x${i}`} x={pad.l + ((v - x0) / (x1 - x0)) * iw} y={H - 20 - bottomH} textAnchor="middle" {...font}>{Number(v.toFixed(2))}</text>)
        : labels.map((l, i) => <text key={l + i} x={pad.l + gw * i + gw / 2} y={H - 20 - bottomH} textAnchor="middle" {...font}>{l}</text>)}
      {stacked
        ? stacked.seg.map((segs, si) => segs.map((g, i) => {
            // one bar per category, the series on top of each other; a figure inside its segment when there is room, in the colour that reads on it (the file does the same: chart-labels.ts)
            const bw = gw * 0.6, x0 = pad.l + gw * i + gw * 0.2, top = y(g.y1), h = y(g.y0) - y(g.y1)
            return (
              <g key={`${si}-${i}`}>
                {h > 0 && <rect x={x0} y={top} width={bw} height={h} fill={color(si)} />}
                {dataLabels && h >= 30 && <text x={x0 + bw / 2} y={top + h / 2 + 7} textAnchor="middle" {...font} fontSize={20} fill={highlightText(color(si))}>{fmt(g.v)}</text>}
              </g>
            )
          }))
        : chartType === 'bar'
        ? series.map((s, si) => {
            const bw = (gw * 0.7) / series.length
            return s.values.slice(0, labels.length).map((v, i) => (
              <g key={`${si}-${i}`}>
                <rect x={pad.l + gw * i + gw * 0.15 + bw * si} y={y(v)} width={bw - 4} height={pad.t + ih - y(v)} rx={4} fill={color(si)} />
                {dataLabels && <text x={pad.l + gw * i + gw * 0.15 + bw * si + (bw - 4) / 2} y={y(v) - 8} textAnchor="middle" {...font} fontSize={20}>{fmt(v)}</text>}
              </g>
            ))
          })
        : xs
        ? series.map((s, si) => (
            <g key={si} data-scatter="">
              {s.values.slice(0, labels.length).map((v, i) => <circle key={i} cx={px(i)} cy={y(v)} r={10} fill={color(si)} stroke={backdrop[0]} strokeWidth={2} />)}
              {dataLabels && s.values.slice(0, labels.length).map((v, i) => <text key={`l${i}`} x={px(i)} y={y(v) - 18} textAnchor="middle" {...font} fontSize={20}>{fmt(v)}</text>)}
            </g>
          ))
        : series.map((s, si) => {
            const pts = s.values.slice(0, labels.length).map((v, i) => `${px(i)},${y(v)}`)
            return (
              <g key={si}>
                {/* an area chart: the same line, with the space under it filled (see-through, so overlapping series stay visible) */}
                {chartType === 'area' && pts.length > 1 && <polygon data-area="" fill={color(si)} fillOpacity={0.35} points={[`${px(0)},${y(0)}`, ...pts, `${px(pts.length - 1)},${y(0)}`].join(' ')} />}
                <polyline fill="none" stroke={color(si)} strokeWidth={5} points={pts.join(' ')} />
                {dataLabels && s.values.slice(0, labels.length).map((v, i) => <text key={i} x={px(i)} y={y(v) - 14} textAnchor="middle" {...font} fontSize={20}>{fmt(v)}</text>)}
              </g>
            )
          })}
      {trendline && xs && series.map((s, si) => {
        // a scatter's trend line fits the real x values (the file uses PowerPoint's own trendline, the same least squares)
        const f = linearFitXY(xs, s.values.slice(0, labels.length))
        return f ? <line key={`t${si}`} data-trend="" x1={px(xs.indexOf(xLo))} y1={y(f(xLo))} x2={px(xs.indexOf(xHi))} y2={y(f(xHi))} stroke={color(si)} strokeWidth={4} strokeDasharray="14 10" strokeOpacity={0.85} /> : null
      })}
      {trendline && !stacked && !xs && series.map((s, si) => {
        const t = linearTrend(s.values.slice(0, labels.length))
        return t ? <polyline key={`t${si}`} data-trend="" fill="none" stroke={color(si)} strokeWidth={4} strokeDasharray="14 10" strokeOpacity={0.85} points={t.map((v, i) => `${pad.l + gw * i + gw / 2},${y(v)}`).join(' ')} /> : null
      })}
      {place === 'bottom' && names.map((n, si) => (
        <g key={n + si} transform={`translate(${pad.l + rows[si]!.x}, ${H - bottomH + 4 + rows[si]!.y})`}>
          <rect width={22} height={22} rx={4} fill={color(si)} />
          <text x={34} y={19} {...font}>{n}</text>
        </g>
      ))}
      {place === 'right' && names.map((n, si) => (
        <g key={n + si} transform={`translate(${W - rightW + 20}, ${pad.t + si * 44})`}>
          <rect width={22} height={22} rx={4} fill={color(si)} />
          <text x={34} y={19} {...font}>{n}</text>
        </g>
      ))}
    </svg>
  )
}
