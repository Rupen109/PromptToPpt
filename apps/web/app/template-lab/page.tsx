import type { Metadata } from 'next'
import { Header } from '@/components/layout/Header'
import { TemplateLab } from '@/components/templates/TemplateLab'

export const metadata: Metadata = { title: 'Template lab (review)', robots: { index: false, follow: false } }

export default function TemplateLabPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#f3f4f9]">
      <Header />
      <main className="max-w-[1400px] w-full mx-auto px-6 md:px-10 py-12">
        <h1 className="font-heading font-extrabold text-4xl text-foreground">Template lab</h1>
        <p className="text-slate-600 mt-2 mb-8 max-w-[760px]">Next-level template prototypes: photo-led layouts, colour blocking, circular / arched / angled photo crops and ambient motion. For review before we upgrade the whole catalogue.</p>
        <TemplateLab />
      </main>
    </div>
  )
}
