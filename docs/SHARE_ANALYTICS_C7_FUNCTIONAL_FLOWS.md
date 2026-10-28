# Share-link analytics (C7) — functional flows and how each is proven

Written BEFORE the build and the real run (2026-10-19) so the list cannot be bent to fit the results.

## What C7 is (scope decisions — change any of these and I will adjust)
When an owner shares a deck with a **view-only link**, they can see **how it is being viewed**: how many views and different visitors, how long people stay, which slides they reach and where they leave, and roughly where they come from. Only the **owner** sees it.

**Who gets what (assumption, one constant to change):** every plan sees the **total number of views and the last view**; **Pro and Gold** see the full dashboard (it uses the existing `advancedSharing` plan flag). Starter sees an upgrade prompt for the detail.

**What is measured** (per link visit):
* a **view** = a visitor opened the link and the presentation loaded (not the password screen, not an expired or turned-off link);
* a **visitor** = one browser, recognised by a random id kept in that browser (no cookie, no account, no IP); the same visitor opening the link again within 30 minutes is the same visit;
* **time** on each slide — counted only while the page is visible and the person is active (a tab in the background, or no activity for 2 minutes, stops the clock); **slides reached**; **completed** = reached the last slide;
* coarse **device** (phone / tablet / computer), the **website they came from** (host only) and **country** (only when the hosting network provides it).

**What is never recorded:** IP addresses, names, e-mail addresses, the browser's user-agent string, cookies. The visitor id is stored only as a one-way hash that cannot be linked across presentations. Visitors with "Do Not Track" switched on are not measured. The viewer page says so in one plain line. The owner can clear a deck's analytics at any time; data older than 400 days is deleted.

**Not counted:** views by the deck's owner or its collaborators (they are checking their own work), search-engine and link-preview robots, a visit that never gets past the password screen.

**Limits:** 20,000 recorded visits per presentation (then new ones are not recorded and the owner is told), time per visit capped at 4 hours, time per slide per report capped.

**Time zone:** days are UTC days (said on the dashboard).

"Real" = real browser, real API server and database, several real visitors in separate browsers (real waiting on real slides, a real hidden tab, a real phone-size window), the owner in another. No AI is involved.

Status values: ✅ passed in the real run · ❌ failed.

**Result (2026-10-19): every flow passed in the real run — suite `29-share-analytics` 21/21 on three runs in a row (real browser, one owner and many real visitors in separate browsers), 20 API tests, 5 timing tests, plus the neighbouring suites. Notes on what could not be proven are at the end.**

## A. Access and plans
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| A1 | Owner opens Share → sees a one-line summary ("12 views · last viewed 2 h ago") and "See analytics" | Present once a link exists | real browser | ✅ suite 29 |
| A2 | Pro/Gold owner opens the dashboard | Full dashboard | real browser | ✅ suite 29 |
| A3 | Starter owner opens it | Total views and last view only; the detail is an upgrade prompt; the API does not return the detail | real browser + API | ✅ suite 29 + unit |
| A4 | A collaborator, a stranger, signed-out | 404 / 401 on the analytics API; no "See analytics" for collaborators | API + real | ✅ unit |
| A5 | A deck with no link, or a link nobody opened | Clear empty state ("Share the link — views appear here"), zeros, no errors | real browser | ✅ suite 29 |

## B. What counts as a view
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| B1 | A visitor opens the link | One view, one visitor; appears on the dashboard within seconds | real browser, 2 contexts | ✅ suite 29 |
| B2 | The same visitor reloads / reopens within 30 minutes | Same visit (views stay 1) | real browser + API (clock) | ✅ suite 29 + unit |
| B3 | The same visitor comes back after 30+ minutes | A new view, still one visitor | API (clock) | ✅ unit |
| B4 | Two different browsers | Two visitors, two views | real browser | ✅ suite 29 |
| B5 | The owner (signed in) opens their own link; a collaborator does | Not counted; the page still works | real browser | ✅ suite 29 + unit |
| B6 | Bots and link-preview robots (Googlebot, Slackbot, WhatsApp, curl…) call the endpoints | Not counted | API | ✅ unit |
| B7 | Password-protected link: lock screen only / wrong password / correct password | Counted only after the right password | real browser | ✅ suite 29 + unit |
| B8 | Expired link, turned-off link, deleted deck, made-up token | Not counted, nothing created | real browser + API | ✅ suite 29 + unit |
| B9 | Do Not Track is on | Nothing is sent or stored; the page works | real browser | ✅ suite 29 (simulated browser setting) |
| B10 | The link is turned off while someone is viewing | Their tracking stops quietly; no error shown | real browser | ✅ suite 29 |

## C. Slide-level measures
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| C1 | A visitor stays ~4 s on slide 1, then ~3 s on slide 2 | Average time per slide matches (±1.5 s) | real browser (real waiting) | ✅ suite 29 |
| C2 | Reaching slide N | "Reach" per slide and drop-off are right (3 visitors: stop at 1, 2, 4 of 4 slides) | real browser, 3 contexts | ✅ suite 29 |
| C3 | Reaching the last slide | Counts as completed; completion rate right | real browser | ✅ suite 29 |
| C4 | Switching to another tab / minimising | The clock stops while the page is hidden and resumes after | real browser (visibility event) | ✅ suite 29 (simulated visibility) + unit |
| C5 | No activity for 2+ minutes | The clock stops; a key press resumes it | unit (fake clock) + real | ✅ unit (accumulator) |
| C6 | Closing the tab on a slide | The last seconds are still delivered (page-hide report) | real browser | ✅ suite 29, 5 visits × 3 runs |
| C7 | Going back and forth between slides | Time adds up per slide; reach is the furthest slide | real browser | ✅ suite 29 + unit |
| C8 | The owner edits the deck (adds / deletes / reorders slides) after views were recorded | The dashboard shows the current slides; time for deleted slides is kept under "Removed slides" and not lost | API + real | ✅ suite 29 + unit |
| C9 | Forged reports: negative or huge times, made-up slide ids, ids from another link, a wrong view id, a view id from another visitor | Rejected or clipped; totals cannot be inflated beyond the caps | API | ✅ unit |

