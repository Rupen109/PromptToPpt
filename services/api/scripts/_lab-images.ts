import { existsSync, writeFileSync } from 'node:fs'
import { gateway } from '../src/ai/gateway.ts'
import { env } from '../src/env.ts'

const NO = 'No text, no letters, no logos, no watermark. Ultra high quality, professional.'
const SHOTS: [string, '16:9' | '3:4' | '1:1' | '4:3', string][] = [
  ['a-hero', '16:9', 'Cinematic wide photograph of a modern city skyline at blue hour, deep navy and teal sky with a soft glowing mint-green aurora of light above, reflections on glass towers, dramatic, premium editorial look.'],
  ['a-team', '3:4', 'Four diverse startup colleagues collaborating around a table in a bright modern office, candid editorial photograph, natural window light, teal accents, shallow depth of field.'],
  ['a-chaos', '3:4', 'Frustrated young founder at a laptop late at night surrounded by sticky notes and spreadsheets, moody cinematic blue-teal light, shallow depth of field.'],
  ['a-device', '1:1', 'Premium 3D render of a floating glass smartphone showing an abstract analytics dashboard with glowing mint-green charts, dark navy background, soft reflections, studio lighting.'],
  ['a-night', '16:9', 'Long-exposure photograph of a glowing highway interchange at dusk with flowing light trails, deep teal and navy tones, cinematic landscape.'],
  ['s-group', '1:1', 'Joyful group of diverse young friends laughing together taking a selfie on a sunny rooftop, vibrant colors with orange and pink tones, candid lifestyle photograph.'],
  ['s-p1', '3:4', 'Studio portrait of a confident young woman with curly hair wearing a bright yellow jacket, solid warm orange background, fashion editorial.'],
  ['s-p2', '3:4', 'Studio portrait of a smiling man in his thirties with round glasses and a denim shirt, solid hot pink background, fashion editorial.'],
  ['s-p3', '3:4', 'Studio portrait of a cheerful teenager with headphones around the neck, solid sunny yellow background, fashion editorial.'],
  ['s-mega', '1:1', 'Glossy orange 3D-rendered megaphone with colorful confetti bursting out, playful, soft shadows, isolated on a pale peach background, high-end 3D illustration, studio lighting.'],
  ['s-flat', '16:9', 'Colorful top-down flat lay of a marketing team creative desk: sketchbook, color swatches, smartphone, headphones, sticky notes in orange pink and yellow, bright and energetic.'],
  ['c-class', '3:4', 'Bright classroom with diverse enthusiastic students raising their hands while a smiling teacher looks on, warm golden window light, editorial photograph.'],
  ['c-teacher', '4:3', 'Teacher writing a simple diagram on a whiteboard while attentive students watch, warm natural light, editorial photograph.'],
  ['c-study', '4:3', 'Three university students studying together at a wooden library table with open books and laptops, warm cozy light, editorial photograph.'],
  ['c-books', '4:3', 'Warm still-life of stacked books, a coffee cup, reading glasses and a notebook on a wooden desk, golden hour light.'],
  ['c-campus', '16:9', 'Beautiful university campus courtyard with autumn trees at golden hour and students walking, cinematic warm tones.'],
]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const have = (name: string) => ['png', 'jpg'].some((e) => existsSync(`../../apps/web/public/template-lab/${name}.${e}`))
// one at a time; a refusal or quota error sends the shot to the back of the queue instead of hammering it
const tries = new Map<string, number>()
const queue = SHOTS.filter(([n]) => !have(n))
while (queue.length) {
  const [name, aspect, prompt] = queue.shift()!
  const n = (tries.get(name) ?? 0) + 1
  tries.set(name, n)
  try {
    const r = await gateway.image({ model: 'gemini-3.1-flash-image', prompt: `${prompt} ${NO}`, aspectRatio: aspect, ctx: {} })
    writeFileSync(`../../apps/web/public/template-lab/${name}.${r.mime === 'image/jpeg' ? 'jpg' : 'png'}`, r.bytes)
    console.log('ok', name, r.mime, r.bytes.length, `(${queue.length} left)`)
    await sleep(15000)
  } catch (e) {
    console.log('retry-later', name, n, (e as Error).message.slice(0, 50))
    if (n < 6) queue.push([name, aspect, prompt])
    await sleep(30000)
  }
}
console.log('done')
process.exit(0)
