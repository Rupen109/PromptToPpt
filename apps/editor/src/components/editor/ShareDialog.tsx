import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError, isGateError, type MemberView, type ShareExpiry, type ShareLinkView } from '@prompttoppt/api-client'
import { Portal } from '@/components/Portal'
import { AnalyticsDialog } from './AnalyticsDialog'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { useDialog } from '@/lib/useDialog'

type Tab = 'people' | 'link'
const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

/** Share: invite people to edit together (Pro / Gold; their AI use is charged to the owner) or create a view-only link (every plan). Owner only. */
export function ShareDialog({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const { ent, upgrade } = useEntitlements()
  const canInvite = ent?.features.advancedSharing ?? false
  const [tab, setTab] = useState<Tab>('people')
  const [members, setMembers] = useState<MemberView[] | null>(null)
  const [limit, setLimit] = useState(0)
  const [email, setEmail] = useState('')
  const [linkInfo, setLinkInfo] = useState<ShareLinkView | undefined>(undefined) // undefined = loading
  const link = linkInfo === undefined ? undefined : linkInfo.url
  const [pw, setPw] = useState('')
  const [expiry, setExpiry] = useState<string>('never')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState(false)

  const refreshMembers = useCallback(() => api.listMembers(deckId).then((r) => { setMembers(r.members); setLimit(r.limit) }).catch(() => setMembers([])), [deckId])
  useEffect(() => {
    void refreshMembers()
    api.getShareLink(deckId).then((r) => { setLinkInfo(r); setExpiry(r.expiresAt ? 'custom' : 'never') }).catch(() => setLinkInfo({ url: null, hasPassword: false, expiresAt: null }))
  }, [deckId, refreshMembers])

  async function invite(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true); setError(null); setNote(null)
    try {
      await api.inviteMember(deckId, email.trim())
      setNote(`Invitation sent to ${email.trim()}. It works for 14 days.`)
      setEmail('')
      await refreshMembers()
    } catch (err) {
      if (isGateError(err) && err.code === 'UPGRADE_REQUIRED') { onClose(); upgrade.show(err.message) }
      else setError(msg(err, 'Could not send the invitation.'))
    } finally { setBusy(false) }
  }
  async function remove(m: MemberView) {
    setError(null)
    try { await api.removeMember(deckId, m.id); await refreshMembers() } catch (err) { setError(msg(err, 'Could not remove that person.')) }
  }
  async function makeLink() {
    setBusy(true); setError(null)
    try { setLinkInfo(await api.createShareLink(deckId)) } catch (err) { setError(msg(err, 'Could not create the link.')) } finally { setBusy(false) }
  }
  async function stopLink() {
    setBusy(true); setError(null)
    try { await api.revokeShareLink(deckId); setLinkInfo({ url: null, hasPassword: false, expiresAt: null }); setNote('Link turned off. Anyone who has it can no longer open the presentation.') } catch (err) { setError(msg(err, 'Could not turn the link off.')) } finally { setBusy(false) }
  }
  async function protect(body: { password?: string | null; expiresInDays?: ShareExpiry }, done: string) {
    setBusy(true); setError(null); setNote(null)
    try { const r = await api.updateShareLink(deckId, body); setLinkInfo(r); setExpiry(r.expiresAt ? 'custom' : 'never'); setPw(''); setNote(done) }
    catch (err) { if (isGateError(err) && err.code === 'UPGRADE_REQUIRED') { onClose(); upgrade.show(err.message) } else setError(msg(err, 'Could not update the link.')) }
    finally { setBusy(false) }
  }
  async function copy() {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setNote('Link copied.') } catch { setNote('Select the link and copy it.') }
  }

  const tabBtn = (k: Tab, label: string) => (
    <button role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setError(null); setNote(null) }} className={`px-4 py-2 rounded-full text-sm ${tab === k ? 'bg-foreground text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{label}</button>
  )

  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Share presentation" className="bg-white rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-xl outline-none max-h-[90vh] overflow-y-auto">
          <div className="flex items-start justify-between mb-3">
            <h2 className="font-heading font-bold text-xl">Share</h2>
            <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-slate-500 hover:text-slate-800">×</button>
          </div>
          <div role="tablist" className="flex gap-2 mb-4">{tabBtn('people', 'Invite people')}{tabBtn('link', 'View-only link')}</div>

          {tab === 'people' && (
            canInvite ? (
              <>
                <form onSubmit={invite} className="flex gap-2">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@email.com" aria-label="Email to invite" maxLength={254} className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2.5 text-sm" />
                  <button disabled={busy || !email.trim() || (members?.length ?? 0) >= limit} className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">Invite</button>
                </form>
                <p className="text-xs text-slate-600 mt-2">People you invite can edit this presentation. <strong>Anything the AI does while they edit uses your credits.</strong> They cannot export, share, delete or rebuild the whole deck.</p>
                <div className="mt-4 text-xs font-semibold text-slate-500">{members ? `${members.length} of ${limit} people` : 'Loading…'}</div>
                <ul className="mt-1 divide-y divide-border" aria-label="People with access">
                  {(members ?? []).map((m) => (
                    <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{m.email}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${m.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{m.status === 'active' ? 'Can edit' : 'Invited'}</span>
                      <button onClick={() => void remove(m)} aria-label={`Remove ${m.email}`} className="text-slate-500 hover:text-red-700 px-1">✕</button>
                    </li>
                  ))}
                  {members && members.length === 0 && <li className="py-3 text-sm text-slate-500">Nobody yet. Invite a teammate or friend above.</li>}
                </ul>
              </>
            ) : (
              <div className="rounded-xl bg-slate-50 border border-border p-4 text-sm">
                <p className="font-semibold mb-1">Edit together with Pro or Gold</p>
                <p className="text-slate-600 mb-3">Invite friends and teammates to edit the same presentation. Pro allows 3 collaborators per deck, Gold 10.</p>
                <button onClick={() => { onClose(); upgrade.show('Inviting people to edit together is available on Pro and Gold.') }} className="px-4 py-2 rounded-lg bg-primary text-white font-semibold">See plans</button>
              </div>
            )
          )}

          {tab === 'link' && (
            <>
              <p className="text-sm text-slate-600 mb-3">Anyone with the link can <strong>view</strong> the presentation — no account needed. They can't edit it, and speaker notes stay private. You can turn the link off at any time.</p>
              {link === undefined ? <p className="text-sm text-slate-500">Loading…</p> : link ? (
                <>
                  <div className="flex gap-2">
                    <input readOnly value={link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2.5 text-sm bg-slate-50" />
                    <button onClick={() => void copy()} className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold">Copy</button>
                  </div>
                  <fieldset className="mt-4 border border-border rounded-xl p-3 space-y-3" aria-label="Link protection">
                    <legend className="px-1 text-xs font-semibold text-slate-500">Protect this link {!canInvite && <span className="ml-1 text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">PRO</span>}</legend>
                    <div>
                      <label className="block text-sm font-medium" htmlFor="share-pw">Password {linkInfo?.hasPassword && <span className="text-green-700 text-xs font-semibold">· on</span>}</label>
                      <div className="mt-1 flex gap-2">
                        <input id="share-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={linkInfo?.hasPassword ? 'Enter a new password to change it' : '6 or more characters'} minLength={6} maxLength={72} className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2 text-sm" />
                        <button disabled={busy || pw.length < 6} onClick={() => canInvite ? void protect({ password: pw }, 'Password saved. Viewers must enter it to open the link.') : (onClose(), upgrade.show('Password-protected links are available on Pro and Gold.'))} className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">{linkInfo?.hasPassword ? 'Change' : 'Set'}</button>
                      </div>
                      {linkInfo?.hasPassword && <button disabled={busy} onClick={() => void protect({ password: null }, 'Password removed. Anyone with the link can open it.')} className="mt-1 text-xs text-slate-600 underline disabled:opacity-50">Remove password</button>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium" htmlFor="share-exp">Link expires</label>
                      <select id="share-exp" value={expiry} disabled={busy} onChange={(e) => {
                        const v = e.target.value
                        if (v === 'custom') return
                        const days: ShareExpiry = v === 'never' ? null : (Number(v) as ShareExpiry)
                        if (days !== null && !canInvite) { onClose(); upgrade.show('Expiring links are available on Pro and Gold.'); return }
                        void protect({ expiresInDays: days }, days === null ? 'The link no longer expires.' : `The link will stop working in ${days} day${days === 1 ? '' : 's'}.`)
                      }} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="never">Never</option>
                        <option value="1">In 1 day</option><option value="7">In 7 days</option><option value="30">In 30 days</option><option value="90">In 90 days</option>
                        {expiry === 'custom' && <option value="custom">{linkInfo?.expiresAt ? `On ${new Date(linkInfo.expiresAt).toLocaleDateString()}` : 'Custom'}</option>}
                      </select>
                    </div>
                  </fieldset>
                  <div className="mt-4 rounded-xl border border-border p-3 flex flex-wrap items-center gap-2" aria-label="Link views">
                    <span className="text-sm" data-testid="share-views">{linkInfo?.views ? <><strong>{linkInfo.views}</strong> view{linkInfo.views === 1 ? '' : 's'} · last viewed {linkInfo.lastViewedAt ? new Date(linkInfo.lastViewedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never'}</> : 'Nobody has opened this link yet.'}</span>
                    <button onClick={() => setAnalytics(true)} className="ml-auto px-3 py-1.5 rounded-lg border border-border text-sm font-semibold hover:bg-slate-50">See analytics</button>
                  </div>
                  <button onClick={() => void stopLink()} disabled={busy} className="mt-3 text-sm text-red-700 underline disabled:opacity-50">Turn the link off</button>
                </>
              ) : (
                <button onClick={() => void makeLink()} disabled={busy} className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">Create view-only link</button>
              )}
            </>
          )}

          <div aria-live="polite" className="min-h-5 mt-3">
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {!error && note && <p role="status" className="text-sm text-green-800">{note}</p>}
          </div>
        </div>
      </div>
      {analytics && <AnalyticsDialog deckId={deckId} onClose={() => setAnalytics(false)} />}
    </Portal>
  )
}
