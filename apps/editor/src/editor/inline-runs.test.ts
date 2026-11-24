import { describe, expect, it } from 'vitest'
import { isRunBold, isRunItalic, runWeight, textBaseWeight, type TextElement } from '@prompttoppt/validation'
import { canonicalRuns, cssHex, inlineBase, runSpanStyle } from './inline-runs'
import * as C from './commands'

const resolve = (c: string) => ({ textPrimary: '#111827', accent: '#F59E0B', primary: '#2563EB' } as Record<string, string>)[c] ?? c
const box = (role: TextElement['role'], extra: Partial<TextElement> = {}) => ({ role, color: 'textPrimary', ...extra }) as TextElement

describe('one rule for how text is drawn (slide, editor, toolbar, assistant, PowerPoint)', () => {
  it('a box draws at its role weight unless it sets one', () => {
    expect(textBaseWeight(box('title'))).toBe(800)
    expect(textBaseWeight(box('subtitle'))).toBe(700) // the export used to treat a subtitle as plain
    expect(textBaseWeight(box('body'))).toBe(400)
    expect(textBaseWeight(box('heading', { weight: 500 }))).toBe(500)
  })
  it('bold on / off / not set on a run', () => {
    expect(runWeight({ bold: true }, box('body'))).toBe(700)
    expect(runWeight({ bold: true }, box('title'))).toBe(800) // never lighter than the box
    expect(runWeight({ bold: false }, box('title'))).toBe(400) // off overrides the title's weight
    expect(isRunBold({}, box('subtitle'))).toBe(true)
    expect(isRunItalic({}, box('quote'))).toBe(true)
    expect(isRunItalic({ italic: false }, box('quote'))).toBe(false)
  })
})

describe('canonicalRuns: closing a box without changing anything is not an edit', () => {
  const title = box('title')
  const base = inlineBase(title, resolve)
  it('drops flags that only repeat the box look, joins same-style neighbours, trims the end', () => {
    expect(canonicalRuns([{ runs: [{ text: 'Grow ', bold: true }, { text: 'revenue', bold: true }, { text: '  ' }] }], base, resolve)).toEqual([{ runs: [{ text: 'Grow revenue' }] }])
  })
  it('keeps what really differs: a word set to normal weight, a coloured word, underline, a link', () => {
    const out = canonicalRuns([{ runs: [{ text: 'Grow ' }, { text: 'revenue', bold: false, color: 'accent' }, { text: ' fast', underline: true, link: 'https://a.example' }] }], base, resolve)
    expect(out).toEqual([{ runs: [{ text: 'Grow ' }, { text: 'revenue', bold: false, color: 'accent' }, { text: ' fast', underline: true, link: 'https://a.example' }] }])
  })
  it('a word coloured with the box own colour is not a coloured word; hex spelling does not matter', () => {
    expect(canonicalRuns([{ runs: [{ text: 'a' }, { text: 'b', color: '#111827' }] }], base, resolve)).toEqual([{ runs: [{ text: 'ab' }] }])
    expect(canonicalRuns([{ runs: [{ text: 'a', color: '#dc2626' }] }], base, resolve)).toEqual([{ runs: [{ text: 'a', color: '#DC2626' }] }])
  })
  it('empty paragraphs go unless nothing is left; a list keeps its kind', () => {
    expect(canonicalRuns([{ runs: [{ text: 'One' }], list: 'bullet' }, { runs: [{ text: '' }], list: 'bullet' }], base, resolve)).toEqual([{ runs: [{ text: 'One' }], list: 'bullet' }])
    expect(canonicalRuns([{ runs: [{ text: ' ' }], list: 'bullet' }], base, resolve)).toEqual([{ runs: [{ text: '' }], list: 'bullet' }])
  })
})

describe('the editor draws a styled word the way the slide does', () => {
  const base = inlineBase(box('title'), resolve)
  it('bold off on a title word is drawn at normal weight; a theme colour as its real colour', () => {
    expect(runSpanStyle({ text: 'x', bold: false }, base, resolve)).toEqual({ fontWeight: 400 })
    expect(runSpanStyle({ text: 'x', color: 'accent', underline: true }, base, resolve)).toEqual({ textDecoration: 'underline', color: '#F59E0B' })
  })
  it('reads the colours a browser writes', () => {
    expect(cssHex('rgb(220, 38, 38)')).toBe('#DC2626')
    expect(cssHex('#d23')).toBe('#DD2233')
    expect(cssHex('red')).toBeNull()
  })
})

