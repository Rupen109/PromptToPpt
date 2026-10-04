import { useId, type CSSProperties } from 'react'

/**
 * The promptToPpt mark: a bold "P" whose counter holds an AI spark, with an orange cursor/slide-bar beneath — on a cobalt tile
 * (the brand colours from tokens.css: cobalt #0b3dd0, yellow #ffdf00, orange #ff5722). Pure SVG: crisp at any size and it
 * needs no font. Static copies for favicons/social live in apps/web/public (see docs/BRAND.md).
 */
export function LogoMark({ size = 32, title = 'promptToPpt', style, rounded = true }: { size?: number; title?: string | null; style?: CSSProperties; rounded?: boolean }) {
  const gid = useId() // gradient ids must be unique per instance on a page
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} role={title ? 'img' : undefined} aria-label={title ?? undefined} aria-hidden={title ? undefined : true} style={{ display: 'block', flexShrink: 0, ...style }}>
      <defs>
        <linearGradient id={gid} x1="8" y1="2" x2="58" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2F63F5" />
          <stop offset="0.55" stopColor="#0B3DD0" />
          <stop offset="1" stopColor="#082A9A" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx={rounded ? 16 : 0} fill={`url(#${gid})`} />
      <g fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" transform="translate(-2.5 -2.5)">
        <path d="M22.5 18.5V50" />
        <path d="M22.5 18.5H36a11 11 0 0 1 0 22H22.5" />
      </g>
      <path d="M32.4 21.7Q33.65 25.95 37.9 27.2Q33.65 28.45 32.4 32.7Q31.15 28.45 26.9 27.2Q31.15 25.95 32.4 21.7Z" fill="#FFDF00" />
      <rect x="29" y="46" width="14" height="6" rx="3" fill="#FF5722" />
    </svg>
  )
}

/**
 * Mark + wordmark. The lettering is "gradient flow": a light "prompt" (the idea) flowing into a bold "ToPpt" that shifts from cobalt to
 * orange (the finished deck) — brand colours only (cobalt #0b3dd0 → orange #ff5722). Sora 300 + 800.
 * `tone="dark"` is for dark backgrounds (white "prompt", lighter cobalt). Size = height of the mark in px.
 */
export function Logo({ size = 32, tone = 'light', wordmark = true, style }: { size?: number; tone?: 'light' | 'dark'; wordmark?: boolean; style?: CSSProperties }) {
  const dark = tone === 'dark'
  const from = dark ? '#6C8FFF' : '#0B3DD0'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.28, ...style }}>
      <LogoMark size={size} title={wordmark ? null : 'promptToPpt'} />
      {wordmark && (
        <span aria-label="promptToPpt" style={{ fontFamily: "var(--font-logo, 'Sora', system-ui, sans-serif)", fontSize: size * 0.74, letterSpacing: '-0.03em', lineHeight: 1, whiteSpace: 'nowrap', color: dark ? '#fff' : 'var(--color-text-primary, #181b25)' }}>
          <span aria-hidden style={{ fontWeight: 300 }}>prompt</span>
          <span aria-hidden style={{ fontWeight: 800, color: from, backgroundImage: `linear-gradient(90deg, ${from} 0%, ${from} 28%, #FF5722 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ToPpt</span>
        </span>
      )}
    </span>
  )
}
