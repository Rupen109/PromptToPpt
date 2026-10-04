import { describe, expect, it } from 'vitest'
import { safeRedirect } from './index'

const allowed = ['https://app.prompttoppt.app', 'https://prompttoppt.app']
const fb = '/'

describe('safeRedirect', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['https://app.prompttoppt.app/start?draft=abc', 'https://app.prompttoppt.app/start?draft=abc'],
  ])('allows %s', (input, out) => expect(safeRedirect(input, allowed, fb)).toBe(out))

  it.each([
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'https://app.prompttoppt.app.evil.com/x',
    'javascript:alert(1)',
    'data:text/html,hi',
    '',
    null,
    undefined,
  ])('rejects %s', (input) => expect(safeRedirect(input, allowed, fb)).toBe(fb))
})
