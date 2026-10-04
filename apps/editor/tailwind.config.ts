import type { Config } from 'tailwindcss'

// Colours/fonts resolve to the shared tokens in @prompttoppt/theme so web and editor stay in sync.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-bg)',
        foreground: 'var(--color-text-primary)',
        primary: { DEFAULT: 'var(--color-primary)', hover: 'var(--color-primary-hover)' },
        accent: { DEFAULT: 'var(--color-accent)', hover: 'var(--color-accent-hover)' },
        border: 'var(--color-border)',
        muted: 'var(--color-text-muted)',
      },
      fontFamily: { sans: ['var(--font-body)'], heading: ['var(--font-heading)'] },
    },
  },
} satisfies Config
