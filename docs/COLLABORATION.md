# Sharing & collaboration (status: all built)

Everything promised on the pricing page for sharing now exists: view-only links (all plans), password-protected & expiring links (Pro / Gold), inviting people to edit together (Pro 3 / Gold 10 per deck), and **live editing** (presence, pointers, text locks, automatic merging).

## Level 1 — view-only share links (every plan)
* Owner: **Share → View-only link → Create**. One live link per deck (`share_link`, partial unique index). **Turn the link off** revokes it at once; creating again makes a new token.
* The token is the capability: 32 random base64url characters (192 bits), never listed. Public endpoint `GET /api/v1/public/share/:token` (120/min/IP, `Cache-Control: no-store`, `X-Robots-Tag: noindex`).
* Viewers receive only what is on screen: **no speaker notes, no source list, no semantic content** (image prompts, citations). The watermark follows the OWNER's plan.
* Viewer page: editor app route `/s/:token`, outside the login wall.
* **Pro / Gold — password:** viewers see only a lock screen (no title, no slides) until they enter it. Passwords are scrypt-hashed with a per-link salt. A correct password yields a signed 12-hour proof (kept in that browser tab only) that is bound to the link AND to the current password — changing the password signs everybody out. Wrong guesses are counted per link (10 / 15 min → locked for everyone) and per IP (30 / 15 min).
* **Pro / Gold — expiry:** 1, 7, 30 or 90 days. Expired links answer `410 LINK_EXPIRED` ("This link has expired"); the owner can extend or clear the expiry.
* A downgraded owner keeps the protection on existing links and can remove it, but cannot add new protection.

* **Email this link** (owner, every plan): Share → View-only link → "Email this link". Up to 5 addresses per send, an optional short message, 20 sends/hour and 40 mails/day per person; the owner's own email must be confirmed in production. The mail carries the link only — if the link has a password, the mail says to ask the owner for it and never contains it. `POST /presentations/:id/share/email`.
* Checked end to end in `e2e/suites/45-share-link.mjs` (owner, anonymous visitor, phone): what the visitor's browser receives (no notes, sources or semantic content; `no-store`; `noindex`), the owner-only endpoints refuse a visitor, the link shows the latest version, off → new address (old stays dead), unknown addresses, expiry (410), password change signs viewers out, deleted deck, watermark follows the owner's plan, phone width.

