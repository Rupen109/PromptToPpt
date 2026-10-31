// Security response headers for the two browser apps (website = Next.js, editor = Vite static build).
// One definition, used by next.config.ts, vite.config.ts and scripts/gen-security-headers.mjs (nginx / CloudFront / _headers output).
const origin = (u) => { try { return new URL(u).origin } catch { return '' } }

/**
 * @param {{ app: 'web' | 'editor', apiUrl: string, webUrl: string, editorUrl: string, dev?: boolean }} o
 * @returns {[string, string][]}
 */
export function securityHeaders({ app, apiUrl, webUrl, editorUrl, dev = false }) {
  const api = origin(apiUrl), web = origin(webUrl), editor = origin(editorUrl)
  const photos = ['https://images.unsplash.com', 'https://images.pexels.com']
  const turnstile = 'https://challenges.cloudflare.com'
  // Razorpay's checkout loads scripts, beacons and its iframe from several *.razorpay.com hosts (cdn, api, lumberjack, checkout)
  const razorpay = ['https://*.razorpay.com']
  // The website's language button translates the page with Google's free translate widget (the page text is sent to Google; stated in docs/PRIVACY notes)
  const gtranslate = app === 'web' ? ['https://translate.google.com', 'https://translate.googleapis.com', 'https://translate-pa.googleapis.com'] : []
  const gstatic = app === 'web' ? ['https://www.gstatic.com'] : []
  const fonts = { style: 'https://fonts.googleapis.com', font: 'https://fonts.gstatic.com' }
  const list = (...xs) => xs.flat().filter(Boolean).join(' ')

  const csp = {
    'default-src': ["'self'"],
    // Next.js renders inline bootstrap scripts, so the website needs 'unsafe-inline' until a nonce middleware is added (tracked in docs/SECURITY_PLAN.md).
    // The editor is a pure bundle: scripts only from itself and the payment widget.
    'script-src': app === 'web' ? ["'self'", "'unsafe-inline'", dev ? "'unsafe-eval'" : '', turnstile, ...gtranslate, ...gstatic] : ["'self'", razorpay, dev ? "'unsafe-eval' 'unsafe-inline'" : ''],
    'style-src': ["'self'", "'unsafe-inline'", fonts.style, ...gtranslate, ...gstatic],
    'font-src': ["'self'", 'data:', fonts.font],
    'img-src': ["'self'", 'data:', 'blob:', api, web, ...photos, app === 'editor' ? razorpay : '', ...gtranslate, ...gstatic, app === 'web' ? 'https://www.google.com' : '', app === 'web' ? fonts.font : ''],
    // the editor also fetches pictures and fonts with fetch() when it renders exports (PDF/PNG/JPG/HTML)
    'connect-src': app === 'web' ? ["'self'", api, turnstile, ...gtranslate, dev ? 'ws:' : ''] : ["'self'", api, web, ...photos, fonts.style, fonts.font, razorpay, dev ? 'ws:' : ''],
    'frame-src': app === 'web' ? [turnstile, ...gtranslate] : [razorpay],
    'frame-ancestors': ["'none'"], // nobody may embed our pages: no clickjacking of checkout, login or the editor
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", app === 'web' ? editor : ''],
  }
  const header = Object.entries(csp).map(([k, v]) => `${k} ${list(v)}`).join('; ')
  const headers = [
    ['Content-Security-Policy', header],
    ['X-Frame-Options', 'DENY'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com"), accelerometer=(self "https://api.razorpay.com"), gyroscope=(self "https://api.razorpay.com"), magnetometer=(self "https://api.razorpay.com")'],
    ['Cross-Origin-Opener-Policy', 'same-origin-allow-popups'], // the payment widget opens a popup
  ]
  if (!dev) headers.push(['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'])
  return headers
}
