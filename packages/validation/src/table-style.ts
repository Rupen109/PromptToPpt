/** the text colour that reads on a cell colour: dark on a light fill, white on a dark one (one rule for the screen and the PowerPoint file) */
export function highlightText(fill: string): string {
  const h = fill.replace('#', '')
  const lum = parseInt(h.slice(0, 2), 16) * 0.299 + parseInt(h.slice(2, 4), 16) * 0.587 + parseInt(h.slice(4, 6), 16) * 0.114
  return lum < 140 ? '#FFFFFF' : '#111111'
}

export type NumberFormat = 'thousands' | 'percent' | 'usd' | 'inr' | 'eur' | 'gbp'
const SYMBOL = { usd: '$', inr: '₹', eur: '€', gbp: '£' } as const

/**
 * One cell's number in another format, WITHOUT changing its value: thousands separators, a percent sign or a currency symbol in front, and a fixed number of decimals. Returns null when the cell is not a
 * number (so it is left alone). The value before and after is always the same number (the caller checks).
 */
export function formatCell(text: string, format: NumberFormat, decimals?: number): string | null {
  const m = text.trim().match(/^([^0-9\-]*?)(-?[\d,]*\.?\d+)\s*(%?)\s*$/)
  if (!m) return null
  const [, prefix, numText, pct] = m
  const value = Number(numText!.replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  const own = (numText!.split('.')[1] ?? '').length
  const places = decimals ?? own
  const body = value.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping: format === 'thousands' || /,/.test(numText!) || format in SYMBOL })
  if (format === 'percent') return `${body}%`
  if (format === 'thousands') return `${(prefix ?? '').trim() ? prefix : ''}${body}${pct ?? ''}`
  return `${SYMBOL[format]}${body}${pct ?? ''}`
}

/** the number in a cell, as people read it ("$1,150", "12%", "3.5"); null when it is not one */
export const cellNumber = (text: string): number | null => {
  const m = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}
