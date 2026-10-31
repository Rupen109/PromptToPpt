import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@prompttoppt/ui/logo'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'

export const metadata: Metadata = {
  title: 'Forgot your password',
  robots: { index: false, follow: false },
  alternates: { canonical: '/forgot-password' },
}

export default async function Page({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] flex flex-col items-center justify-center gap-8 px-6 py-12">
      <Link href="/" aria-label="SlidesDone home"><Logo size={44} /></Link>
      <ForgotPasswordForm defaultEmail={email && email.length < 255 ? email : undefined} />
    </main>
  )
}
