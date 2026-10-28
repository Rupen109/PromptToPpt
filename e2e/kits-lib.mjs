import { execSync } from 'node:child_process'
import { crc32, deflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { API, EDITOR, WEB, expect, uniqueEmail } from './lib.mjs'

/** Shared helpers of the brand-kit suites (24-kits, 25-kits-deck): fresh accounts, plans, fixtures, API calls, the Brand tab. */
const cwd = new URL('..', import.meta.url).pathname
export const tsx = (cmd) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim().split('\n').pop()
export const plan = (email, p) => tsx(`scripts/qa-grant-plan.ts ${email} ${p}`)
export const JSON_HEADERS = { Origin: WEB, 'Content-Type': 'application/json' }

/** a valid PNG of the given size; `noise` makes it incompressible (for the "too big" case) */
export function png(w, h, { rgba = [228, 87, 46, 255], noise = false } = {}) {
  const row = 1 + w * 4
  const raw = Buffer.alloc(row * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * row + 1 + x * 4
      if (noise) { raw[o] = Math.random() * 256; raw[o + 1] = Math.random() * 256; raw[o + 2] = Math.random() * 256; raw[o + 3] = 255 } else { raw[o] = rgba[0]; raw[o + 1] = rgba[1]; raw[o + 2] = rgba[2]; raw[o + 3] = rgba[3] }
    }
  }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)) >>> 0, 8 + data.length); return b }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
export const JPEG = readFileSync(new URL('../apps/web/public/template-lab/s-flat.jpg', import.meta.url))
export const file = (name, buffer, mimeType) => ({ name, mimeType, buffer })

/** a brand-new signed-in person (own browser context); optionally on a plan */
export async function person(b, tag, planId) {
  const email = uniqueEmail(tag).toLowerCase()
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
  const su = await ctx.request.post(`${API}/api/auth/sign-up/email`, { headers: JSON_HEADERS, data: { email, password: 'Passw0rd!qa-test', name: 'Kit QA' } })
  expect(su.ok(), `sign-up ${su.status()}`)
  if (planId) plan(email, planId)
  const p = await ctx.newPage()
  return { email, ctx, p, id: null }
}
const call = async (A, method, path, data) => {
  const r = await A.ctx.request.fetch(`${API}/api/v1${path}`, { method, headers: JSON_HEADERS, ...(data !== undefined ? { data } : {}) })
  let body = null; try { body = await r.json() } catch { /* empty */ }
  return { status: r.status(), body, data: body?.data, headers: r.headers() }
}
export const api = {
  get: (A, path) => call(A, 'GET', path),
  post: (A, path, data = {}) => call(A, 'POST', path, data),
  patch: (A, path, data) => call(A, 'PATCH', path, data),
  del: (A, path) => call(A, 'DELETE', path),
  /** multipart upload straight to the API */
  async upload(A, path, f, field = 'file') {
    const r = await A.ctx.request.post(`${API}/api/v1${path}`, { headers: { Origin: WEB }, multipart: { [field]: f } })
    let body = null; try { body = await r.json() } catch { /* empty */ }
    return { status: r.status(), body, data: body?.data }
  },
}
export const newDeck = async (A, title = 'Kit test deck', aspectRatio = '16:9') => { const r = await api.post(A, '/presentations', { title, aspectRatio }); expect(r.status === 200 || r.status === 201, `create deck ${r.status}`); return r.data.id }

export const stage = (p) => p.locator('[data-testid="stage"]')
export const logos = (p) => p.locator('[data-testid="stage"] img[alt$="logo"]').count()
export const saved = (p) => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
export async function openDeck(p, id) { await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await stage(p).waitFor({ timeout: 20000 }) }
export async function openBrand(p, id) {
  await openDeck(p, id)
  await p.getByRole('toolbar').getByRole('button', { name: /Style/ }).click()
  await p.getByRole('tab', { name: 'Brand' }).click()
}
export const details = (p) => p.getByLabel('Brand kit details')
export const applyBox = (p) => p.getByLabel('Apply this kit')
export async function fillKit(p, { name, primary, accent, heading, body }) {
  const d = details(p)
  if (name !== undefined) await d.getByLabel('Kit name').fill(name)
  if (primary) await d.getByLabel('Main colour').fill(primary.toLowerCase())
  if (accent) await d.getByLabel('Accent colour').fill(accent.toLowerCase())
  if (heading) await d.getByLabel('Heading font in kit').selectOption(heading)
  if (body) await d.getByLabel('Body font in kit').selectOption(body)
}
/** make a kit through the page and save it */
export async function makeKit(p, spec) {
  await p.getByRole('button', { name: 'New brand kit' }).click(); await details(p).waitFor({ timeout: 8000 })
  await fillKit(p, spec)
  await details(p).getByRole('button', { name: 'Save kit' }).click(); await p.getByText('Saved.').waitFor({ timeout: 8000 })
}
export const kitsOf = async (A) => (await api.get(A, '/brand/kits')).data
export async function deleteAllKits(A) { for (const k of (await kitsOf(A)).kits) await api.del(A, `/brand/kits/${k.id}`) }
export const assetOk = async (A, url) => { const r = await A.ctx.request.get(url); return r.ok() }
