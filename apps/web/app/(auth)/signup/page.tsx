import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/AuthForm'
import { AuthShell } from '@/components/auth/AuthShell'

export const metadata: Metadata = {
  title: 'Sign up',
  robots: { index: false, follow: false }, // auth pages should not be indexed
  alternates: { canonical: '/signup' },
}

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; email?: string; error?: string }> }) {
  const { next, email, error } = await searchParams
  return (
    <AuthShell mode="signup">
      <AuthForm mode="signup" next={next} failed={error === 'google' || error === 'microsoft' ? error : undefined} {...(email && email.length < 200 ? { defaultEmail: email } : {})} />
    </AuthShell>
  )
}
