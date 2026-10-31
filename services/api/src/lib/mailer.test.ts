import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../env.ts'
import { deliverMail, isReservedAddress, mailOutbox, parseFrom, sendMail } from './mailer.ts'

const saved = { RESEND_API_KEY: env.RESEND_API_KEY, BREVO_API_KEY: env.BREVO_API_KEY, EMAIL_FROM: env.EMAIL_FROM, NODE_ENV: env.NODE_ENV }
afterEach(() => { Object.assign(env, saved); vi.unstubAllGlobals(); mailOutbox.length = 0 })
const stubFetch = (ok = true) => { const f = vi.fn(async () => ({ ok, status: ok ? 201 : 401 }) as Response); vi.stubGlobal('fetch', f); return f }
const mail = { to: 'ann@example.com', subject: 'Hi', text: 'Body' }

describe('parseFrom', () => {
  it('reads "Name <address>", a quoted name and a bare address', () => {
    expect(parseFrom('SlidesDone <hello@slidesdone.com>')).toEqual({ name: 'SlidesDone', email: 'hello@slidesdone.com' })
    expect(parseFrom('"Slides, Done" <hello@slidesdone.com>')).toEqual({ name: 'Slides, Done', email: 'hello@slidesdone.com' })
    expect(parseFrom('hello@slidesdone.com')).toEqual({ email: 'hello@slidesdone.com' })
    expect(parseFrom('<hello@slidesdone.com>')).toEqual({ email: 'hello@slidesdone.com' })
  })
})

describe('sendMail providers', () => {
  it('Brevo: posts to the Brevo API with the api-key header, a parsed sender and the text body', async () => {
    Object.assign(env, { BREVO_API_KEY: 'xkeysib-test-0123456789', RESEND_API_KEY: undefined, EMAIL_FROM: 'SlidesDone <hello@slidesdone.com>' })
    const f = stubFetch()
    await deliverMail(mail)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-test-0123456789')
    expect(JSON.parse(init.body as string)).toEqual({ sender: { name: 'SlidesDone', email: 'hello@slidesdone.com' }, to: [{ email: 'ann@example.com' }], subject: 'Hi', textContent: 'Body' })
    expect(mailOutbox).toHaveLength(0)
  })

  it('Brevo wins when both keys are set; Resend is used when only its key is set', async () => {
    Object.assign(env, { BREVO_API_KEY: 'xkeysib-test-0123456789', RESEND_API_KEY: 're_test_0123456789', EMAIL_FROM: 'hello@slidesdone.com' })
    const f = stubFetch(); await deliverMail(mail)
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('brevo.com')
    Object.assign(env, { BREVO_API_KEY: undefined })
    const g = stubFetch(); await deliverMail(mail)
    const [url, init] = g.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(init.body as string)).toMatchObject({ from: 'hello@slidesdone.com', to: ['ann@example.com'], subject: 'Hi', text: 'Body' })
  })

  it('a refused send throws (callers report it) and never leaks the key', async () => {
    Object.assign(env, { BREVO_API_KEY: 'xkeysib-test-0123456789', EMAIL_FROM: 'hello@slidesdone.com' })
    stubFetch(false)
    await expect(deliverMail(mail)).rejects.toThrow('mail provider answered 401')
    await expect(deliverMail(mail)).rejects.not.toThrow(/xkeysib/)
  })

  it('with no key (development / tests) the mail is kept in the outbox instead of being sent', async () => {
    Object.assign(env, { BREVO_API_KEY: undefined, RESEND_API_KEY: undefined, EMAIL_FROM: undefined })
    const f = stubFetch()
    await deliverMail(mail)
    expect(f).not.toHaveBeenCalled()
    expect(mailOutbox).toEqual([mail])
  })
})

describe('sendMail never sends to a fake or test address, and never from the test suite', () => {
  it('reserved example / test domains stay in the outbox even when a provider key is set', async () => {
    Object.assign(env, { NODE_ENV: 'development', BREVO_API_KEY: 'xkeysib-test-0123456789', EMAIL_FROM: 'hello@slidesdone.com' })
    const f = stubFetch()
    try {
      for (const to of ['a@example.com', 'a@mail.example.org', 'qa123@example.net', 'x@foo.test', 'x@nowhere.invalid', 'x@box.localhost']) await sendMail({ ...mail, to })
      expect(f).not.toHaveBeenCalled()
      expect(mailOutbox).toHaveLength(6)
      await sendMail({ ...mail, to: 'real.person@gmail.com' })
      expect(f).toHaveBeenCalledTimes(1)
    } finally { Object.assign(env, { NODE_ENV: 'test' }) }
  })
  it('the test suite itself never reaches a provider', async () => {
    Object.assign(env, { BREVO_API_KEY: 'xkeysib-test-0123456789', EMAIL_FROM: 'hello@slidesdone.com' })
    const f = stubFetch()
    await sendMail({ ...mail, to: 'real.person@gmail.com' })
    expect(f).not.toHaveBeenCalled()
    expect(mailOutbox).toHaveLength(1)
  })
  it('recognises reserved domains and nothing else', () => {
    expect(isReservedAddress('a@example.com')).toBe(true)
    expect(isReservedAddress('a@notexample.com')).toBe(false)
    expect(isReservedAddress('a@gmail.com')).toBe(false)
  })
})
