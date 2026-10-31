# Sign in with Google and Microsoft

Each button on `/login` and `/signup` appears only when **both** halves are set: the keys on the API and the matching `NEXT_PUBLIC_*_AUTH=true`
flag on the website (a build argument, see `apps/web/Dockerfile`). Better Auth does the OAuth work (`services/api/src/auth.ts`).
A mailbox is one account whichever way it arrives (`canonicalEmail` in the create hook); the same verified e-mail links to the existing account.

| | API keys (`services/api/.env` / secrets store) | Website flag | Redirect / return URL to register |
|---|---|---|---|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `NEXT_PUBLIC_GOOGLE_AUTH` | `<API_URL>/api/auth/callback/google` |
| Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, optional `MICROSOFT_TENANT_ID` (default `common`) | `NEXT_PUBLIC_MICROSOFT_AUTH` | `<API_URL>/api/auth/callback/microsoft` |

Half-set keys stop the API at start-up with a clear message. Owner dashboard → Control → Providers shows which are configured.

## Microsoft — steps (free, about 10 minutes)
1. portal.azure.com → **Microsoft Entra ID → App registrations → New registration**. Name: SlidesDone.
2. Supported account types: **"Accounts in any organizational directory and personal Microsoft accounts"** (this is tenant `common`).
3. Redirect URI, platform **Web**: `http://localhost:4000/api/auth/callback/microsoft` now; add `https://<api-domain>/api/auth/callback/microsoft` for production.
4. Copy **Application (client) ID** → `MICROSOFT_CLIENT_ID`.
5. **Certificates & secrets → New client secret** → copy the **Value** (not the Secret ID) → `MICROSOFT_CLIENT_SECRET`. It expires (max 24 months): put the date in your calendar.
6. API permissions: the defaults (`User.Read`) are enough. Set `NEXT_PUBLIC_MICROSOFT_AUTH=true` on the website.
Works on localhost.

## Apple
Not offered (owner decision 2026-10-30: it needs the paid Apple Developer account). To add it later: Better Auth has an `apple` provider; it needs a Services ID, a key and a real https domain.

## Behaviour worth knowing
* Microsoft work/school accounts do not always say their address is verified: such a person gets an account but **no welcome mail**, and is never linked into an existing account of the same address (the create check refuses a duplicate mailbox instead).
* Error return: a failed or cancelled provider sign-in lands on `/login?error=<provider>` with "<Provider> sign-in did not finish…".

## Proof (2026-10-30)
Live (dummy keys, second API on :4010): `sign-in/social` for Microsoft answered the correct `/common/oauth2/v2.0/authorize` address with our callback; the website rendered the button and its failure text.
**Not proven:** a real Microsoft login (needs your Azure app).
