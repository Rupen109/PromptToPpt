# Blog, tech news and guides — functional flows

Written by the owner in the dashboard (**Owner → Content → Blog, news & guides**, `/admin/posts` in the editor app), shown on the website at `/blog`, `/news` and `/guides`. One table (`post`, migration 0034), three types:

| Type | What it is | Special fields | Website |
|---|---|---|---|
| **Blog article** | Long marketing / SEO article | cover picture, tags, Markdown text with pictures, "Featured" (big card on top), SEO title + description | `/blog`, `/blog/<address>`, `/blog/rss.xml` |
| **Tech news** | Short item: the news in 2–3 lines | source name + link to the original, "Trending" (strip at the top), optional longer write-up | `/news`, `/news/<address>`, `/news/rss.xml` |
| **Guide** | "How to use SlidesDone" page | section (group) + order number, "On this page" list, previous / next | `/guides`, `/guides/<address>` |

**How the owner writes:** New post → choose the type (it cannot change later) → the form shows only that type's fields → Save draft (private) → Preview tab → Publish now, or pick a date and Schedule. Unpublish returns it to draft; Delete removes it. Ctrl/Cmd+S saves. Pictures: Upload in the cover box, or "Add picture" in the toolbar (PNG/JPG/WebP ≤ 5 MB, judged by content). The web address is made from the title and can be edited (a warning appears for a live post).

