// When each page of the website last really changed, from git: the newest commit date of the files that make up its content. Written to
// lib/page-dates.generated.json before every build (package.json "prebuild"); the sitemap and the pages' metadata read it (lib/page-dates.ts), so search and
// answer engines get true dates instead of none (or "now", which they learn to ignore).
// Where there is no git history (inside the Docker build, or a shallow clone) the file made on the host is kept as it is.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(WEB, 'lib/page-dates.generated.json')
const git = (...a) => execFileSync('git', a, { cwd: WEB, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
let ok = false
try { ok = git('rev-parse', '--is-shallow-repository') === 'false' } catch { /* no git here */ }
if (!ok) { if (!existsSync(OUT)) writeFileSync(OUT, '{}\n'); console.log('page dates: no full git history here, kept', relative(WEB, OUT)); process.exit(0) }

/** newest commit date (ISO) of any of these paths (files or folders, relative to apps/web) */
const newest = (paths) => { const d = git('log', '-1', '--format=%cI', '--', ...paths.map((p) => join(WEB, p))); return d || null }
/** the content of a route beyond its own page file */
const EXTRA = {
  '/': ['components/sections', 'lib/faq.ts'],
  '/ai-ppt-maker': ['lib/faq.ts'],
  '/pricing': ['components/sections/PricingSection.tsx', 'lib/faq.ts'],
  '/templates': ['components/templates', 'lib/template-landing.ts'],
  '/free-tools': ['lib/free-tool-list.ts'],
  '/faq': ['lib/faq.ts', 'lib/free-tool-list.ts'],
  '/about': ['lib/seo.ts', 'lib/free-tool-list.ts', 'lib/legal.ts'],
}
const pages = []
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (n === 'page.tsx') pages.push(p) } }
walk(join(WEB, 'app'))
const out = {}
for (const f of pages) {
  const rel = relative(join(WEB, 'app'), f).replace(/\/?page\.tsx$/, '')
  const route = '/' + rel.split('/').filter((s) => s && !/^\(.*\)$/.test(s)).join('/')
  const deps = [relative(WEB, f), ...(EXTRA[route] ?? [])]
  // dynamic routes: one date for all their pages, from the page file and the data behind them
  if (route.includes('[')) {
    const key = route.replace(/\/\[[^\]]+\]/g, '/*')
    const data = { '/templates/*': ['components/templates', '../../packages/theme/src/templates'], '/free-templates/*': ['lib/template-landing.ts', 'components/templates'], '/morph-animation-templates/*': ['lib/morph-categories.ts', 'lib/morph-page.ts', 'lib/morph-demos.ts'] }[key] ?? []
    const d = newest([...deps, ...data]); if (d) out[key] = d
    continue
  }
  if (route.startsWith('/free-tools/')) deps.push('components/free-tools/ToolShell.tsx')
  const d = newest(deps); if (d) out[route] = d
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
console.log(`page dates: ${Object.keys(out).length} routes written to ${relative(WEB, OUT)}`)
