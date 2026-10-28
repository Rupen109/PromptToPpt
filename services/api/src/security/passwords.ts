import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { env } from '../env.ts'

/** Share-link passwords: scrypt with a per-link salt, constant-time compare. (Account passwords are handled by Better Auth.) */
export function hashSharePassword(pw: string): string {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 32, { N: 16384 }).toString('hex')}`
}
export function verifySharePassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const want = Buffer.from(hashHex, 'hex')
  const got = scryptSync(pw, Buffer.from(saltHex, 'hex'), want.length, { N: 16384 })
  return got.length === want.length && timingSafeEqual(got, want)
}

const ACCESS_TTL_MS = 12 * 3600_000
const sign = (token: string, exp: number, passwordHash: string) => createHmac('sha256', env.AUTH_SECRET).update(`share|${token}|${exp}|${passwordHash.slice(0, 32)}`).digest('base64url')
/** A short-lived proof that the viewer entered the right password. It dies when the password changes (the hash is part of the signature). */
export const issueShareAccess = (token: string, passwordHash: string, now = Date.now()) => { const exp = now + ACCESS_TTL_MS; return `${exp}.${sign(token, exp, passwordHash)}` }
export function checkShareAccess(proof: string | undefined, token: string, passwordHash: string, now = Date.now()): boolean {
  if (!proof) return false
  const [expS, mac] = proof.split('.')
  const exp = Number(expS)
  if (!Number.isFinite(exp) || exp < now || !mac) return false
  const want = Buffer.from(sign(token, exp, passwordHash)), got = Buffer.from(mac)
  return want.length === got.length && timingSafeEqual(want, got)
}
