import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import '@prompttoppt/ui/prose.css'
import { SiteTranslate } from '@/components/layout/SiteTranslate'
import { JsonLd } from '@/components/seo/JsonLd'
import { CookieConsent } from '@/components/legal/CookieConsent'
import { IS_PUBLIC_SITE, SITE_URL } from '@/lib/env'
import { siteGraph } from '@/lib/seo'

// ─── Fonts ────────────────────────────────────────────────────────────────

// Self-hosted (see app/fonts/README.md): the build must not depend on fetching fonts from Google.
const inter = localFont({
  src: './fonts/Inter-latin.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
})

const plusJakartaSans = localFont({
  src: './fonts/PlusJakartaSans-latin.woff2',
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
  weight: '200 800',
})

// Wordmark only: a light + extra-bold pair (see docs/BRAND.md)
const sora = localFont({ src: './fonts/Sora-latin.woff2', variable: '--font-logo', display: 'swap', weight: '100 800' })

const caveat = localFont({
  src: './fonts/Caveat-latin.woff2',
  variable: '--font-caveat',
  display: 'swap',
  preload: false, // a handwriting accent used in a few places: not worth competing with the fonts of the first screen
  weight: '400 700',
})

// ─── Default Metadata ────────────────────────────────────────────────────
// Each page should override these using generateMetadata()

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SlidesDone — AI Presentation Maker',
    template: '%s | SlidesDone',
  },
  description:
    'Create stunning presentations in seconds with AI. Enter a topic or detailed prompt and get a beautiful, editable presentation — powered by AI.',
  keywords: [
    'AI presentation maker',
    'AI PPT maker',
    'AI PowerPoint generator',
    'text to PPT',
    'PDF to presentation',
    'presentation generator',
    'AI slides',
    'prompt to presentation',
  ],
  authors: [{ name: 'SlidesDone' }],
  creator: 'SlidesDone',
  publisher: 'SlidesDone',
  robots: {
    index: IS_PUBLIC_SITE,
    follow: IS_PUBLIC_SITE,
    googleBot: {
      index: IS_PUBLIC_SITE,
      follow: IS_PUBLIC_SITE,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'SlidesDone',
    title: 'SlidesDone — AI Presentation Maker',
    description:
      'Create stunning presentations in seconds with AI. Enter a topic and get a beautiful, editable deck.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'SlidesDone — AI Presentation Maker',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SlidesDone — AI Presentation Maker',
    description:
      'Create stunning presentations in seconds with AI.',
    images: ['/og-image.png'],
    creator: '@slidesdone',
    site: '@slidesdone',
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }, { url: '/favicon.ico', sizes: 'any' }],
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  alternates: {
    canonical: '/',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6366F1',
}

// ─── Root Layout ──────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      // data-auth is set by the script below before React loads (the API's sd_signed_in marker), so it differs from the server HTML on purpose
      suppressHydrationWarning
      className={`${inter.variable} ${plusJakartaSans.variable} ${caveat.variable} ${sora.variable}`}
    >
      <head>
        {/* Signed in or not, BEFORE the first paint: the API keeps a readable marker next to the login cookie (services/api security/signed-in-marker.ts), so the
            header shows the right buttons at once instead of waiting for a session request (components/layout/AuthActions.tsx corrects it if the session is gone). */}
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.auth=/(?:^|;\\s*)sd_signed_in=1/.test(document.cookie)?'in':'out'}catch(e){}" }} />
        {/* Preconnect to Google Fonts for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Structured data: organisation, website and product (lib/seo.ts) */}
        <JsonLd data={siteGraph()} />
      </head>
      {/* Browser extensions (ColorZilla's cz-shortcut-listen, Grammarly…) add attributes to <body> before React loads; that is not our markup, so don't warn about it. */}
      <body suppressHydrationWarning>
        {children}
        <SiteTranslate />
        {/* Google Analytics loads only after the visitor accepts (components/legal/CookieConsent.tsx); off outside the real site (lib/env.ts) */}
        <CookieConsent />
      </body>
    </html>
  )
}
