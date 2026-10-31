import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import '@prompttoppt/ui/prose.css'
import { SiteTranslate } from '@/components/layout/SiteTranslate'
import { SITE_URL } from '@/lib/env'

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
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
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
      className={`${inter.variable} ${plusJakartaSans.variable} ${caveat.variable} ${sora.variable}`}
    >
      <head>
        {/* Preconnect to Google Fonts for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* JSON-LD: Organization structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'SlidesDone',
              applicationCategory: 'BusinessApplication',
              description:
                'AI-powered presentation maker. Create beautiful presentations from a prompt.',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
            }),
          }}
        />
      </head>
      {/* Browser extensions (ColorZilla's cz-shortcut-listen, Grammarly…) add attributes to <body> before React loads; that is not our markup, so don't warn about it. */}
      <body suppressHydrationWarning>
        {children}
        <SiteTranslate />
      </body>
    </html>
  )
}
