import type { Metadata, Viewport } from 'next'
import { Inter, Plus_Jakarta_Sans, Caveat } from 'next/font/google'
import './globals.css'

// ─── Fonts ────────────────────────────────────────────────────────────────

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '600', '700'],
})

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
  weight: ['700', '800'],
})

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
  weight: ['700'],
})

// ─── Default Metadata ────────────────────────────────────────────────────
// Each page should override these using generateMetadata()

export const metadata: Metadata = {
  metadataBase: new URL(process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://prompttoppt.com'),
  title: {
    default: 'promptToPpt — AI Presentation Maker',
    template: '%s | promptToPpt',
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
  authors: [{ name: 'promptToPpt' }],
  creator: 'promptToPpt',
  publisher: 'promptToPpt',
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
    siteName: 'promptToPpt',
    title: 'promptToPpt — AI Presentation Maker',
    description:
      'Create stunning presentations in seconds with AI. Enter a topic and get a beautiful, editable deck.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'promptToPpt — AI Presentation Maker',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'promptToPpt — AI Presentation Maker',
    description:
      'Create stunning presentations in seconds with AI.',
    images: ['/og-image.png'],
    creator: '@prompttoppt',
  },
  icons: {
    icon: '/favicon.ico',
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
      className={`${inter.variable} ${plusJakartaSans.variable} ${caveat.variable}`}
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
              name: 'promptToPpt',
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
      <body>
        {children}
      </body>
    </html>
  )
}
