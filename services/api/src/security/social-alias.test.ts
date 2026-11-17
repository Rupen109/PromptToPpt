import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { existingAddressFor } from '../auth.ts'

/**
 * Signing in with Google/Microsoft when the account was made by password with the same mailbox written another way (dots or a +tag): the provider's address is pointed at the
 * existing account so it links, instead of being refused as "User already exists. Use another email."
 */
describe('social sign-in with an alias of an existing mailbox', () => {
  const tag = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 8)
  const stored = `jane.doe${tag}@gmail.com`
  const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'

  it('points a verified provider address at the existing account; leaves everything else alone', async () => {
    const up = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': `198.51.100.${1 + Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ email: stored, password: 'a-long-password-1', name: 'J' }) })
    expect(up.status).toBe(200)

    // the same mailbox written another way, verified by the provider: matched to the stored address
    expect(await existingAddressFor({ email: `janedoe${tag}@gmail.com`, email_verified: true })).toEqual({ email: stored })
    expect(await existingAddressFor({ email: `jane.doe${tag}+work@gmail.com`, email_verified: true })).toEqual({ email: stored })
    // the exact address needs no help
    expect(await existingAddressFor({ email: stored.toUpperCase(), email_verified: true })).toEqual({})
    // an address the provider did not verify is never matched to someone's account
    expect(await existingAddressFor({ email: `janedoe${tag}@gmail.com`, email_verified: false })).toEqual({})
    expect(await existingAddressFor({ email: `janedoe${tag}@gmail.com` })).toEqual({})
    // somebody else
    expect(await existingAddressFor({ email: `someone.else${tag}@gmail.com`, email_verified: true })).toEqual({})
  })
})
