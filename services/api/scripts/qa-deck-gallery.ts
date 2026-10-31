/**
 * QA only (refuses in production) — look at real AI decks: puts stored AI-generated decks on share links so a browser can screenshot them.
 *   tsx scripts/qa-deck-gallery.ts before <n>   → n stored decks, exactly as they were generated
 *   tsx scripts/qa-deck-gallery.ts after <n>    → the SAME decks' contents re-composed with today's layout code
 *   tsx scripts/qa-deck-gallery.ts clean        → deletes everything this script made
 * Prints [{ title, token }]. Decks are owned by the first admin/user in the database and titled "QA-GALLERY …".
 */
import { and, eq, like, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { DESIGNS, composeDeck, designById } from '@prompttoppt/theme'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import { db, pool } from '../src/db/index.ts'
import { isProd } from '../src/env.ts'
import { presentation, presentationVersion, shareLink, user } from '../src/db/schema.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const [mode, nArg] = process.argv.slice(2)
if (mode === 'clean') {
  const del = await db.delete(presentation).where(like(presentation.title, 'QA-GALLERY%')).returning({ id: presentation.id })
  console.log(JSON.stringify({ deleted: del.length }))
} else {
  const n = Number(nArg ?? 6)
  const rows = await db.select({ doc: presentationVersion.document }).from(presentation).innerJoin(presentationVersion, and(eq(presentationVersion.presentationId, presentation.id), eq(presentationVersion.version, presentation.latestVersion))).where(sql`${presentationVersion.createdBy} = 'generation' and ${presentation.title} not like 'QA-GALLERY%'`)
  const seen = new Set<string>(); const picked: Presentation[] = []
  for (const r of rows.reverse()) { const d = r.doc as Presentation; const k = d.theme.templateId ?? 'none'; if (d.slides.length >= 8 && !seen.has(k)) { seen.add(k); picked.push(d) } if (picked.length >= n) break }
  const [owner] = await db.select({ id: user.id }).from(user).limit(1)
  const out: { title: string; token: string }[] = []
  let k = 0
  for (const d0 of picked) {
    let d = d0
    if (mode === 'after') {
      const kept = d0.slides.filter((s) => s.content)
      const design = { ...((d0.theme.templateId ? designById(d0.theme.templateId) : undefined) ?? DESIGNS[0]!), theme: d0.theme }
      const photo = { src: d0.slides.flatMap((s) => s.elements).find((e) => e.type === 'image' && 'src' in e && e.src)?.['src' as never] as string | undefined ?? '', alt: 'p' }
      const composed = composeDeck(kept.map((s) => s.content as SlideContent), design, d0.aspectRatio, () => `g${k++}${nanoid(6)}`, undefined, undefined, kept.map((s) => { const img = s.elements.find((e) => e.type === 'image' && 'src' in e && e.src) as { src?: string } | undefined; return img?.src ? { src: img.src, alt: 'p' } : null }))
      void photo
      d = { ...d0, slides: composed.map((c, i) => ({ id: `q${i}${nanoid(6)}`, locked: false, validation: { status: 'passed', issues: [] }, ...c })) as Presentation['slides'] }
    }
    const id = nanoid(); const title = `QA-GALLERY ${mode} ${d0.theme.templateId ?? 'deck'}`.slice(0, 120)
    d = { ...d, id, title }
    await db.insert(presentation).values({ id, userId: owner!.id, title, aspectRatio: d.aspectRatio, latestVersion: 1 })
    await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: d, createdBy: 'generation' })
    const token = nanoid(32)
    await db.insert(shareLink).values({ id: nanoid(), presentationId: id, createdBy: owner!.id, token })
    out.push({ title, token })
  }
  console.log(JSON.stringify(out))
}
await pool.end()
