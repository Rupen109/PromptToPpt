import { env } from '../env.ts'

/**
 * Every e-mail SlidesDone sends, designed once. Each template returns a subject, a plain-text body and an HTML body that share the same facts.
 *
 * Rules that keep these safe and reliable:
 *  - Everything a person typed (names, deck titles, messages) goes through `esc()` before it reaches HTML; links only ever start with http(s).
 *  - Subjects are one line (no header injection) and carry no emoji or symbols.
 *  - Layout is tables with inline styles at 560 px: the only thing every mail app (Gmail, Outlook, Apple Mail, phones) renders the same way.
 *    The only picture is the logo at the top (a PNG on the website, with the words as its alt text); if a mail app blocks images, the mail still reads fine.
 *  - The brand colours come from `packages/theme/src/tokens.css` (cobalt blue, yellow, navy ink).
 */
export interface Rendered { subject: string; text: string; html: string }

const BLUE = '#0b3dd0'
const INK = '#181b25'
const MUTED = '#475569'
const SOFT = '#94a3b8'
const PAGE = '#f6f7fc'
const LINE = '#e3e7f1'
const YELLOW = '#ffdf00'
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif"

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]!)
const oneLine = (s: string, max = 120) => s.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
/** A link is only ever http(s); anything else becomes the website's front page. */
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : env.WEB_URL)
const first = (name: string) => oneLine(name, 60).split(' ')[0] || 'there'
const site = () => env.WEB_URL.replace(/\/+$/, '')
const app = () => env.EDITOR_URL.replace(/\/+$/, '')

/** A host a stranger's mail app can actually reach: not localhost, not a private network address. */
const isPublicHost = (url: string) => {
  try {
    const h = new URL(url).hostname.toLowerCase()
    return !(h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || /^(127|10)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === '0.0.0.0' || h === '[::1]')
  } catch { return false }
}
/** The real SlidesDone logo (mark + lettering). Null while the website is only on this computer: the mail then shows a simple lettered tile instead of a broken picture. */
const logoUrl = (): string | null => {
  const u = env.EMAIL_LOGO_URL ?? `${env.WEB_URL.replace(/\/+$/, '')}/logo-lockup.png`
  return /^https?:\/\//i.test(u) && isPublicHost(u) ? u : null
}
const header = () => {
  const logo = logoUrl()
  const link = esc(site())
  if (logo) return `<a href="${link}" target="_blank" style="text-decoration:none;"><img src="${esc(logo)}" width="200" height="38" alt="SlidesDone" border="0" style="display:block;border:0;outline:none;width:200px;height:38px;font:800 20px/38px ${FONT};color:${INK};"></a>`
  return `<a href="${link}" target="_blank" style="text-decoration:none;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="34" height="34" bgcolor="${BLUE}" style="background:${BLUE};border:2px solid ${INK};border-radius:9px;font:800 18px/30px ${FONT};color:#ffffff;">S</td><td style="padding-left:10px;font:800 20px/1 ${FONT};color:${INK};letter-spacing:-0.3px;">SlidesDone</td></tr></table></a>`
}

// ── building blocks ─────────────────────────────────────────────────────────────────────────────────────────────────────
const p = (html: string, o: { size?: number; color?: string; top?: number } = {}) =>
  `<p style="margin:${o.top ?? 0}px 0 16px;font:${o.size ?? 16}px/1.6 ${FONT};color:${o.color ?? INK};">${html}</p>`
const h1 = (t: string) => `<h1 style="margin:0 0 14px;font:800 26px/1.25 ${FONT};color:${INK};letter-spacing:-0.3px;">${esc(t)}</h1>`

