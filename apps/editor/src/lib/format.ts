export const int = (n: number) => Math.round(n).toLocaleString('en-US')
export const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: n < 1000 ? 0 : 1 }).format(n)
export const usd = (n: number) => (n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(5)}` : n < 100 ? `$${n.toFixed(n < 1 ? 4 : 2)}` : `$${Math.round(n).toLocaleString('en-US')}`)
export const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.01 ? 2 : 1)}%`
export const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`)
