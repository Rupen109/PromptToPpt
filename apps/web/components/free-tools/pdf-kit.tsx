'use client'

import { useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PdfConvertError } from '@/lib/pdf-limits'

/** The pieces every free PDF page tool shares (merge, split, organize, compress), so they look and behave the same: one card, the download in that card. */

export function ToolCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 text-left">
      <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">{children}</Card>
    </div>
  )
}

/** a drop zone + file picker; `multiple` takes several PDFs at once */
export function PdfDrop({ title, hint, multiple = false, onFiles, label = 'Choose a PDF' }: { title: string; hint: string; multiple?: boolean; onFiles: (files: File[]) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const take = (list: FileList | null | undefined) => { const files = [...(list ?? [])]; if (files.length) onFiles(multiple ? files : files.slice(0, 1)) }
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files) }}
        className="w-full rounded-2xl border-2 border-dashed border-foreground bg-[#f8f9fc] px-6 py-10 text-center hover:bg-[#f0f4f8] focus:outline-none focus:ring-2 focus:ring-primary">
        <span className="block font-heading font-extrabold text-lg text-foreground">{title}</span>
        <span className="mt-1 block text-sm font-medium text-[#64748b]">{hint}</span>
      </button>
      {/* the value is cleared after each pick, so the same file can be chosen again */}
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple={multiple} className="sr-only" aria-label={label} onChange={(e) => { take(e.target.files); e.target.value = '' }} />
    </>
  )
}

/** a radio card like the PDF to PPT converter's */
export function Choice<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { value: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="mt-5">
      <legend className="sr-only">{name}</legend>
      <div className={`grid gap-3 ${options.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {options.map((o) => (
          <label key={o.value} className={`flex cursor-pointer gap-3 rounded-xl border-2 px-4 py-3 ${value === o.value ? 'border-foreground bg-[#f8f9fc]' : 'border-[#cbd5e1] bg-white hover:border-foreground'}`}>
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1 h-4 w-4 shrink-0 accent-[#0f172a]" />
            <span>
              <span className="block font-heading font-extrabold text-base text-foreground">{o.label}</span>
              <span className="block text-sm font-medium text-[#475569]">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** the result, in the same card: what it is, the download, and a way to start again */
export function Ready({ title, detail, blob, name, onAgain, againLabel }: { title: string; detail: string; blob: Blob; name: string; onAgain: () => void; againLabel: string }) {
  const download = () => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return (
    <div className="mt-6" role="status">
      <p className="font-heading font-extrabold text-lg text-foreground">{title}</p>
      <p className="mt-1 text-sm font-medium text-[#64748b]">{detail}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="lime" size="lg" onClick={download}>Download {name.endsWith('.zip') ? '.zip' : '.pdf'}</Button>
        <Button variant="white" size="lg" onClick={onAgain}>{againLabel}</Button>
      </div>
    </div>
  )
}

export const ErrorLine = ({ error }: { error: string | null }) => (error ? <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p> : null)

/** a plain message for any failure */
export const plain = (e: unknown, fallback: string) => (e instanceof PdfConvertError ? e.message : fallback)

export const readBytes = async (f: File) => new Uint8Array(await f.arrayBuffer())
