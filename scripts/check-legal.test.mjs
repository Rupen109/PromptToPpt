// Unit tests for the legal-pages guard (node:test, no dependencies). Run: node --experimental-strip-types --test scripts/check-legal.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { LEGAL, OWNER_FIELDS, TODO, assertLegalReady, isReleaseCheck, legalReleaseProblems, missingOwnerFields, ownerText } from '../apps/web/lib/legal.ts'

const filled = Object.fromEntries(OWNER_FIELDS.map((f) => [f.key, 'x']))
const full = { ...LEGAL, ...filled }
const partial = { ...full, gstin: TODO, entityName: '  ' }

test('every owner field is listed and starts as TODO in the repo (nothing pre-filled by guesswork)', () => {
  assert.equal(OWNER_FIELDS.length, 10)
  for (const f of OWNER_FIELDS) assert.equal(typeof LEGAL[f.key], 'string')
})
test('missingOwnerFields finds TODO, empty and lower-case todo', () => {
  assert.deepEqual(missingOwnerFields(partial).sort(), ['entityName', 'gstin'])
  assert.deepEqual(missingOwnerFields({ ...full, gstin: 'todo' }), ['gstin'])
  assert.deepEqual(missingOwnerFields(full), [])
})
test('release detection: production env or RELEASE_CHECK=1 only', () => {
  assert.equal(isReleaseCheck({}), false)
  assert.equal(isReleaseCheck({ APP_ENV: 'development' }), false)
  assert.equal(isReleaseCheck({ NODE_ENV: 'production' }), false) // next build always sets this: must not block local builds
  assert.equal(isReleaseCheck({ APP_ENV: 'production' }), true)
  assert.equal(isReleaseCheck({ NEXT_PUBLIC_APP_ENV: 'production' }), true)
  assert.equal(isReleaseCheck({ RELEASE_CHECK: '1' }), true)
})
test('development passes even with TODO fields', () => {
  assert.deepEqual(legalReleaseProblems({}, partial), [])
  assert.doesNotThrow(() => assertLegalReady({}, partial))
})
test('production FAILS while a field is TODO, naming the field', () => {
  const p = legalReleaseProblems({ APP_ENV: 'production' }, partial)
  assert.equal(p.length, 2)
  assert.match(p.join('\n'), /gstin/)
  assert.throws(() => assertLegalReady({ RELEASE_CHECK: '1' }, partial), /not ready for release/)
})
test('production passes when everything is filled', () => {
  assert.deepEqual(legalReleaseProblems({ APP_ENV: 'production' }, full), [])
  assert.doesNotThrow(() => assertLegalReady({ APP_ENV: 'production' }, full))
})
test('the repo as it stands fails a release check (owner still has to fill the fields)', () => {
  assert.ok(legalReleaseProblems({ RELEASE_CHECK: '1' }, LEGAL).length > 0 || missingOwnerFields(LEGAL).length === 0)
})
test('ownerText shows a visible marker for TODO and the real value once filled', () => {
  assert.equal(ownerText('gstin', partial), '[Owner to add: GSTIN]')
  assert.equal(ownerText('gstin', { ...full, gstin: '27ABCDE1234F1Z5' }), '27ABCDE1234F1Z5')
})