describe('the toolbar B / I / U on a whole box', () => {
  const deck = (el: Partial<TextElement>) => ({ slides: [{ id: 's', elements: [{ id: 't', type: 'text', role: 'body', color: 'textPrimary', paragraphs: [{ runs: [{ text: 'Hello ' }, { text: 'world', bold: true }] }], ...el }] }] }) as never
  const el = (d: { slides: { elements: TextElement[] }[] }) => d.slides[0]!.elements[0]!
  it('shows pressed only when EVERY word is drawn that way (one bold word does not make the box bold)', () => {
    const d = deck({})
    expect(C.boxHasFlag(el(d), 'bold')).toBe(false)
    C.setRunFlag(d, 's', 't', 'bold', true)
    expect(C.boxHasFlag(el(d), 'bold')).toBe(true)
    expect(C.boxHasFlag(el(deck({ role: 'title', paragraphs: [{ runs: [{ text: 'T' }] }] })), 'bold')).toBe(true) // a title is bold by its role
  })
  it('italic off on a quote really makes it upright (a quote is italic by its role)', () => {
    const d = deck({ role: 'quote', paragraphs: [{ runs: [{ text: 'Q' }] }] })
    expect(C.boxHasFlag(el(d), 'italic')).toBe(true)
    C.setRunFlag(d, 's', 't', 'italic', false)
    expect(C.boxHasFlag(el(d), 'italic')).toBe(false)
    expect(el(d).paragraphs[0]!.runs[0]!.italic).toBe(false)
  })
})

describe('highlighted words (a marker colour) keep their highlight through editing', () => {
  const base = inlineBase(box('body'), resolve)
  it('a highlighted word is its own run (neighbours with the same highlight join); drawn as a background like the slide', () => {
    expect(canonicalRuns([{ runs: [{ text: 'Grow ' }, { text: 'revenue', highlight: '#fff176' as never }, { text: ' fast' }] }], base, resolve)).toEqual([{ runs: [{ text: 'Grow ' }, { text: 'revenue', highlight: '#FFF176' }, { text: ' fast' }] }])
    expect(canonicalRuns([{ runs: [{ text: 'a', highlight: '#FFF176' as never }, { text: 'b', highlight: '#FFF176' as never }] }], base, resolve)).toEqual([{ runs: [{ text: 'ab', highlight: '#FFF176' }] }])
    expect(runSpanStyle({ text: 'x', highlight: '#FFF176' as never }, base, resolve)).toMatchObject({ backgroundColor: '#FFF176' })
  })
})

describe('text box effects', () => {
  it('shadow and outline for every selected text box in one step; null takes them off; the width stays within its range', async () => {
    const { produce } = await import('immer')
    const { setTextEffects } = await import('./text-effects')
    type Doc = import('@prompttoppt/validation').Presentation
    const d0 = { slides: [{ id: 's', elements: [{ id: 'a', type: 'text' }, { id: 'b', type: 'text' }, { id: 'p', type: 'shape' }] }] } as unknown as Doc
    let n = 0
    const d = produce(d0, (x) => { n = setTextEffects(x, 's', ['a', 'b', 'p'], { textShadow: 'soft', textOutline: { color: 'accent', width: 40 } }) })
    const els = d.slides[0]!.elements as unknown as Record<string, unknown>[]
    expect(n).toBe(2)
    expect(els[0]).toMatchObject({ textShadow: 'soft', textOutline: { color: 'accent', width: 12 } })
    expect('textShadow' in els[2]!).toBe(false)
    const off = produce(d, (x) => { setTextEffects(x, 's', ['a'], { textShadow: null, textOutline: null }) })
    const a = off.slides[0]!.elements[0] as unknown as Record<string, unknown>
    expect('textShadow' in a || 'textOutline' in a).toBe(false)
  })
})
