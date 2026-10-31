'use client'

import { Rocket } from '@prompttoppt/ui/icons'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { HARD } from './ui'

export function CtaSection() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  function go(e: FormEvent) {
    e.preventDefault()
    router.push(`/signup${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`)
  }
  return (
    <section className="bg-[#f3f4f9] border-b-2 border-foreground px-5 md:px-10 pt-16 pb-16 md:pb-28">
      <Card tone="yellow" shadow="lg" hover={false} wrapperClassName="max-w-[816px] mx-auto h-auto" className="px-6 md:px-12 py-16 md:py-[67px] text-center flex flex-col items-center">
        <span className={`inline-flex items-center gap-1.5 -rotate-[0.05deg] bg-white border-2 border-foreground rounded-full px-[22px] py-[7px] font-heading font-extrabold text-xs uppercase text-foreground ${HARD.sm}`}><Rocket aria-hidden size={14} />Immediate acceleration</span>
        <h2 className="mt-8 font-heading font-extrabold text-4xl md:text-5xl leading-[1.05] text-foreground max-w-[672px]">Stop Staring at Blank Slides. Build Your Deck in Under a Minute.</h2>
        <p className="mt-6 text-lg leading-7 font-medium text-foreground max-w-[576px]">Describe your topic, drop in a PDF or a link, and get a designed, editable presentation you can present today.</p>
        <form onSubmit={go} className="mt-8 w-full max-w-[448px] flex flex-col sm:flex-row gap-3">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your work email…" aria-label="Email address" className={`flex-1 min-w-0 h-12 rounded-xl border-2 border-foreground bg-white px-[18px] font-sans text-base font-semibold text-foreground placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-primary transition-shadow focus:shadow-[4px_5px_0_0_#181b25] ${HARD.sm}`} />
          <Button type="submit" variant="accent" size="lg" arrow className="!h-12 !rounded-xl !px-[30px]">Start free</Button>
        </form>
        <p className="mt-5 font-heading font-bold text-xs text-foreground">No credit card required • The free plan includes 100 credits</p>
      </Card>
    </section>
  )
}

export default CtaSection
