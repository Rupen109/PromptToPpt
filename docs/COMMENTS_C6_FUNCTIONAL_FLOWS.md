# Comments (C6) — functional flows and how each is proven

Written BEFORE the build and the real run (2026-10-16) so the list cannot be bent to fit the results.

## What C6 is (scope decisions — change any of these and I will adjust)
People who work on a deck together can leave **comments on slides**: a note on a whole slide or pinned to a spot on it, replies in a thread, mark a thread resolved, mention a teammate with `@`. Comments are working notes, not content: they never appear on the slides, in Present mode, in a PPTX/PDF/image export, or on a view-only share link.

* **Who can comment:** the deck's owner and its invited collaborators (the "Collaborating" people). The owner can comment on every plan (notes to self); collaboration itself still needs Pro/Gold as it does today. **Not in this version:** people who only have a view-only link (anonymous comments need a name step and spam control) — listed in the release checklist.
* **Who can do what:** anyone with access can comment, reply, resolve and reopen. Only the author can edit a comment. The author or the owner can delete a comment (deleting the first comment deletes the thread).
* **Mentions:** `@name` of the owner or an active collaborator. The mentioned person gets one email (with the excerpt and a link), at most one per person per deck per 10 minutes. Replies do not email.
* **Unread:** a dot on the Comments button and the slide until the person has opened the panel.
* **Live:** a new comment, reply or resolve shows up for the others within a second or two (the existing live channel; a slower refresh covers a dropped connection).
* **Limits:** 2,000 characters per comment, 500 threads per deck, 200 comments per thread, 3,000 comments per deck, 40 comment actions per minute per person.
* **Not copied:** Duplicate and Remix start with no comments. Deleting a deck deletes its comments. Comments on a slide that was later deleted stay, under "On removed slides" (and come back to the slide if the deletion is undone).

"Real" = real browser, real API server and database, two real accounts (owner + collaborator), real emails read from the server's mail log. No AI is involved, so no AI cost.

Status values: ✅ passed in the real run · ❌ failed.

**Result (2026-10-16): every flow passed in the real run — suite `28-comments` 23/23 (real browser, two real accounts, real mail log), 18 API tests, 6 editor tests, plus the neighbouring suites. Notes on what could not be proven are at the end.**

## A. Access
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| A1 | Owner (any plan) opens Comments | Panel opens; empty state explains what comments are | real browser | ✅ 28 |
| A2 | An invited collaborator opens the same deck | Sees the owner's comments and can add their own | real browser, 2 accounts | ✅ 28 |
| A3 | A stranger / signed-out / a view-only-link visitor calls the comment API | 404 / 401; nothing leaks | API + real | ✅ unit + suite 28 (share page) |
| A4 | Collaborator removed (or leaves) | Comment access ends at once; their old comments stay, shown with their name | real API + browser | ✅ 28 + unit |
| A5 | The owner's plan stops including collaboration | Collaborators get the existing upgrade answer; the owner can still comment | API | ✅ unit |

## B. Writing
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| B1 | Comment on the current slide (no pin) | Thread appears in the panel under that slide; the slide's bubble count goes up | real browser | ✅ 28 |
| B2 | Pin to a spot: choose "Pin to a spot", click the slide | A numbered pin appears there; clicking the pin opens its thread; the pin stays put when the window is resized | real browser | ✅ 28 |
| B3 | Reply | Added under the thread in order, with name and time | real browser | ✅ 28 |
| B4 | Empty, spaces only, 2,001 characters, 5,000 characters | Refused with a plain message; nothing saved; the draft is kept so it is not lost | real browser + API | ✅ 28 + unit |
| B5 | `<script>`, HTML, emoji, right-to-left and long unbroken text | Shown as plain text; layout holds; nothing runs | real browser | ✅ 28 + unit |
| B6 | Cmd/Ctrl+Enter sends; Enter adds a line; Esc cancels | As said | real browser | ✅ 28 |
| B7 | Double click on Send | One comment | real browser + DB | ✅ 28 |
| B8 | A comment on a slide id that does not exist, bad pin numbers (negative, > 1, text) | Refused | API | ✅ unit |

## C. Mentions and email
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| C1 | Type `@` | A list of the owner and active collaborators (names only); arrow keys + Enter pick one | real browser | ✅ 28 |
| C2 | Send a comment with a mention | The mention is highlighted; the mentioned person gets ONE email with the excerpt (plain text) and a link to the deck | real browser + server mail log | ✅ 28 (real mail log) + unit |
| C3 | Mention yourself, a stranger's id, a removed collaborator | No email; a made-up id is refused or shown as plain text | API | ✅ unit |
| C4 | Many mentions of the same person within 10 minutes | Still one email | API | ✅ unit |
| C5 | An email body with HTML / script in the comment | Sent as plain text; nothing executes | unit | ✅ unit (plain text only) |
| C6 | A mention of someone who is later removed | Shown as "@former member" | API | ✅ unit |

