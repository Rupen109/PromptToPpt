import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { app } from './app.ts'
import { db } from './db/index.ts'
import { presentation, presentationVersion, subscription } from './db/schema.ts'
import { composeSlide, getTheme } from '@prompttoppt/theme'
import type { Presentation, SlideContent } from '@prompttoppt/validation'

export const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
export const rid = () => Math.random().toString(36).slice(2, 10)

export async function signUp(prefix = 't') {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: `${prefix}-${rid()}@example.com`, password: 'password123', name: 'T' }),
  })
  const body = (await res.json()) as { user: { id: string } }
  return { id: body.user.id, cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') }
}

/** Puts a user on a plan directly in the DB (what a verified payment webhook will do in production). */
export async function setPlan(userId: string, planId: 'starter' | 'pro' | 'gold') {
  await db.delete(subscription).where(eq(subscription.userId, userId))
  if (planId === 'starter') return
  const now = new Date()
  await db.insert(subscription).values({ id: nanoid(), userId, planId, status: 'active', currency: 'USD', interval: 'month', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 864e5), provider: 'manual' })
}

export const api = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) })
export const json = async (r: Response) => (await r.json()) as any

const CONTENTS = (n: number): SlideContent[] => [
  { layout: 'title', title: 'Quarterly Review', subtitle: 'Q3', speakerNotes: '', sources: [] },
  ...Array.from({ length: Math.max(0, n - 2) }, (_, i): SlideContent => ({ layout: 'title-body', title: `Point ${i + 1}`, bullets: ['Alpha', 'Beta', 'Gamma'], speakerNotes: '', sources: [] })),
  { layout: 'thank-you', title: 'Thank you', speakerNotes: '', sources: [] },
].slice(0, n) as SlideContent[]

/** Inserts a ready-made deck for `userId` (what generation would have produced). */
export async function makeDeck(userId: string, slides = 3, themeId = 'cobalt') {
  const theme = getTheme(themeId)
  const id = nanoid()
  const doc: Presentation = {
    schemaVersion: 1, id, title: 'Test deck', aspectRatio: '16:9', language: 'en', theme, sources: [],
    slides: CONTENTS(slides).map((c) => ({ id: nanoid(12), locked: false, validation: { status: 'passed' as const, issues: [] }, ...composeSlide(c, theme, '16:9', () => nanoid(10)) })),
  }
  await db.insert(presentation).values({ id, userId, title: doc.title, latestVersion: 1, revision: 1 })
  await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
  return { id, doc }
}
