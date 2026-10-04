/**
 * Email identity helpers for abuse prevention.
 *
 * canonicalEmail: the address a real mailbox is known by. `Jane.Doe+promo1@Gmail.com`, `janedoe@googlemail.com` and `jane.doe+x@gmail.com`
 * all deliver to ONE inbox, so they must count as ONE account — otherwise every free allowance can be farmed with plus-tags and dots.
 */
export function canonicalEmail(raw: string): string {
  const email = raw.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at < 1) return email
  let local = email.slice(0, at).split('+')[0]!
  let domain = email.slice(at + 1)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

/** Throwaway-inbox providers: an account made with one is a free-credit farm by definition. Extend with EXTRA_BLOCKED_EMAIL_DOMAINS. */
const DISPOSABLE = new Set(`
mailinator.com mailinator.net mailinator2.com guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz guerrillamail.de guerrillamailblock.com grr.la sharklasers.com spam4.me
10minutemail.com 10minutemail.net 10minemail.com 20minutemail.com 30minutemail.com tempmail.com temp-mail.org temp-mail.io tempmail.net tempmailo.com tempail.com tempr.email tmpmail.org tmpmail.net tmail.ws
throwawaymail.com throwam.com yopmail.com yopmail.fr yopmail.net cool.fr.nf jetable.org nospam.ze.tc nomail.xl.cc trashmail.com trashmail.net trashmail.de trashmail.io trash-mail.com wegwerfmail.de wegwerfmail.net
getnada.com nada.email maildrop.cc dispostable.com fakeinbox.com fakemail.net mailnesia.com mintemail.com mytemp.email emailondeck.com spamgourmet.com moakt.com mohmal.com burnermail.io inboxkitten.com
discard.email discardmail.com dropmail.me mailcatch.com mail.tm mail.gw emltmp.com mailsac.com mailtemp.info mail-temp.com mailforspam.com spambox.us spamex.com spamfree24.org spaml.com
getairmail.com anonbox.net anonymbox.com bugmenot.com deadaddress.com dayrep.com einrot.com fleckens.hu gustr.com harakirimail.com incognitomail.org instantemailaddress.com jourrapide.com
knol-power.nl kurzepost.de lroid.com mailexpire.com mailmoat.com mailzilla.com mt2015.com mytrashmail.com no-spam.ws notmailinator.com objectmail.com onewaymail.com owlpic.com pjjkp.com pookmail.com
proxymail.eu putthisinyourspamdatabase.com qq.fr rcpt.at rmqkr.net safe-mail.net selfdestructingmail.com sendspamhere.com sharedmailbox.org shieldedmail.com sneakemail.com sogetthis.com
spamavert.com spambog.com spamgoes.in spamhereplease.com spamhole.com spamify.com spaminator.de spamkill.info spamspot.com supergreatmail.com superrito.com suremail.info teleworm.us thankyou2010.com
thisisnotmyrealemail.com tilien.com tradermail.info trbvm.com trialmail.de turual.com twinmail.de tyldd.com uggsrock.com upliftnow.com venompen.com veryrealemail.com viditag.com vubby.com
wh4f.org whatpaas.com whyspam.me wilemail.com willhackforfood.biz winemaven.info wronghead.com wuzupmail.net xagloo.com xemaps.com xents.com xmaily.com xoxy.net yapped.net yuurok.com zehnminutenmail.com
zippymail.info zoemail.net zomg.info 1secmail.com 1secmail.net 1secmail.org kzccv.com qiott.com wwjmp.com esiix.com xojxe.com yoggm.com vjuum.com laafd.com txcct.com
`.split(/\s+/).filter(Boolean))

export function isDisposableEmail(raw: string, extra: string[] = []): boolean {
  const domain = raw.trim().toLowerCase().split('@').pop() ?? ''
  const blocked = (d: string) => DISPOSABLE.has(d) || extra.includes(d)
  // also catch subdomains (x.mailinator.com)
  const parts = domain.split('.')
  for (let i = 0; i < parts.length - 1; i++) if (blocked(parts.slice(i).join('.'))) return true
  return false
}
