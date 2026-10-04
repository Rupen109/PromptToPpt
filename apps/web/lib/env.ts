// NEXT_PUBLIC_* must be referenced statically so Next can inline them at build time.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
export const EDITOR_URL = process.env.NEXT_PUBLIC_EDITOR_URL ?? 'http://localhost:3001'
export const GOOGLE_AUTH = process.env.NEXT_PUBLIC_GOOGLE_AUTH === 'true'
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
