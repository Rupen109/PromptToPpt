import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { hashPassword } from 'better-auth/crypto'
import { auth } from '../auth.ts'
import { db } from '../db/index.ts'
import { account, user } from '../db/schema.ts'
import { canonicalEmail } from '../security/email.ts'

/**
 * An account for an outside reviewer (for example Razorpay checking the site before enabling international payments), made by the owner:
 *  · created already verified, so no confirmation e-mail is sent to a mailbox nobody may be reading;
 *  · past the invite-only sign-up gate (the owner is the one inviting), and still a plain Starter account like any visitor's;
 *  · the first-visit question already answered ("Something else"), so the reviewer lands straight in the product;
 *  · the password hashed by the sign-in system's own (default, scrypt) hasher, so it logs in exactly like any other account. The standalone hasher
 *    from `better-auth/crypto` is used, not `auth.$context`: in production the context version refuses to run outside a web request.
 * Running it again for the same address only resets the password (and keeps it verified): safe to repeat.
 */
export async function upsertReviewAccount(emailRaw: string, password: string, name = 'Reviewer'): Promise<{ id: string; created: boolean }> {
  const email = emailRaw.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That is not an e-mail address.')
  const min = auth.options.emailAndPassword?.minPasswordLength ?? 8
  if (password.length < min) throw new Error(`The password must be at least ${min} characters (the sign-in system refuses shorter ones).`)
  const hash = await hashPassword(password)

  return db.transaction(async (tx) => {
    const [found] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email))
    const now = new Date()
    const id = found?.id ?? nanoid(32)
    if (found) await tx.update(user).set({ emailVerified: true, updatedAt: now }).where(eq(user.id, id))
    else await tx.insert(user).values({ id, name, email, emailCanonical: canonicalEmail(email), emailVerified: true, persona: 'other', personaAt: now, createdAt: now, updatedAt: now })
    const [cred] = await tx.select({ id: account.id }).from(account).where(and(eq(account.userId, id), eq(account.providerId, 'credential')))
    if (cred) await tx.update(account).set({ password: hash, updatedAt: now }).where(eq(account.id, cred.id))
    else await tx.insert(account).values({ id: nanoid(32), accountId: id, providerId: 'credential', userId: id, password: hash, createdAt: now, updatedAt: now })
    return { id, created: !found }
  })
}
