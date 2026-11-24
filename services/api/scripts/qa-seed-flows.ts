/** QA only — the slides the live flow suite (e2e 90) puts in a deck, composed by the real layout engine:  tsx scripts/qa-seed-flows.ts <themeId>  → JSON array of slides on stdout. */
import { composeSlide, getTheme } from '@prompttoppt/theme'

const theme = getTheme(process.argv[2] ?? '')
let n = 0
const make = (id: string, content: unknown) => ({ id, locked: false, validation: { status: 'passed', issues: [] }, ...composeSlide(content as never, theme, '16:9', () => `q${n++}`) })
const wall = ['We started the company to make planning calm, clear and shared across every single team in the building, not only for the managers.', 'Our customers told us that they spend far too many hours every week copying numbers between spreadsheets, slides and long email threads.', 'The first version of the product was built in four months by a small team that talked to customers every day and changed course often.', 'Today more than two thousand teams use it, and the most common thing they tell us is that meetings are shorter and decisions are clearer.', 'Next year we plan to open three new regional offices, hire support staff in each, and publish guides in six more languages for our readers.', 'We also want to make the product work well on phones, because a growing share of our customers read their plans while they travel to work.']
const slides = [
  make('f1', { layout: 'title', title: 'Flow check', subtitle: 'Three flows, one deck', speakerNotes: '', sources: [] }),
  make('f2', { layout: 'title-body', title: 'Our story so far', bullets: wall, speakerNotes: '', sources: [] }),
  make('f3', { layout: 'table', title: 'Plans and prices', header: ['Plan', 'Price'], rows: [['Basic', '$10'], ['Pro', '$30'], ['Team', '$60']], speakerNotes: '', sources: [] }),
  make('f4', { layout: 'title-body', title: 'Hiring and offices', bullets: ['We will hire two engineers this year', 'We will hire a designer in spring', 'A new office opens in Pune in June', 'A second office opens in Leeds in September'], speakerNotes: '', sources: [] }),
  make('f5', { layout: 'thank-you', title: 'Thank you', subtitle: 'Questions are welcome', speakerNotes: '', sources: [] }),
]
console.log(JSON.stringify(slides))
