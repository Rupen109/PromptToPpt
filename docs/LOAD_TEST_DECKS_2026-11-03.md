# Deck generation load test, 1,500 users (2026-11-03)

How: `services/api/scripts/load-http.ts`. Real HTTP, separate OS processes the way production runs them: 2 API processes, 8 worker processes (250 slots each), 3 client processes driving 1,500 simulated browsers (start a deck, open it, hold the live SSE stream, follow the build, then autosave 3 times, list decks, read the plan), Postgres, live events through Postgres LISTEN/NOTIFY. Throw-away database; the Gemini key is never used (it is for light local use only).
Model: a **stand-in** with the answer times measured in the 1,500-user real-AI test (analysis 1.8 s, outline 4 s, a batch of slides about 2.5 s + 1 s a slide, critic 4 s). A local Ollama (qwen2.5:7b on this Mac, `REAL=ollama`) was run on 3 decks to check the real path: it works end to end but produces a deck in ~85-100 s at about 12 tokens/s per stream and one of three decks failed our output rules, so a laptop model measures the laptop, not the product. **Real speeds and costs come from the Gemini / OpenRouter runs later.**
Machine: one Apple M2 Pro (12 cores, 16 GB) running everything including the database and the test clients, so the numbers are conservative.

## Result (1,500 users, 40 % Starter / 40 % Pro / 20 % Gold, 10 slides)
| | A. all at the same instant (worst case) | B. arriving over 60 s (realistic) |
|---|---|---|
| Users who finished their whole session | 1,500 / 1,500 | 1,500 / 1,500 |
| Failed decks, API errors | 0, 0 | 0, 0 |
| Deck opens on screen (p95) | 3.7 s | 0.0 s |
| Queue wait (p95) | ≤ 0.5 s | 0 |
| First real slide, p95 (Starter / Pro / Gold) | 24.6 / 18.8 / 14.4 s | 11.5 / 11.5 / 11.6 s |
| Whole deck, p95 (Starter / Pro / Gold) | 26.8 / 21.8 / 17.2 s | 14.1 / 13.9 / 14.1 s |
| API p50 / p99 (reads, saves) | 10-500 ms / ≤ 1.4 s | 2-8 ms / ≤ 160 ms |
| Live update reaches the browser (p50 / p95) | 107 ms / 1.1 s | 2 ms / 5 ms |
| Peak API process | 687 MB, 174 % CPU | 365 MB, 76 % CPU |
| Peak worker process | 211 MB, 69 % CPU | 191 MB, 36 % CPU |
| Postgres connections | 57 of 100 | 54 of 100 |
Reading: with no contention every plan gets the same fast deck (nobody waits, by design); the paid plans' extra speed shows when the system is busy (A: Gold 17 s against Starter 27 s). Previously (one worker, no queue lines) 1,000 at once took 14 minutes.

## What the first run found and what was fixed (A, before and after)
The first run finished everyone with no errors but the API was the weak point: two API processes saturated (reads p50 1.5-3.5 s, p95 up to 12 s, a pushed update took 1.5 s p50 to reach the screen). Three structural changes:
1. **The deck is sent as stored** (`document::text`), not parsed and written out again: the hottest read.
2. **"Only if changed"** (`GET /presentations/:id?since=<revision>`): the editor's poll and push-pull get a few bytes when nothing changed.
3. **The editor polls every 10 s, not 2 s, while the live channel is connected** (a safety net, not a second feed).
Result: whole deck p95 29-30 s → 17-27 s, reads p50 1.5-3.5 s → 10-500 ms, live update 1.5 s → 0.1 s, whole run 50 s → 36 s.

## Still open
- **First real slide ~11 s** alone (targets 12 / 9 / 7 s): met for Starter, not for Pro and Gold. Levers in `docs/DECK_GENERATION_SCALE_ARCHITECTURE.md` section 13.
- **POST /generation/jobs is the slowest request in burst A (p50 2.9 s)**: about 30 database round trips per start (entitlements, quotas, credits, deck row). Fine when spread (9 ms), worth batching if a launch day sends thousands in one second.
- **AWS**: not measured yet. The test server is one 1 GB t4g.micro; a safe read-only HTTP check of what it can serve is the proposed first step.
- **Cost and real speed**: the Gemini and OpenRouter runs with billing on.
- Capacity rule of thumb from these runs: one API process served about 250-350 requests/s of this mix (2 processes ran at 100-174 % CPU at 726 req/s); a deck costs about 0.1 s of worker CPU.

## Real Gemini runs (same day, dev stack, throw-away users loadtest-*@example.com, the owner's own account sharing the queue)
| Run | Users | Finished | Failed | Whole deck p50 / p95 | First slide p50 | API errors | Real cost (our ledger) |
|---|---|---|---|---|---|---|---|
| 1 | 50 over 20 s | 50 | 0 | 15 s / 22 s | 12 s | 0 | $0.94 ($0.0189 a deck) |
| 2 | 300 over 60 s | 300 | 0 | 14 s / 22 s | 11.6 s | 0 | $5.43 ($0.0181 a deck) |
| 3 | 1,500 over 30 s | stopped at 21 s by the guard | n/a | n/a | n/a | n/a | $6.61 |
| 4 | 1,500 over 32 min | stopped at about 5 min by me (223 started, 210 finished) | 0 | n/a | n/a | n/a | about $4 |
Run 3 hit **Google's Tier 1 limits**: spend of **$10 per rolling 10 minutes** (about 550 decks), and per model (Gemini 3.6 Flash) 1,000 requests, 2M tokens a minute and **10,000 requests a day**. 1,500 decks is about 7,500 calls on 3.6 Flash, so the daily limit would have been crossed mid-run and the key would stay limited for the rest of the day. Run 4 was stopped for that reason. A full 1,500 needs OpenRouter (production), Tier 2 (needs $100 paid and 3 days since the first payment), or a day with an empty quota.
Findings fixed: Gemini 2.5 Flash is closed to new Google accounts (1,041 failed calls; disabled in the catalogue, migration 0041; the gateway now stops calling a model that answers "not found" for 10 minutes), the guard mistook a rate limit for a block.
About 3 % of real answers break our length rules (invalid_output): the pipeline repairs them automatically.

## Noted for later (owner, 2026-11-03)
**Fallback to OpenRouter when the Gemini key runs out.** When the Gemini key is out of balance, over a daily or spend limit, or blocked, the gateway should send the call to an OpenRouter model instead, so traffic is absorbed smoothly. The gateway already falls back across models and pauses a refusing model; what is missing is a provider-level chain (Gemini first, OpenRouter second) in the catalogue routes and the OpenRouter key. Not built.
