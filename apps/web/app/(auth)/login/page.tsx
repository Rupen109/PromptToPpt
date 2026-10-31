import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/AuthForm'
import { AuthShell } from '@/components/auth/AuthShell'

export const metadata: Metadata = {
  title: 'Log in',
  robots: { index: false, follow: false }, // auth pages should not be indexed
  alternates: { canonical: '/login' },
}

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams
  return (
    <AuthShell mode="login">
      <AuthForm mode="login" next={next} failed={error === 'google' || error === 'microsoft' ? error : undefined} />
    </AuthShell>
  )
}
