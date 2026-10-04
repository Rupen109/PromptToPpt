import { describe, expect, it } from 'vitest'
import { canonicalEmail, isDisposableEmail } from './email.ts'

describe('email identity (security S2)', () => {
  it('collapses plus-tags, gmail dots and googlemail to one address', () => {
    const same = ['jane.doe@gmail.com', 'janedoe@gmail.com', 'Jane.Doe+promo1@Gmail.com', 'j.a.n.e.d.o.e+x+y@googlemail.com', ' JANEDOE@GMAIL.COM ']
    expect(new Set(same.map(canonicalEmail)).size).toBe(1)
    expect(canonicalEmail('Jane.Doe+a@Gmail.com')).toBe('janedoe@gmail.com')
  })
  it('keeps dots for other providers (they are significant there) but strips +tags', () => {
    expect(canonicalEmail('first.last+news@example.org')).toBe('first.last@example.org')
    expect(canonicalEmail('first.last@example.org')).not.toBe(canonicalEmail('firstlast@example.org'))
  })
  it('blocks disposable providers, their subdomains, and configured extras', () => {
    expect(isDisposableEmail('x@mailinator.com')).toBe(true)
    expect(isDisposableEmail('x@sub.guerrillamail.com')).toBe(true)
    expect(isDisposableEmail('x@YOPMAIL.com')).toBe(true)
    expect(isDisposableEmail('x@evil-temp.test', ['evil-temp.test'])).toBe(true)
    expect(isDisposableEmail('x@gmail.com')).toBe(false)
    expect(isDisposableEmail('x@company.io')).toBe(false)
  })
})