## D. Managing threads
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| D1 | Resolve, then reopen | Moves to "Resolved" and back; pins of resolved threads are hidden but the panel can show them; both people see it | real browser, 2 accounts | ✅ 28 |
| D2 | Edit own comment | Shows "edited"; others see the new text; nobody else can edit it (API 403/404) | real browser + API | ✅ 28 + unit |
| D3 | Delete own comment; owner deletes a collaborator's comment; collaborator tries to delete the owner's | Allowed / allowed / refused; deleting the first comment removes the thread | real browser + API | ✅ 28 + unit |
| D4 | Filter: open / resolved / all, and "this slide" / "all slides" | Lists follow | real browser | ✅ 28 |
| D5 | Jump: clicking a thread goes to its slide and flashes its pin | Works from any slide | real browser | ✅ 28 |
| D6 | Delete the slide a thread is on; undo the deletion | Thread moves to "On removed slides"; returns to the slide on undo | real browser | ✅ 28 |

## E. Live and unread
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| E1 | Collaborator posts while the owner has the deck open | The owner sees it within ~2 s without reloading; the unread dot shows | real browser, 2 accounts | ✅ 28 |
| E2 | Opening the panel clears the dot; own comments never make a dot | As said | real browser | ✅ 28 |
| E3 | Live connection dropped (offline) then back | Comments catch up on reconnect or within a minute | real browser | ✅ 28 |
| E4 | Two people post at the same moment | Both appear once, in order, no duplicates | real browser | ✅ 28 |

## F. Comments stay out of the content
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| F1 | Present mode and the view-only link page | No comment text, no pins | real browser | ✅ 28 |
| F2 | Export PPTX / PDF / PNG / HTML | The file does not contain any comment text | real browser, files inspected | ✅ 28 (PPTX inspected) |
| F3 | The public share endpoint and version history responses | No comment fields | real API | ✅ unit |
| F4 | Duplicate and Remix | New deck has zero comments; the original keeps its own | real browser | ✅ 28 + unit |
| F5 | Delete the deck | Comments are gone from the database | DB | ✅ unit (purge) |
| F6 | Undo/redo and autosave of the deck while comments change | Comments never enter the deck document or its revision number | real browser + API | ✅ 28 + unit |

## G. Limits and robustness
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| G1 | 500 threads / 200 comments per thread / 40 actions per minute | Plain message at each limit, nothing half-saved | API | ✅ unit |
| G2 | API down or slow while sending | Message, the draft is kept, Send works again | real browser | ✅ 28 |
| G3 | 300 threads on one deck | Panel and rail stay responsive | real browser | ✅ 28 |
| G4 | Phone width (390 px) | Panel is a full-width sheet; composer and Send reachable; pins tappable | real browser | ✅ 28 |
| G5 | Keyboard and labels | Every control has a name; Tab reaches composer, Send, Resolve; focus returns sensibly | real browser | ✅ 28 (names, Tab, axe scan) |
| G6 | Other people's comments are text only; names come from the server, a client cannot post "as" someone else | author id always the signed-in person | API | ✅ unit |

## Found by the real run (all fixed, each covered by a test)
1. **Two people with the same display name could not be told apart in a mention** (`@Kit QA` could go to the wrong person, so the wrong person got the email). The composer now remembers exactly whom you picked from the list; a name typed by hand only becomes a mention when exactly one person has it.
2. **A person picked earlier and then deleted from the text was still "remembered"** and swallowed the next mention. Picks now survive only while their `@name` is still in the text.
3. **Fast typing right after choosing a name landed in the wrong place** (the caret was put back a frame late). The caret is now restored before the browser handles the next key.
4. **The slide-rail comment bubble sat behind the "⋯" button.** Moved.
5. **The mention list had a button inside a list option** (an accessibility error found by the axe scan). It is now a proper listbox.
6. **The panel loads all of a deck's comments at once** and 500 threads × 200 comments would have allowed about 100,000 rows → a whole-deck cap of 3,000 comments with a plain message.
7. **Found on the way (not C6):** the Billing page had two unnamed progress bars and low-contrast small grey text (axe) → named and darkened.
8. Test-side corrections: the owner had just added slides so the active slide was slide 4; the deck title contained the word "Comments"; the Tab check needs text typed so the Comment button is enabled.

## What these tests could not prove (honest limits)
- **People with only a view-only link cannot comment** (by design in this version — anonymous comments need a name step and spam control).
- **Real e-mail delivery:** the mention email is proven as the server's real message (read from its mail log, plain text, one per person per 10 minutes); delivery through the production provider (Resend) was not exercised.
- **Production live updates** use Postgres LISTEN/NOTIFY (`LIVE_BUS=pg`); this run used the single-process bus. A minute-level refresh covers a dropped connection.
- A pin stays at its position on the slide; it does not follow an element that is later moved or deleted. Comments are plain text (links are not clickable). There is no comment search and no email for replies.
- Resolved/deleted threads and the 3,000-comment cap mean a very busy deck needs housekeeping; there is no automatic archive.
- The panel was scanned with axe while open (with the mention list showing); the pins on the slide were checked by position, not by a screen reader.
