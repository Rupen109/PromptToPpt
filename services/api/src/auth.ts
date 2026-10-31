import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { haveIBeenPwned } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db/index.ts'
import * as schema from './db/schema.ts'
import { env, isProd } from './env.ts'
import { countryFromHeaders } from './lib/country.ts'
import * as mail from './lib/email-templates.ts'
import { sendMail } from './lib/mailer.ts'
import { canonicalEmail } from './security/email.ts'

/**
 * Single identity provider for web (Next.js) and editor (React).
 * Session cookie is httpOnly; in production it is scoped to COOKIE_DOMAIN
 * (e.g. .slidesdone.app) so www/app/api subdomains share one login.
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
      await sendMail({ to: user.email, ...mail.resetPassword({ name: user.name, url }) })
    },
    // a reset signs everyone out (see above): tell the owner of the mailbox, in case it was not them
    onPasswordReset: async ({ user }) => {
      await sendMail({ to: user.email, ...mail.passwordChanged({ name: user.name }) }).catch((e) => console.error('[password-changed mail]', (e as Error).message))
    },
  },
  emailVerification: {
    sendOnSignUp: env.REQUIRE_EMAIL_VERIFICATION,
    sendOnSignIn: env.REQUIRE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({ to: user.email, ...mail.verifyEmail({ name: user.name, url }) })
    },
    // the account is real now: say hello (best effort, never blocks the sign-in)
    afterEmailVerification: async (user) => {
      await sendMail({ to: user.email, ...mail.welcome({ name: user.name }) }).catch((e) => console.error('[welcome mail]', (e as Error).message))
    },
  },
  // Better Auth's own limiter mis-buckets behind multi-hop proxies (one shared bucket for everyone); ours is database-backed, see security/auth-guard.ts
  rateLimit: { enabled: false },
  // each button on the log-in page appears only when its keys are set (see NEXT_PUBLIC_*_AUTH on the website)
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {}),
    ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET ? { microsoft: { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, tenantId: env.MICROSOFT_TENANT_ID } } : {}),
  },
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
        // Google / Microsoft sign-ups arrive already verified (no confirmation mail, so no "afterEmailVerification"): welcome them here
        after: async (user) => {
          if (user.emailVerified) await sendMail({ to: user.email, ...mail.welcome({ name: user.name }) }).catch((e) => console.error('[welcome mail]', (e as Error).message))
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
