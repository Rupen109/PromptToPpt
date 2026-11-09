import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MORPH_TEMPLATES } from '@prompttoppt/theme/morph-templates'

/** The pictures of every Morph template are files in the web app's public/morph-templates folder: each one must exist, and an SVG must be safe to serve to every visitor. */
const PUBLIC = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'morph-templates')

describe.each(MORPH_TEMPLATES.map((t) => [t.id, t] as const))('Morph template "%s" artwork', (_id, tpl) => {
  const files = [...new Set(Object.values(tpl.pictures).filter((p) => !p.drop && p.src && !/^https?:/.test(p.src)).map((p) => p.src))]
  it('every picture file exists', () => { for (const f of files) expect(existsSync(join(PUBLIC, f)), f).toBe(true) })
  it('every SVG is a plain drawing: no script, no event handler, no outside reference, no embedded picture, no text', () => {
    for (const f of files.filter((x) => x.endsWith('.svg'))) {
      const svg = readFileSync(join(PUBLIC, f), 'utf8')
      expect(svg.trimStart().startsWith('<svg'), f).toBe(true)
      expect(/<script|<foreignObject|<image\b|<iframe|<text\b/i.test(svg), `${f} has something that does not belong`).toBe(false)
      expect(/\son[a-z]+\s*=/i.test(svg), `${f} has an event handler`).toBe(false)
      expect(/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg), `${f} points outside itself`).toBe(false)
      expect(/javascript:|@import|url\(\s*["']?https?:/i.test(svg), `${f} loads something`).toBe(false)
      expect(svg.length, f).toBeLessThan(120_000)
    }
  })
})

/** The template data is large (several MB of scenes), so it must not ride along with every page: the layout engine finds templates through a lookup, and the theme's main entry does not export them. */
describe('the Morph template data stays out of the pages that do not need it', () => {
  const THEME_SRC = join(__dirname, '..', '..', '..', 'packages', 'theme', 'src')
  it('the layout engine imports the lookup and the composer, never the template data', () => {
    const imports = readFileSync(join(THEME_SRC, 'layout', 'index.ts'), 'utf8').match(/from '\.\.\/morph-templates[^']*'/g) ?? []
    expect(imports.length).toBeGreaterThan(0)
    expect(imports.every((m) => /\/(lookup|compose)'/.test(m)), imports.join(' ')).toBe(true)
  })
  it("the theme's main entry does not export the templates (they have their own entry point)", () => {
    const code = readFileSync(join(THEME_SRC, 'index.ts'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toMatch(/morph-templates/)
  })
})
