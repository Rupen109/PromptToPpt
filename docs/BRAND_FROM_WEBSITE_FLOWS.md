# "Get brand from a website" (C1) — functional flows, pass criteria, and how each is proven

Written BEFORE the real run (2026-10-10) so the criteria cannot be bent to fit the results. **Result (2026-10-10): every flow below passed in the real run; extraction criteria X1–X8 are met (see the table at the end).** "Real" = real browser, real API server and database, and the REAL internet (real websites, real DNS, real redirects). There is no AI in this feature, so no AI cost.

Where it lives: Style panel → Brand tab → "Get brand from a website" (paste a site → Find brand → Apply / Save as brand kit / Update my kit).

Status values: ✅ passed in the real run · ❌ failed.

## Acceptance criteria for the extraction itself (the part that depends on the real web)

Tested by `services/api/scripts/brand-probe.ts` against ~30 real sites whose brand colours are well known (list and expected colours are in that file, written before running).

| # | Criterion | Target |
|---|---|---|
| X1 | Never crashes or hangs: every site returns a result or a clear error | 100%, each under 25 s |
| X2 | Known-brand colours: the site's well-known brand colour is the extracted primary OR accent (within a close colour distance) | ≥ 75% of sites that publish their brand colour in static HTML/CSS |
| X3 | Honest confidence: whenever the primary is wrong, the result says "low confidence" or has no colours (never a confident wrong answer for more than 1 in 10 sites) | ≥ 90% of wrong answers flagged low |
| X4 | No framework/furniture colours picked as brand (cookie banners, default link blue on sites that are not blue) | listed per site, each analysed |
| X5 | Logo: found and stored (PNG/JPEG) | ≥ 60% of sites; the rest clearly say "no usable logo" |
| X6 | Fonts: heading/body found and mapped to a font we can render | ≥ 70%; never an invalid font name |
| X7 | Name: a sensible company name | ≥ 80% |
| X8 | Speed | median < 6 s |

## Flows (real browser + real server + real internet)

### A. Access and input
| ID | Flow | Must be true | Status |
|---|---|---|---|
| A1 | Starter user opens the section | Explains the feature and offers the upgrade; no lookup possible | ✅ real browser (23) |
| A2 | Pro user types `stripe.com`, `https://www.stripe.com/`, `  Stripe.com/pricing?x=1  `, upper case, an address with a path or query | All work (protocol added, trimmed) | ✅ real browser, real sites (23) |
| A3 | Empty input / spaces / not a web address (`hello world`) | Button disabled or a clear message; nothing happens on the server | ✅ real browser — checked in the page, nothing sent (23) |
| A4 | Pressing Enter in the field | Starts the lookup (form submit) | ✅ (23) |
| A5 | Double click on Find brand | One lookup | ✅ one request (23) |
| A6 | Very long address (2000+ chars), unicode domain (`münchen.de`) | Clear message or works; no crash | ✅ 2000+ chars and münchen.de (23) |

### B. Results (real sites)
| ID | Flow | Must be true | Status |
|---|---|---|---|
| B1 | A site with clear brand colours (e.g. Spotify, Airbnb, Swiggy) | Name, colours, fonts, logo shown; "Apply" puts them on the deck | ✅ dropbox.com, real (23) |
| B2 | Applying | Deck colours change to the brand's; fonts change; logo on every slide; one undo (⌘Z) reverts all | ✅ (23) |
| B3 | Only some parts ticked | Only those parts applied | ✅ (23) |
| B4 | Colours edited with the colour pickers before applying | The edited colours are applied | ✅ (23) |
| B5 | A site with no brand colours (example.com, Wikipedia) | "No brand colours found" / low-confidence warning; Apply disabled for what is missing; nothing wrong applied | ✅ example.com (23) |
| B6 | A script-rendered site (e.g. Linear, Twitch) | Either correct colours or the low-confidence warning | ✅ Linear says "low confidence"; Twitch correct (probe) |
| B7 | Save as brand kit / Update my kit | Kit holds the colours, fonts, logo, website; survives reload | ✅ (23) |
| B8 | Look up the same site twice | No duplicate junk stored; same result | ✅ logo reused (23 + unit) |
| B9 | Result with a logo, then the logo link on the site later breaks | The saved logo still works (it is stored on our side) | ✅ the logo is served from our side (23) |

### C. Failures (real internet)
| ID | Flow | Must be true | Status |
|---|---|---|---|
| C1 | Domain that does not exist | Plain-language error, no stack/technical text | ✅ (23) |
| C2 | Site returns 404 / 403 / 500 / blocks bots (LinkedIn, Instagram) | Plain-language error | ✅ 404 / 403 / 5xx / social login walls / sign-in redirects (23 + probe + unit) |
| C3 | Address is a PDF / image / not a web page | "not a web page" style message | ✅ PDF and binary (23 + probe) |
| C4 | Very slow site (15 s delay) | Gives up cleanly (time limit), message, UI usable again | ✅ 10 s limit, form usable (23) |
| C5 | Redirect chains (`http://` → `https://`, non-www → www) | Followed, result for the final site | ✅ airbnb.com (auto-submitting redirect form) and http→https, www (probe) |
| C6 | Too many lookups (10 per hour) | Clear "try again later" message | ✅ friendly "wait a while" message (23) |
| C7 | Offline / our API down | Message, not a frozen spinner | ✅ (23) |