/** A button that survives Outlook: a table cell with the colour on the cell, a thick bottom edge for the brand's "pressed" look. */
const button = (label: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px;"><tr><td align="center" bgcolor="${BLUE}" style="background:${BLUE};border:2px solid ${INK};border-bottom:5px solid ${INK};border-radius:10px;">` +
  `<a href="${esc(safeUrl(url))}" target="_blank" style="display:inline-block;padding:13px 30px;font:700 16px/1 ${FONT};color:#ffffff;text-decoration:none;">${esc(label)}</a></td></tr></table>`

const linkFallback = (url: string) =>
  p(`If the button does not work, copy this address into your browser:<br><a href="${esc(safeUrl(url))}" style="color:${BLUE};word-break:break-all;">${esc(url)}</a>`, { size: 13, color: MUTED })

const rows = (items: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;border:1px solid ${LINE};border-radius:10px;border-collapse:separate;overflow:hidden;">` +
  items.map(([k, v], i) => `<tr><td style="padding:12px 16px;font:14px/1.4 ${FONT};color:${MUTED};${i ? `border-top:1px solid ${LINE};` : ''}" width="38%">${esc(k)}</td><td align="right" style="padding:12px 16px;font:600 14px/1.4 ${FONT};color:${INK};${i ? `border-top:1px solid ${LINE};` : ''}">${esc(v)}</td></tr>`).join('') +
  `</table>`

const quote = (text: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;"><tr><td style="border-left:4px solid ${YELLOW};background:${PAGE};padding:14px 16px;font:15px/1.6 ${FONT};color:${INK};white-space:pre-line;">${esc(text)}</td></tr></table>`

const note = (html: string) => p(html, { size: 13, color: MUTED })

const list = (items: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">` +
  items.map((t, i) => `<tr><td valign="top" style="padding:0 12px 10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="26" height="26" bgcolor="${YELLOW}" style="background:${YELLOW};border:2px solid ${INK};border-radius:13px;font:800 13px/22px ${FONT};color:${INK};">${i + 1}</td></tr></table></td><td style="padding:2px 0 10px;font:15px/1.5 ${FONT};color:${INK};">${esc(t)}</td></tr>`).join('') +
  `</table>`

/** The frame every mail sits in: brand bar, white card, quiet footer. `preheader` is the grey preview line most inboxes show after the subject. */
function shell(o: { preheader: string; body: string; footer?: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>SlidesDone</title></head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE};font-size:1px;line-height:1px;">${esc(o.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};"><tr><td align="center" style="padding:28px 14px 40px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
    <tr><td style="padding:0 4px 16px;">${header()}</td></tr>
    <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-top:4px solid ${BLUE};border-radius:14px;padding:32px 30px 14px;">${o.body}</td></tr>
    <tr><td style="padding:20px 8px 0;font:12px/1.6 ${FONT};color:${SOFT};text-align:center;">${o.footer ?? ''}SlidesDone &middot; AI presentations in minutes<br><a href="${esc(site())}/support" style="color:${SOFT};">Help and support</a> &middot; <a href="${esc(site())}" style="color:${SOFT};">Website</a></td></tr>
  </table>
</td></tr></table>
</body></html>`
}

const sign = '\n\nSlidesDone\nAI presentations in minutes'
const money = (minor: number, currency: string) => {
  try { return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency }).format(minor / 100) } catch { return `${(minor / 100).toFixed(2)} ${currency}` }
}
const day = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
const PLAN_NAME: Record<string, string> = { starter: 'Starter', pro: 'Pro', gold: 'Gold' }
export const planName = (id: string | null | undefined) => PLAN_NAME[id ?? ''] ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'your')

// ── account ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function verifyEmail(o: { name: string; url: string }): Rendered {
  const hi = first(o.name)
  return {
    subject: 'Confirm your email for SlidesDone',
    text: `Hi ${hi},\n\nWelcome to SlidesDone. Confirm your email address to start creating presentations:\n${o.url}\n\nThis link works for 1 hour. If you did not sign up, you can ignore this email.${sign}`,
    html: shell({
      preheader: 'One click and you can start building presentations.',
      body: h1(`Welcome, ${hi}`) + p('Thanks for signing up. Confirm your email address to start creating presentations.') + button('Confirm my email', o.url) + linkFallback(o.url) + note('This link works for 1 hour. If you did not sign up for SlidesDone, you can safely ignore this email.'),
    }),
  }
}

export function resetPassword(o: { name: string; url: string }): Rendered {
  const hi = first(o.name)
  return {
    subject: 'Reset your SlidesDone password',
    text: `Hi ${hi},\n\nSomeone asked to reset the password for your SlidesDone account. Choose a new one here:\n${o.url}\n\nThis link works for 1 hour and can be used once. If you did not ask for this, ignore this email: your password stays the same.${sign}`,
    html: shell({
      preheader: 'Choose a new password. The link works for 1 hour.',
      body: h1('Reset your password') + p(`Hi ${esc(hi)}, someone asked to reset the password for your SlidesDone account. If that was you, choose a new one below.`) + button('Choose a new password', o.url) + linkFallback(o.url) + note('This link works for 1 hour and can be used once. If you did not ask for this, ignore this email: your password stays the same and nobody can use this link without access to your inbox.'),
    }),
  }
}

export function passwordChanged(o: { name: string }): Rendered {
  const hi = first(o.name)
  const url = `${site()}/login`
  return {
    subject: 'Your SlidesDone password was changed',
    text: `Hi ${hi},\n\nThe password for your SlidesDone account was just changed, and you were signed out everywhere.\n\nIf this was you, there is nothing to do; you can log in again here: ${url}\n\nIf it was not you, reset your password right away:\n${site()}/forgot-password\n\nand contact us through ${site()}/support.${sign}`,
    html: shell({
      preheader: 'Your password was changed and you were signed out everywhere.',
      body: h1('Your password was changed') + p(`Hi ${esc(hi)}, the password for your SlidesDone account was just changed, and you were signed out on every device.`) + p('If this was you, there is nothing more to do.') + button('Log in', url) +
        note(`If it was not you, <a href="${esc(site())}/forgot-password" style="color:${BLUE};">reset your password</a> right away and <a href="${esc(site())}/support" style="color:${BLUE};">contact us</a>.`),
    }),
  }
}

export function welcome(o: { name: string }): Rendered {
  const hi = first(o.name)
  const steps = ['Describe your topic, or upload a document, a link or a recording.', 'Pick a look from more than 130 templates.', 'Polish it in the editor, then share a link or download it.']
  return {
    subject: 'Welcome to SlidesDone',
    text: `Hi ${hi},\n\nYour account is ready. Three steps to your first presentation:\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nStart here: ${app()}\n\nQuestions? ${site()}/support${sign}`,
    html: shell({
      preheader: 'Your account is ready. Three steps to your first presentation.',
      body: h1(`You are in, ${hi}`) + p('Your account is ready. Here is how to get your first presentation in a few minutes:') + list(steps) + button('Create my first presentation', app()) + note(`Stuck on anything? <a href="${esc(site())}/support" style="color:${BLUE};">Ask us</a>, we read every message.`),
    }),
  }
}

// ── sharing and teamwork ────────────────────────────────────────────────────────────────────────────────────────────────
export function invitation(o: { ownerName: string; deckTitle: string; email: string; url: string }): Rendered {
  const owner = oneLine(o.ownerName, 60), deck = oneLine(o.deckTitle, 80)
  return {
    subject: `${owner} invited you to edit "${deck}"`,
    text: `${owner} invited you to edit the presentation "${deck}" on SlidesDone.\n\nOpen this link and sign in with ${o.email}:\n${o.url}\n\nThe link works for 14 days. Anything the AI does while you edit uses ${owner}'s credits, not yours.\n\nIf you were not expecting this, ignore this email.${sign}`,
    html: shell({
      preheader: `${owner} wants you to edit "${deck}" together.`,
      body: h1('You are invited to edit') + p(`<strong>${esc(owner)}</strong> invited you to edit the presentation <strong>${esc(deck)}</strong> on SlidesDone.`) + button('Open the invitation', o.url) + linkFallback(o.url) +
        note(`Sign in with <strong>${esc(o.email)}</strong> to accept. The link works for 14 days. Anything the AI does while you edit uses ${esc(owner)}&rsquo;s credits, not yours.`) + note('If you were not expecting this, ignore this email.'),
    }),
  }
}

export function mention(o: { authorName: string; deckTitle: string; excerpt: string; truncated: boolean; url: string }): Rendered {
  const author = oneLine(o.authorName, 60), deck = oneLine(o.deckTitle, 80)
  const ex = o.excerpt + (o.truncated ? '…' : '')
  return {
    subject: `${author} mentioned you in "${deck}"`,
    text: `${author} mentioned you in a comment on "${deck}":\n\n${ex}\n\nOpen the presentation: ${o.url}${sign}`,
    html: shell({
      preheader: ex.slice(0, 90),
      body: h1('You were mentioned') + p(`<strong>${esc(author)}</strong> mentioned you in a comment on <strong>${esc(deck)}</strong>:`) + quote(ex) + button('Open the presentation', o.url) + note('You get at most one of these emails per presentation every few hours.'),
    }),
  }
}

export function shareLink(o: { senderName: string; deckTitle: string; url: string; message?: string | undefined; protectedByPassword: boolean }): Rendered {
  const sender = oneLine(o.senderName, 60), deck = oneLine(o.deckTitle, 80)
  const msg = o.message ? o.message.replace(/\s+/g, ' ').trim() : ''
  const lock = o.protectedByPassword ? `This presentation is password-protected: ask ${sender} for the password.` : ''
  return {
    subject: `${sender} shared "${deck}" with you`,
    text: `${sender} shared the presentation "${deck}" with you on SlidesDone.${msg ? `\n\n"${msg}"` : ''}\n\nView it here (no account needed):\n${o.url}${lock ? `\n\n${lock}` : ''}\n\nYou can only view it. If you were not expecting this, ignore this email.${sign}`,
    html: shell({
      preheader: msg ? msg.slice(0, 90) : `${sender} shared a presentation with you.`,
      body: h1('A presentation for you') + p(`<strong>${esc(sender)}</strong> shared <strong>${esc(deck)}</strong> with you.`) + (msg ? quote(msg) : '') + button('View the presentation', o.url) + linkFallback(o.url) +
        (lock ? note(`<strong>${esc(lock)}</strong>`) : '') + note('No account is needed and you can only view it. If you were not expecting this, ignore this email.'),
    }),
  }
}

// ── payments ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function paymentSuccess(o: { name: string; planId: string | null; interval: string | null; amountMinor: number; currency: string; paymentId: string; paidAt: Date; periodEnd: Date | null }): Rendered {
  const hi = first(o.name), plan = planName(o.planId)
  const cycle = o.interval === 'year' ? 'Yearly' : o.interval === 'month' ? 'Monthly' : null
  const amount = money(o.amountMinor, o.currency)
  const items: [string, string][] = [['Plan', plan], ...(cycle ? ([['Billing', cycle]] as [string, string][]) : []), ['Amount paid', amount], ['Date', day(o.paidAt)], ...(o.periodEnd ? ([['Covers you until', day(o.periodEnd)]] as [string, string][]) : []), ['Payment reference', o.paymentId]]
  const url = `${app()}/billing`
  return {
    subject: `Payment received: SlidesDone ${plan}`,
    text: `Hi ${hi},\n\nThank you. We received your payment and your ${plan} plan is active.\n\n${items.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nYour plan, credits and payment history: ${url}\n\nKeep this email as your receipt. Questions about a payment? ${site()}/support${sign}`,
    html: shell({
      preheader: `We received ${amount}. Your ${plan} plan is active.`,
      body: h1('Payment received') + p(`Hi ${esc(hi)}, thank you. We received your payment and your <strong>${esc(plan)}</strong> plan is active.`) + rows(items) + button('See my plan and credits', url) + note('Keep this email as your receipt. Questions about a payment? <a href="' + esc(site()) + '/support" style="color:' + BLUE + ';">Contact us</a> and include the payment reference above.'),
    }),
  }
}

export function paymentFailed(o: { name: string; planId: string | null; amountMinor: number; currency: string; reason: string | null }): Rendered {
  const hi = first(o.name), plan = planName(o.planId), amount = money(o.amountMinor, o.currency)
  const reason = o.reason ? oneLine(o.reason, 160) : ''
  const url = `${app()}/billing`
  return {
    subject: 'We could not process your SlidesDone payment',
    text: `Hi ${hi},\n\nYour payment of ${amount} for the ${plan} plan did not go through${reason ? ` (${reason})` : ''}. You have not been charged for it.\n\nWhat to do: check that your card or account has enough balance and that the details are right, then try again:\n${url}\n\nIf you already have a plan, it keeps working until the end of the period you paid for.${sign}`,
    html: shell({
      preheader: `Your payment of ${amount} did not go through. You have not been charged.`,
      body: h1('Your payment did not go through') + p(`Hi ${esc(hi)}, your payment of <strong>${esc(amount)}</strong> for the <strong>${esc(plan)}</strong> plan could not be processed. You have not been charged for it.`) + (reason ? quote(`Reason given: ${reason}`) : '') +
        p('Check that your card or account has enough balance and that the details are right, then try again.') + button('Try the payment again', url) + note('If you already have a plan, it keeps working until the end of the period you paid for.'),
    }),
  }
}

export function subscriptionEnding(o: { name: string; planId: string | null; endsOn: Date }): Rendered {
  const hi = first(o.name), plan = planName(o.planId), until = day(o.endsOn)
  const url = `${app()}/billing`
  return {
    subject: `Your SlidesDone ${plan} plan will not renew`,
    text: `Hi ${hi},\n\nYou cancelled renewal. Nothing more will be charged, and you keep your ${plan} plan until ${until}. After that your account moves to the free Starter plan.\n\nChanged your mind? You can subscribe again any time:\n${url}${sign}`,
    html: shell({
      preheader: `You keep ${plan} until ${until}. Nothing more will be charged.`,
      body: h1('Your plan will not renew') + p(`Hi ${esc(hi)}, you cancelled renewal. Nothing more will be charged, and you keep your <strong>${esc(plan)}</strong> plan until <strong>${esc(until)}</strong>.`) + p('After that your account moves to the free Starter plan.') + button('Manage my plan', url) + note('Changed your mind? You can subscribe again at any time.'),
    }),
  }
}

export function refundProcessed(o: { name: string; planId: string | null; amountMinor: number; currency: string }): Rendered {
  const hi = first(o.name), plan = planName(o.planId), amount = money(o.amountMinor, o.currency)
  return {
    subject: 'Your SlidesDone refund was processed',
    text: `Hi ${hi},\n\nWe refunded ${amount} for your ${plan} plan. It usually reaches your bank within 5 to 7 working days, depending on the bank.\n\nBecause the payment was refunded, the ${plan} plan has ended and the credits that payment gave were removed. Your presentations are still yours and you can keep using the free Starter plan: ${app()}/billing\n\nQuestions? ${site()}/support${sign}`,
    html: shell({
      preheader: `We refunded ${amount}. It reaches your bank in about 5 to 7 working days.`,
      body: h1('Your refund was processed') + p(`Hi ${esc(hi)}, we refunded <strong>${esc(amount)}</strong> for your <strong>${esc(plan)}</strong> plan. It usually reaches your bank within 5 to 7 working days, depending on the bank.`) +
        p('Because the payment was refunded, the plan has ended and the credits that payment gave were removed. Your presentations are still yours, and you can keep using the free Starter plan.') + button('Go to my account', `${app()}/billing`) + note(`Questions? <a href="${esc(site())}/support" style="color:${BLUE};">Contact us</a>.`),
    }),
  }
}

/** Every template with sample data: used by the preview script and the tests. */
export const SAMPLES: Record<string, () => Rendered> = {
  'verify-email': () => verifyEmail({ name: 'Priya Nair', url: `${env.API_URL}/api/auth/verify-email?token=sample` }),
  'reset-password': () => resetPassword({ name: 'Priya Nair', url: `${env.API_URL}/api/auth/reset-password/sample?callbackURL=${site()}/reset-password` }),
  'password-changed': () => passwordChanged({ name: 'Priya Nair' }),
  welcome: () => welcome({ name: 'Priya Nair' }),
  invitation: () => invitation({ ownerName: 'Daniel Okafor', deckTitle: 'Northwind: Seed round pitch', email: 'priya@northwind.example', url: `${app()}/invite/sample` }),
  mention: () => mention({ authorName: 'Mei Tanaka', deckTitle: 'Northwind: Seed round pitch', excerpt: '@Priya can you check the traction numbers on slide 6 before we send this to the investors?', truncated: false, url: `${app()}/edit/sample` }),
  'share-link': () => shareLink({ senderName: 'Priya Nair', deckTitle: 'Northwind: Seed round pitch', url: `${app()}/s/sample`, message: 'Here is the latest version, tell me what you think.', protectedByPassword: true }),
  'payment-success': () => paymentSuccess({ name: 'Priya Nair', planId: 'pro', interval: 'month', amountMinor: 79900, currency: 'INR', paymentId: 'pay_Qx12AbCdEf3456', paidAt: new Date('2026-10-30T09:30:00Z'), periodEnd: new Date('2026-11-30T09:30:00Z') }),
  'payment-failed': () => paymentFailed({ name: 'Priya Nair', planId: 'pro', amountMinor: 79900, currency: 'INR', reason: 'Your bank declined the payment: insufficient funds.' }),
  'subscription-ending': () => subscriptionEnding({ name: 'Priya Nair', planId: 'pro', endsOn: new Date('2026-11-30T09:30:00Z') }),
  'refund-processed': () => refundProcessed({ name: 'Priya Nair', planId: 'pro', amountMinor: 79900, currency: 'INR' }),
}
