// Writes a template's demo (the slides of the website's live preview) as JSON: run by scripts/morph-preview.mjs through tsx.
import { demoSlides } from '../packages/theme/src/morph-templates/index.ts'
import { writeFileSync } from 'node:fs'
const [out, id] = [process.argv[2]!, process.argv[3]!]
const d = demoSlides(id, process.env.ASSET_BASE ?? 'http://localhost:3100')
writeFileSync(out, JSON.stringify({ theme: d.theme, slides: d.slides, titles: d.titles }))
console.log(`${d.slides.length} scenes`)