## Rules
- Only `published` posts whose date has come are public; a future date = scheduled. Drafts are never served (public API answers 404).
- Publishing needs a title, a summary (blog ≤ 320, news ≤ 500, guide ≤ 240 characters), and text (blog/guide); guides need a section. A live post cannot be emptied.
- Addresses are unique per type; reserved words (`rss`, `tag`, `page`, `new`, `feed`, `trending`) are refused.
- Markdown only: raw HTML is shown as text; `javascript:` links are dropped; only pictures from our own upload or `https://` are shown. Uploaded pictures are served from `/api/v1/content/images/post-….ext` (only keys starting `post-`, never a customer's picture), cached for a year.
- The website caches content for a minute and is told to refresh at once when a post is published/changed/unpublished/deleted (`WEB_REVALIDATE_URL` + `REVALIDATE_SECRET` on the API, `REVALIDATE_SECRET` on the website; without them posts still appear within about a minute). The hook also loads the changed pages once, so the next visitor, including the owner pressing "View on the website", sees the new version.
- Search engines: title/description/canonical/OpenGraph/Twitter per post, Article / NewsArticle + BreadcrumbList JSON-LD, RSS for blog and news, all public posts in `/sitemap.xml`.

## Proof
| Flow | Proof |
|---|---|
| Owner-only (401 / 403 on every endpoint, "Not authorised" page) | API `routes/content.test.ts`, e2e A1 |
| Type choice and per-type fields | e2e A2, A5, A6 |
| Blog: toolbar, picture upload, preview, draft is private, publish, rendered page (heading ids, safe links, pictures load, JSON-LD, canonical, og:image) | e2e A3 |
| Blog list, tag filter, empty tag, RSS, sitemap | e2e A4 |
| News: trending strip, source link, source name | e2e A5 |
| Guides: grouped by section, ordered, "On this page", previous / next | e2e A6, API test |
| Publish refusals in plain words, bad news link | e2e A7, API test |
| Scheduling, unpublish, delete, search/filter in the dashboard | e2e A8, API test |
| Safe text (script, onerror, javascript:, http image) | e2e A9 |
| Phone width, footer links | e2e E1 |
Suite `e2e/suites/41-content.mjs` 14/14 with a real browser, API and database (no AI). API: `routes/content.test.ts` 10 tests, `db/journal.test.ts`.

## Other changes made together with this work
- **Icons:** the product uses one icon library (lucide, `@prompttoppt/ui/icons`) instead of emoji and typed symbols; e2e check D1 scans the pages for emoji. Left on purpose: the sticker picker in the editor (the stickers are slide content), keyboard-key names in help text (⌘Z).
- **Header language picker:** `Presentation language` (100+ languages) on the website header (phone: inside the menu). Saved on the device; the landing page and the free tools hand it to the editor as `?lang=<code>`, which the editor accepts only if it is a known language code. e2e B1, B2.
- **Free tool: Sitemap generator** (`/free-tools/sitemap-generator`, `POST /free-tools/sitemap`): visits a public site like a search bot (robots.txt, noindex, canonical, nofollow, the site's own sitemap; ≤ 200 pages, ≤ 40 s, private addresses refused through the shared safe-fetch), builds `sitemap.xml` with optional last-changed dates, change frequency and priority. 8 sites per hour per visitor (`FREE_SITEMAP_IP_HOUR`), 4 crawls at once. API tests `free-tools/sitemap.test.ts` (10) + `routes/free-sitemap.test.ts`; e2e C1 against a real site; also tried on sitemaps.org, MDN and Hacker News.
- **Free tool: PDF to JPG** (earlier in this session).
- **Header menus:** hovering (or focusing / tapping) **Templates** opens the template collections with a "View all templates" button; **Resources** opens Blog, Tech news and Guides; every item gets a visible hover highlight; the phone menu lists them flat. **Language picker** is now also shown in the landing page prompt box ("Deck language"), kept in sync with the header. **Google sign-in:** proper button with the Google logo, plain messages when the service cannot be reached or Google returns an error (`?error=google`). Suite `e2e/suites/42-nav-and-signin.mjs` 8/8. **Site-wide fix:** the global `button { border: none }` rule removed the border of every `<Button>` rendered as a button; Tailwind already resets buttons, so the rule is gone. For production Google sign-in, the Google console must list `https://<api-domain>/api/auth/callback/google` as an authorised redirect URI.
- **Website language (Google translate):** the header picker (and the one in the landing page prompt box) offers 13 languages: English (default), Deutsch, Español, Français, हिन्दी, Bahasa Indonesia, Italiano, 中文, Polski, Português, Tiếng Việt, Magyar, Svenska. The choice sets the language of the website text (translated in the browser with Google's free page-translate widget, `lib/site-translate.ts`) and of the decks (hand-off `?lang=`). The widget's script is fetched quietly, once, the first time the language button is on screen (so a choice applies fast); it only starts translating after a choice, and the page text is sent to Google only then. Every visitor's browser therefore contacts Google once (their IP address): mention it in the Privacy Policy. The visible text of the page is sent to Google when someone picks another language: say so in the Privacy Policy. The website's security policy allows `translate.google.com`, `translate.googleapis.com`, `translate-pa.googleapis.com` and `www.gstatic.com` for this (`scripts/csp.mjs`). Translating in place keeps no way back to the original, so choosing English reloads the page. The editor's own deck-language list keeps its 100+ languages. Suites `42-nav-and-signin` (13) and `43-support-and-translate` (8, real internet).
- **Support page** (`/support`, navbar and footer link): e-mail, "How can we help?", up to 3 screenshots (PNG/JPG/WebP ≤ 5 MB, judged by content) → `POST /api/v1/support` (5 messages an hour per visitor `SUPPORT_IP_HOUR`, a hidden trap field for bots) → table `support_ticket` (migration 0035). The owner reads them in **Control → Support** (screenshots shown, "Reply by e-mail" opens their mailbox, mark resolved, delete). There is no e-mail sending yet: the owner is not notified, so check the inbox. Contact chips: e-mail `NEXT_PUBLIC_SUPPORT_EMAIL` (default support@slidesdone.app, set the real one) and WhatsApp `NEXT_PUBLIC_SUPPORT_WHATSAPP` (digits with country code; the chip is hidden if empty). API tests `routes/support.test.ts` (7), e2e A1–A5 in suite 43.
- **Header (website):** the "Ingest Modes" link is gone. Signed in, the header shows one "My decks" button and one account menu (avatar → e-mail, Plan & billing, Sign out) instead of an e-mail link and a button that did the same thing; the phone menu has "My decks" and "Sign out". Suite `e2e/suites/30-landing-auth.mjs` 8/8. Note: the app resets `button { border: none; background: none }` globally, so a new `<button>` that needs a border or background must use `!border-2 !bg-white` style overrides.

## Before launch
☐ Run migration 0034 (`post`) and check the table exists. ☐ Set `WEB_REVALIDATE_URL` and `REVALIDATE_SECRET` in production (API) and `REVALIDATE_SECRET` (website). ☐ Uploaded post pictures use the same storage as other pictures (local disk in dev): confirm S3 in production and that `/api/v1/content/images/*` is reachable through the CDN. ☐ Privacy Policy / Terms: nothing new is collected from readers. ☐ Write the first posts (the pages say "coming soon" while empty). ☐ Add `/blog`, `/news`, `/guides` links to the main header if the bar has room (they are in the footer and the phone menu).
