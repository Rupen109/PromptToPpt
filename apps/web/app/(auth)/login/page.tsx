import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@prompttoppt/ui/logo'
import { AuthForm } from '@/components/auth/AuthForm'

export const metadata: Metadata = {
  title: 'Log in',
  robots: { index: false, follow: false }, // auth pages should not be indexed
  alternates: { canonical: '/login' },
}

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] flex flex-col items-center justify-center gap-8 px-6 py-12">
      <Link href="/" aria-label="promptToPpt home"><Logo size={44} /></Link>
      <AuthForm mode="login" next={next} />
    </main>
  )
}
