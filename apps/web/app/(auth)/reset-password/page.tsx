import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@prompttoppt/ui/logo'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
  alternates: { canonical: '/reset-password' },
  referrer: 'no-referrer', // the address carries a one-time token: never pass it on to other sites
}

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] flex flex-col items-center justify-center gap-8 px-6 py-12">
      <Link href="/" aria-label="SlidesDone home"><Logo size={44} /></Link>
      <ResetPasswordForm token={token && token.length < 200 ? token : undefined} invalid={!!error} />
    </main>
  )
}
