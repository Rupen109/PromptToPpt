'use client'

import { useState, type FormEvent } from 'react'
import type { SitemapResponse } from '@prompttoppt/api-client'
import { Check, Copy, Download } from '@prompttoppt/ui/icons'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { toolError } from '@/lib/free-tools'

const FIELD = 'w-full rounded-xl border-2 border-foreground bg-white px-4 py-3 text-sm font-medium text-foreground placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-primary'
const LIMITS = [25, 50, 100, 200] as const
const FREQ = [['none', 'Leave out'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']] as const

/** Free sitemap generator: the server visits the site like a search-engine bot and the visitor gets a sitemap.xml to copy or download. */
export function SitemapTool() {
  const [url, setUrl] = useState('')
  const [maxPages, setMaxPages] = useState<(typeof LIMITS)[number]>(100)
  const [lastmod, setLastmod] = useState(true)
  const [priority, setPriority] = useState(true)
  const [changefreq, setChangefreq] = useState<(typeof FREQ)[number][0]>('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<SitemapResponse | null>(null)
  const [copied, setCopied] = useState(false)

  async function run(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setOut(null); setCopied(false)
    try { setOut(await api.freeSitemap({ url: url.trim(), maxPages, lastmod, priority, changefreq })) }
    catch (err) { setError(toolError(err, 'Something went wrong. Please try again.')) }
    finally { setBusy(false) }
  }
  function download() {
    if (!out) return
    const href = URL.createObjectURL(new Blob([out.xml], { type: 'application/xml' }))
    const a = document.createElement('a'); a.href = href; a.download = 'sitemap.xml'; a.click()
    setTimeout(() => URL.revokeObjectURL(href), 10_000)
  }
  async function copy() {
    if (!out) return
    try { await navigator.clipboard.writeText(out.xml); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setError('Your browser blocked copying. Use Download instead.') }
  }
  const host = out ? new URL(out.site).host : ''

  return (
    <div className="flex flex-col gap-6 text-left">
      <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
        <form onSubmit={run} className="flex flex-col gap-5">
          <label className="block">
            <span className="text-xs font-heading font-extrabold uppercase text-foreground">Your website address</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" aria-label="Website address" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={500} className={`${FIELD} mt-2`} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-heading font-extrabold uppercase text-foreground">Most pages to list</span>
              <select value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value) as (typeof LIMITS)[number])} aria-label="Most pages to list" className={`${FIELD} mt-2`}>
                {LIMITS.map((n) => <option key={n} value={n}>{n} pages</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-heading font-extrabold uppercase text-foreground">How often pages change</span>
              <select value={changefreq} onChange={(e) => setChangefreq(e.target.value as (typeof FREQ)[number][0])} aria-label="How often pages change" className={`${FIELD} mt-2`}>
                {FREQ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-foreground">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={lastmod} onChange={(e) => setLastmod(e.target.checked)} className="h-4 w-4 accent-primary" />Add &ldquo;last changed&rdquo; dates (when the site shares them)</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} className="h-4 w-4 accent-primary" />Add page priority (home page first)</label>
          </div>
          <Button type="submit" variant="accent" size="lg" arrow disabled={busy || url.trim().length < 3}>{busy ? 'Visiting your pages…' : 'Generate sitemap'}</Button>
          {busy && <p role="status" className="text-sm font-medium text-[#64748b]">This can take up to 40 seconds for a big site. Keep this page open.</p>}
          {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        </form>
      </Card>

      {out && (
        <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
          <h2 className="font-heading font-extrabold text-2xl text-foreground">Your sitemap for {host} is ready</h2>
          <p className="mt-1 text-sm font-medium text-[#64748b]">
            {out.stats.found} page{out.stats.found === 1 ? '' : 's'} listed
            {out.stats.foundSitemap ? ' · your site already had a sitemap, we included its pages' : ''}
            {out.stats.skipped.robots > 0 ? ` · ${out.stats.skipped.robots} left out because robots.txt blocks them` : ''}
            {out.stats.skipped.noindex > 0 ? ` · ${out.stats.skipped.noindex} left out because they ask not to be listed (noindex)` : ''}
          </p>
          {(out.stats.truncated || out.stats.slow) && (
            <p role="note" className="mt-3 rounded-xl border-2 border-foreground bg-[#fffbe6] px-4 py-3 text-sm font-medium text-foreground">
              {out.stats.slow ? 'The site was slow, so we stopped early. ' : `We stopped at ${maxPages} pages. `}
              Your site has more pages than this list. Choose a higher limit and generate again.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="lime" size="lg" onClick={download}><Download aria-hidden size={16} />Download sitemap.xml</Button>
            <Button variant="white" size="lg" onClick={() => void copy()}>{copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}{copied ? 'Copied' : 'Copy XML'}</Button>
          </div>
          <label className="mt-6 block">
            <span className="text-xs font-heading font-extrabold uppercase text-foreground">sitemap.xml</span>
            <textarea readOnly value={out.xml} aria-label="Sitemap XML" rows={12} className={`${FIELD} mt-2 font-mono text-xs leading-5`} />
          </label>
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-heading font-extrabold text-foreground">The {out.urls.length} pages</summary>
            <ul className="mt-3 max-h-72 overflow-auto rounded-xl border-2 border-foreground bg-white p-3 text-xs font-medium text-[#334155] space-y-1">
              {out.urls.map((u) => <li key={u.loc} className="break-all list-none">{u.loc}</li>)}
            </ul>
          </details>
          <div className="mt-6 rounded-2xl border-2 border-foreground bg-[#f8f9fc] p-5">
            <h3 className="font-heading font-extrabold text-lg text-foreground">What to do with it</h3>
            <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm leading-6 font-medium text-[#475569]">
              <li>Upload the file to your website so it opens at <span className="font-bold">{out.site}/sitemap.xml</span>.</li>
              <li>Add this line to your robots.txt: <span className="font-mono text-xs">Sitemap: {out.site}/sitemap.xml</span></li>
              <li>In Google Search Console, open Sitemaps and submit the address.</li>
            </ol>
          </div>
        </Card>
      )}
    </div>
  )
}
