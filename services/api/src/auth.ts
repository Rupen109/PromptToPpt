import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { haveIBeenPwned } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db/index.ts'
import * as schema from './db/schema.ts'
import { env, isProd } from './env.ts'
import { countryFromHeaders } from './lib/country.ts'
import { sendMail } from './lib/mailer.ts'
import { canonicalEmail } from './security/email.ts'

/**
 * Single identity provider for web (Next.js) and editor (React).
 * Session cookie is httpOnly; in production it is scoped to COOKIE_DOMAIN
 * (e.g. .prompttoppt.app) so www/app/api subdomains share one login.
 */
export const auth = betterAuth({
  baseURL: env.API_URL,
  secret: env.AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  trustedOrigins: [env.WEB_URL, env.EDITOR_URL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128, // hashing cost is per byte: unbounded passwords are a CPU-exhaustion attack
    // Unverified addresses cannot sign in, so they cannot spend anything: this is what stops free-credit farming with made-up mailboxes.
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    autoSignIn: !env.REQUIRE_EMAIL_VERIFICATION,
    revokeSessionsOnPasswordReset: true, // a reset signs the attacker out too
    sendResetPassword: async ({ user, url }) => {
      await sendMail({ to: user.email, subject: 'Reset your promptToPpt password', text: `Reset your password (link valid for one hour):\n${url}\n\nIf you did not ask for this, ignore this email.` })
    },
  },
  emailVerification: {
    sendOnSignUp: env.REQUIRE_EMAIL_VERIFICATION,
    sendOnSignIn: env.REQUIRE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({ to: user.email, subject: 'Confirm your email for promptToPpt', text: `Confirm your email address to start creating:\n${url}\n\nIf you did not sign up, ignore this email.` })
    },
  },
  // Better Auth's own limiter mis-buckets behind multi-hop proxies (one shared bucket for everyone); ours is database-backed, see security/auth-guard.ts
  rateLimit: { enabled: false },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {},
  databaseHooks: {
    user: {
      create: {
        // Record the signup country from our edge header (analytics + pricing display). Null if unknown.
        before: async (user, ctx) => {
          const country = ctx?.request ? countryFromHeaders(ctx.request.headers) : null
          // One mailbox = one account, whichever way it arrives (password sign-up or Google): `a+1@gmail.com` cannot farm a second allowance.
          const emailCanonical = canonicalEmail(user.email)
          const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.emailCanonical, emailCanonical)).limit(1)
          if (existing) throw new APIError('UNPROCESSABLE_ENTITY', { message: 'User already exists. Use another email.' })
          return { data: { ...user, country, emailCanonical } }
        },
      },
    },
  },
  user: {
    additionalFields: {
      // input:false → clients can never set their own role at signup/update
      role: { type: 'string', defaultValue: 'user', input: false },
      country: { type: 'string', required: false, input: false },
      emailCanonical: { type: 'string', required: false, input: false },
    },
  },
  // known-breached passwords are refused (k-anonymity lookup: only a hash prefix leaves the server). Production only: it needs the network.
  plugins: isProd ? [haveIBeenPwned({ customPasswordCompromisedMessage: 'That password appears in known data breaches. Please choose a different one.' })] : [],
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  advanced: {
    useSecureCookies: isProd,
    ...(env.COOKIE_DOMAIN ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } } : {}),
  },
})

export type Session = typeof auth.$Infer.Session
