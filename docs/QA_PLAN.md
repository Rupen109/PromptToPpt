# QA plan — landing page → prompt → editor → export

Goal: every page, link and button works, every flow completes, and nothing looks broken. Run with `pnpm e2e` (needs the three dev servers + Postgres up; see `e2e/README.md`). Results are written to `e2e/results/` (JSON + screenshots of every failure).

Severity: **S1** blocks a core flow or loses data · **S2** a control does nothing / wrong result · **S3** visual or copy defect.

## Suites (run in this order — later suites reuse the accounts and decks earlier ones create)

| # | Suite | What is verified |
|---|---|---|
| 1 | **Public site** | Every nav/footer/CTA link resolves (no 404, no dead `#`); hero prompt box (type, chips, attach file, add link, generate → sign-up/login hand-off with the prompt preserved); sections render with no console errors; template gallery (filter, open, prev/next, play, "Use this template"); pricing (monthly/yearly, plan buttons); FAQ accordion; responsive at 390 / 768 / 1440 (no horizontal scroll) |
| 2 | **Authentication** | Sign-up (validation, duplicate email), log-in (wrong password, success), session persists on reload, protected editor routes redirect to login and come back, log-out, Google button present; admin route blocked for non-owners |
| 3 | **Create flows** | Home dashboard; prompt → analysis → direction → outline → generate → editor (mock AI is fine; real AI smoke once); create from a template; blank deck; create project / move deck / rename / delete; plan gates (Starter limits, Pro-only templates show upgrade) |
| 4 | **Editor** | Every toolbar, format-bar, context-menu, slide-rail, style-drawer and AI-panel control: add/duplicate/delete/reorder slides, add text/shape/image, drag/resize/rotate, text formatting, colours, fonts, layout change, theme/template change, undo/redo + keyboard shortcuts, notes, autosave + reload persistence, offline/conflict banner, image dialog, sources dialog, versions dialog, present mode |
| 5 | **AI assistant** | Chat opens, request → live slide update, restyle (template/colours/fonts/motion), edit one slide, link reading, image proposal → confirm, unsupported requests answered honestly, credits/limits shown |
| 6 | **Export** | PPTX opens (re-parsed in the test: slide count, text, images, colours), PDF, PNG, JPG, HTML; Starter gets the upgrade prompt for gated formats; file names; all 3 aspect ratios |
| 7 | **Billing** | Billing page, upgrade modal, checkout opens (Razorpay test), verify, cancel; entitlements refresh unlocks Templates / Created-by-me / Projects |
| 8 | **Admin** | Owner-only dashboards load: overview, tokens, models, users, countries, errors; filters |
| 9 | **Cross-cutting** | Console errors, failed network calls (4xx/5xx), accessibility basics (labels, focus order, contrast), keyboard-only paths, slow-network and offline behaviour, reload mid-flow |

## Exit criteria
No S1/S2 open; S3 triaged; the whole suite green twice in a row; the scripted journey **landing → sign-up → prompt → deck → edit → export PPTX → open the file** passes.