### D. Security (real DNS and redirects)
| ID | Flow | Must be true | Status |
|---|---|---|---|
| D1 | `127.0.0.1`, `localhost`, `[::1]`, decimal IP `2130706433`, hex `0x7f.0.0.1`, `169.254.169.254`, `metadata.google.internal`, `10.x`, `192.168.x` | All refused before any request; message says it is not allowed | ✅ all nine forms refused before any request (probe + unit; in the browser the address box rejects bare IPs first) |
| D2 | A real domain that resolves to 127.0.0.1 (`localtest.me`) | Refused (connect-time DNS check) | ✅ localtest.me and 127.0.0.1.nip.io (23 + probe) |
| D3 | A public site that REDIRECTS to a private address | Refused at the redirect | ✅ httpbin redirects to 127.0.0.1 and 169.254.169.254 (23 + probe) |
| D4 | A page that links a stylesheet/logo on a private address | Ignored; the lookup still succeeds | ✅ unit |
| D5 | Another user's logo asset used as a kit logo | Refused (unit-tested) | ✅ unit |
| D6 | Nothing in the UI/API response leaks internal errors, paths or tokens | verified on all failure cases | ✅ every failure message checked for technical text (23 + unit) |

### E. Data hygiene
| ID | Flow | Must be true | Status |
|---|---|---|---|
| E1 | Many lookups | Logo files do not pile up without limit (reuse per site; a per-user cap) | ✅ same site → same logo file (unit + 23); the 100-logo cap is in the code but not exercised by a test |
| E2 | A lookup result nobody uses | Does not count as an AI picture; no effect on quotas | ✅ unit |

## Result of the real run (probe: 34 real sites, 20 failure/attack addresses; browser suite `23-brand-website`: 19/19)

| Criterion | Target | Result |
|---|---|---|
| X1 never crashes/hangs, <25 s | 100% | ✅ 100% (slowest 10 s = the time limit) |
| X2 known-brand colour found | ≥75% | ✅ 79% (19/24) |
| X3 wrong answers flagged low confidence | ≥90% | ✅ 5/5 |
| X5 logo stored (PNG/JPEG) | ≥60% | ✅ 75% (SVG-only logos are skipped; their colour is still used) |
| X6 fonts mapped | ≥70% | ✅ 88% |
| X7 sensible name | ≥80% | ✅ 100% |
| X8 median time | <6 s | ✅ 1.7 s |
| Failure/attack cases handled badly | 0 | ✅ 0/20 |

Sites that still fail, and why (all say "low confidence" or give a plain message, none answers wrongly with confidence): mailchimp, wordpress.org, shopify (brand colour appears only in scripts or images), swiggy and slack (intermittently refuse automated visitors — 403/challenge page), linear.app (script-rendered), baidu.com (too slow from here). The probe's list is a mix of old and new brand colours, so ±1 site can swing the percentage; one expectation (HubSpot) was corrected after its own logo file showed the current colour.

## Found by the real run (all fixed, each covered by a test)
1. **A site's reply could crash the whole API server.** Some sites answer in `zstd` compression, which the HTTP client advertised but Node 23.7 cannot decode → an uncatchable error ended the process (every user logged out of everything). Fixed twice: all outbound requests to user-supplied addresses now go through one `safeFetch` that never asks for zstd (brand, sources, export pictures), and the server survives stray errors from outbound requests (logs them) while still exiting on real internal errors. Test: `safe-fetch.test.ts`.
2. **LinkedIn / Instagram / Facebook / X returned the login page's colours as "brand"** → refused with a plain message; pages that bounce to a login form are detected too, and a deep link that needs a sign-in falls back to the site's public front page (Netflix `/browse` found by the browser suite).
3. **Raw technical errors** ("fetch failed", "DOMException … timeout") → every failure is one plain sentence.
4. **Large pages (Atlassian, 2.6 MB) were refused** → read as far as the limit allows.
5. **Self-redirecting pages (Airbnb)** returned an empty "Redirecting…" page → followed.
6. **Wrong logos** (a partner's "Logo_Woo_color.png" for Mailchimp) → customer/partner/badge images are never taken as the company logo; header logo → touch icon → anywhere else.
7. **Brand colour from CSS was often a UI colour** → the logo's own colour (PNG pixels or SVG fills) now confirms or corrects it; a logo that disagrees with the page makes the result "low confidence".
8. **Junk font names** ("0em", "330", "calc(…)", "Pin Sans)") → only real font names; monospace faces are never a brand font.
9. **Taglines as company names** ("Online Shopping Site for Mobiles, …") → falls back to the domain name.
10. **Logo files piling up** with every lookup → the same site reuses its stored logo; a per-person cap of 100.
11. **Rate-limit message was "Too many requests"** → a clear "wait a while" sentence; lookup errors now show right under the address box, "hello world" is rejected on the page without a request.

## Still open (not part of C1, found on the way)
- **Deleting a brand kit deletes its logo file, so a deck that already uses that logo shows a broken image.** Needs reference counting or "keep files that are placed on slides" (see the release checklist).
- SVG logos cannot be placed in a PowerPoint, so they are not stored (the colour is used).
- 10 lookups/hour is counted in server memory per instance — move to a shared store before running several API instances (same as the other limiters).