## Level 2 — collaborators (Pro: 3 per deck, Gold: 10)
* Owner: **Share → Invite people** → email. An invitation (`presentation_member`, status `pending`) is mailed with `/invite/:token` (14 days). Re-inviting refreshes the link.
* **Accepting** needs a signed-in account whose canonical mailbox matches the invited address (plus-tags / gmail dots count as the same mailbox) and — in production — a verified email.
* Collaborators may: open, edit and save the deck, use version history, the AI assistant, AI edits and AI pictures, present it, and keep their own assistant chat.
* They may NOT: delete, move, share, invite, export, see the member list, or rebuild the whole deck (that runs as a separate job under the owner's account). The "Collaborating" badge explains this in the editor.
* **Credits:** everything a collaborator spends is charged to the OWNER — `resolveAccess()` returns `ownerId` and the routes use it for credits, model tiers, picture quota, sources and the AI usage ledger. Rate limits stay per person.
* If the owner's plan stops including collaboration, collaborators get 403 `UPGRADE_REQUIRED` (access returns with the plan). Removing a person or leaving ends access immediately.

## Level 3 — live editing (built)
How it works, in one paragraph: the deck still travels through the normal save path (debounced autosave with a revision number). What is new is a **live channel** per deck (Server-Sent Events + a small POST for presence) that (a) tells every open editor "revision N was saved" so they merge it within a second, and (b) shows who is where. If the connection drops nothing is lost — updates just arrive on the next save/reconnect.

* **Merging (three-way, by id):** an editor with nothing unsaved simply adopts the new revision. An editor with unsaved changes merges *their version + what I changed since my last sync* and saves the result; if someone saved in between it merges again (up to 8 times, then asks the person). Changes to different slides / different elements / different fields all survive. If both people change the *same* element or field, the person merging last wins for that one thing; something a collaborator deleted stays deleted. See `apps/editor/src/editor/docdiff.ts` (unit + 300-case randomised tests).
* **Undo is per person:** history is stored as id-addressed changes, not index patches. Undo reverts only *my* change, even after others inserted or moved slides, and skips an item a collaborator has since changed rather than overwriting their work.
* **Presence:** avatars in the header, coloured dots on the slide rail, coloured selection outlines with names, live pointers, and "Maya is typing…". Identity (name, colour) is stamped by the server; a client cannot speak as someone else.
* **Text locks:** while a collaborator edits a text box, nobody else can enter it ("Maya is editing this text right now").
* **Access changes are immediate:** removing a collaborator (or them leaving) closes their stream with a `kick`; every minute the server re-checks access (owner's plan lapsing also disconnects).
* **Limits:** 3 tabs per person per deck, 25 streams per deck, 2,000 per API process; presence is limited to 25 messages/s per person; while someone else is present autosave shortens to 0.7 s (the save limit is 120/min).
* **Scaling:** `LIVE_BUS=memory` (one API process) or `pg` (Postgres LISTEN/NOTIFY — required as soon as there is more than one API task; the default in production). Behind a load balancer set the idle timeout above 20 s (heartbeat) and disable response buffering for `/live` (the API sends `X-Accel-Buffering: no`).

Code: `services/api/src/collab/access.ts`, `routes/sharing.ts`, `live/*`; UI `ShareDialog`, `InvitePage`, `SharedPage`, `SharedViewPage`, `PeerLayer`, `PeerAvatars`, `editor/live.ts`, `editor/docdiff.ts`. Tests: `src/security/collab.test.ts`, `src/live/live.test.ts`, `editor/docdiff.test.ts`, `e2e/suites/17-collab.mjs`, `e2e/suites/18-live.mjs`.

## Email — what exists and what you must provide
Sent through **Brevo** or **Resend** (`services/api/src/lib/mailer.ts`; whichever key is set, Brevo first if both): sign-up confirmation, password reset, collaborator invitations, comment mentions and "Email this link". With no key (local development and tests) every mail is printed in the API console instead, so the flows can be completed by hand.

| | Brevo | Resend |
|---|---|---|
| Free | 300 emails/day, Brevo logo | 100/day, 3,000/month, no logo |
| Paid | Starter from about ₹562 (5,000/month, no daily cap); logo removal is an add-on | Pro $20 (50,000/month) |

To send real mail in production:
1. An account with one of them and an **API key** → `BREVO_API_KEY` or `RESEND_API_KEY`.
2. A **sending domain** you own, verified there by adding the DNS records shown (SPF, DKIM, and ideally DMARC) → `EMAIL_FROM`, e.g. `SlidesDone <hello@yourdomain.com>`. Until the domain is verified, mail only reaches your own address.
3. The production API refuses to start without a key, `EMAIL_FROM` and `REQUIRE_EMAIL_VERIFICATION=true` (see `env.ts`).
4. Decide who answers replies (a real mailbox for `hello@` / support).
5. Send one real invitation, one password reset and one "Email this link" to your own inbox; check they arrive and are not in spam.

**Decision (2026-10-30): Brevo, free plan.** Tested with a real send from a verified Gmail sender: it arrived in the normal inbox and the API mail carries **no Brevo logo**. Still open: buy a domain, authenticate it in Brevo (DNS records) and switch `EMAIL_FROM` to an address on it before launch — Gmail senders are more likely to land in spam. Replies can go to free forwarding (e.g. Cloudflare Email Routing); no paid mailbox is needed.
