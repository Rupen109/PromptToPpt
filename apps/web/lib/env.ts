// NEXT_PUBLIC_* must be referenced statically so Next can inline them at build time.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
export const EDITOR_URL = process.env.NEXT_PUBLIC_EDITOR_URL ?? 'http://localhost:3001'
export const GOOGLE_AUTH = process.env.NEXT_PUBLIC_GOOGLE_AUTH === 'true'
export const MICROSOFT_AUTH = process.env.NEXT_PUBLIC_MICROSOFT_AUTH === 'true'
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
// Where people can reach us besides the form. The e-mail is shown as a link; the WhatsApp number (digits with country code, e.g. 919876543210) only if set.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@slidesdone.app'
export const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? ''
