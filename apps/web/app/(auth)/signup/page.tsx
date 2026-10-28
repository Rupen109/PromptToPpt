import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@prompttoppt/ui/logo'
import { AuthForm } from '@/components/auth/AuthForm'

export const metadata: Metadata = {
  title: 'Sign up',
  robots: { index: false, follow: false }, // auth pages should not be indexed
  alternates: { canonical: '/signup' },
}

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const { next, email } = await searchParams
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] flex flex-col items-center justify-center gap-8 px-6 py-12">
      <Link href="/" aria-label="SlidesDone home"><Logo size={44} /></Link>
      <AuthForm mode="signup" next={next} {...(email && email.length < 200 ? { defaultEmail: email } : {})} />
    </main>
  )
}