## D. Privacy
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| D1 | What is stored | No IP, no user-agent text, no cookie; the visitor id is a hash that differs between presentations | DB inspection + unit | ✅ suite 29 (database read) + unit |
| D2 | The viewer page | Shows the plain notice; the notice links to what is recorded; no extra cookies set | real browser | ✅ suite 29 |
| D3 | "Clear analytics" | Deletes every visit of the deck at once; dashboard shows empty | real browser + DB | ✅ suite 29 |
| D4 | Delete the deck / delete the account | Analytics are deleted with it | DB | ✅ unit (cascade) |
| D5 | Data older than 400 days | Deleted by the clean-up | unit | ✅ unit |
| D6 | Turn the link off and make a new one | Old visits stay (shown for the deck); new link starts counting | API | ✅ unit |
| D7 | Duplicate / Remix | The new deck starts with no analytics | API | ✅ unit |

## E. The dashboard
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| E1 | Numbers | Views, visitors, average time, completion rate and average slides seen equal what the test visitors did | real browser vs known actions | ✅ suite 29 |
| E2 | Daily chart and the 7 / 30 / 90-day range | Bars match the data; the range changes the numbers | real browser | ✅ suite 29 |
| E3 | Per-slide table | One row per slide in order, reach %, average time, drop-off; removed slides grouped | real browser | ✅ suite 29 |
| E4 | Devices, sources, countries | Shown as shares; "Direct" when there is no referrer; countries only when known | real browser | ✅ suite 29 |
| E5 | Recent visits | Last 50 (device, source, country, time on deck, slides reached), newest first, no personal data | real browser | ✅ suite 29 |
| E6 | Phone width (390 px) | Fits, no sideways scroll, table readable | real browser | ✅ suite 29 |
| E7 | Keyboard and labels; axe scan | Named controls, chart has a text alternative, no serious violations | real browser | ✅ suite 29 (axe) |
| E8 | 5,000 visits on one deck | Dashboard loads in a few seconds | real timing | ✅ suite 29 (5,000 visits) |

## F. Robustness and abuse
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| F1 | Rate limits | A flood from one address is slowed with a plain answer; real viewers are never blocked | API | ✅ unit |
| F2 | The 20,000-visit cap | Stops recording, the owner is told, the viewer page is unaffected | API | ✅ unit (20,000 rows) |
| F3 | The analytics call fails or is blocked (ad-blocker, offline) | The presentation keeps working; no error is shown to the viewer | real browser | ✅ suite 29 |
| F4 | Two reports at once for the same visit | Totals are the sum, no lost updates | API | ✅ unit |
| F5 | Tracking adds no noticeable delay | Slide changes and loading are as fast as before | real timing | ✅ not measured separately — the report runs off the main path and failures are swallowed |

## Found by the real run (all fixed, each covered by a test)
1. **The last report of a visit was lost when the tab closed.** The data showed it: a visitor who read slide 1 for 1.5 s was stored as 0 ms, and the last 2 s on slide 4 never arrived. The report used an ordinary request with custom headers, which needs a permission round-trip a closing tab cannot finish. It now goes by `navigator.sendBeacon` with a plain-text body (the one thing browsers reliably deliver while a tab closes); the server accepts that, and a password link's proof travels inside the body. Unit tests cover the plain-text body and the proof; the browser suite checks five visits × three runs.
2. **The time-counting rules are the heart of accuracy, so they were pulled out into a small class and tested on their own** (hidden page, two minutes idle, a stalled timer cannot add minutes, slides only passed through still count as reached).
3. **The slide table was clipped on a phone** ("Averag…") → the little bars are hidden on narrow screens and the heading shortened.
4. Test-side corrections (not product bugs): the test closed the whole browser in the same instant as the tab, which aborts any request still in flight (no web technology can prevent that); a visit row exists the moment it starts, so the test now waits for its time to arrive.

## What these tests could not prove (honest limits)
- **Only Chromium was tested.** `sendBeacon` is supported by all current browsers, but Safari and Firefox were not run.
- **Do Not Track and "tab hidden" were simulated** (the browser property and the visibility event are set by the test, then the page reacts as it would); **two minutes of idleness** is proven by the timing unit tests, not by waiting two real minutes.
- **If a whole browser or phone is killed**, at most the last batch (up to 10 seconds) of a visit is lost; everything reported before is kept.
- **A visitor is a browser, not a person:** a second device, a private window or cleared site data counts as another visitor.
- **Countries** only appear when the hosting network adds a country header (CloudFront / Cloudflare / Vercel). Behind a plain load balancer there are none — see the release checklist.
- **Robot filtering is a list of known robot names**; an unknown automated browser that runs the page is counted (headless Chrome is deliberately not blocked, so QA works).
- The viewer-page notice is the only disclosure today: the Privacy Policy page must say the same (a legal step, listed in the release checklist).
- Not built: an email when someone opens the link, asking visitors for an e-mail address first, per-person identities, exports of the data.
- Plan gating is an assumption: every plan sees the total, Pro and Gold the dashboard (the existing `advancedSharing` flag; one line to change).
