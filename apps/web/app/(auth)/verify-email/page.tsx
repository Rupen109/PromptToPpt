import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@prompttoppt/ui/logo'
import { VerifyEmailResult } from '@/components/auth/VerifyEmailResult'

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
  alternates: { canonical: '/verify-email' },
}

/** Where the confirmation link in the e-mail lands (the API redirects here after checking it): `?error=TOKEN_EXPIRED` / `INVALID_TOKEN` when it fails, no error when it worked. */
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] flex flex-col items-center justify-center gap-8 px-6 py-12">
      <Link href="/" aria-label="SlidesDone home"><Logo size={44} /></Link>
      <VerifyEmailResult error={error?.slice(0, 40)} next={next?.slice(0, 500)} />
    </main>
  )
}
