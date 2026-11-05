# Deck generation: speed for everyone, at any scale (architecture proposal v2)

Status (2026-11-03): **steps 1-4 are BUILT and measured with a stand-in model (section 12); steps 5-6 and the production infrastructure are open (section 13).** v1 written 2026-11-02 after the 1,500-user test; **v2 restructured the same day** after the owner's direction:
*nobody waits, not even the free plan; paid plans are faster; the free plan is a deliberate acquisition cost.*
Measurements: `docs/LOAD_TEST_AI_2026-11-02.md`. Everything marked **target** is a goal to be proven by the tests in section 9, not a promise.

---

## 1. The requirement, in the owner's words
1. A first-time user must not wait. If the first experience is slow they never buy, so **speed is the conversion funnel**.
2. We accept losing money on the Starter/free plan to convert users: it is an **acquisition cost**, so the free plan gets the same quality and *no queue*; paid plans get *more* speed on top.
3. Every plan gets the best result in the least time; only the **extra** speed differs by plan.
4. It must hold at thousands to lakhs of users, and use proven packages and patterns where they exist.

## 2. Where the time goes today (measured)
| Stage | Time | Note |
|---|---|---|
| Waiting in the queue | **up to 14 min** at 1,000 at once | one deck at a time per API process |
| Prompt analysis | ~1.8 s | fast model |
| Outline | ~9.6 s | the slow model, and everything waits for it |
| Slide writing (batches in parallel) | ~6.5 s per batch | already parallel |
| Template choice, critic, checks | ~3-5 s | not needed before the person can start reading |
| **Nothing visible until the end** | the deck row is only created in the last step, the browser polls a progress bar | the person stares at a bar for 25-30 s |

So even with no queue, the person waits ~25-30 s for **anything** to appear. Two separate problems: *the line* and *the blank screen*.

## 3. Three levers (in this order of impact)

### A. Show the deck while it is written (progressive generation): the biggest lever
What others measured (one developer's own test, 100 users, 10-slide decks, so treat as indicative): **time to first slide 28.3 s → 1.2 s, total time unchanged (32 s), perceived wait 3.4× shorter, people who stayed engaged during generation 12 % → 78 %** ([dev.to write-up](https://dev.to/jiade/i-built-an-ai-presentation-generator-using-react-streaming-heres-what-actually-works-1ha4)). Practitioner guidance agrees: streaming does not shorten the total, it brings the first sign of life forward, and the gap between click and first feedback should be milliseconds ([latency perception](https://tianpan.co/blog/2026-04-20-latency-perception-gap-ai-interfaces)).

For us, concretely:
1. **Second 0:** the click opens the editor at once on a deck that already exists (created in the first database write, not the last).
2. **~4 s:** one fast call writes the **title and the outline skeleton** (analysis and outline merged; the fast model writes an outline in ~3.9 s where the strong one takes ~9.6 s). The slides appear as titled placeholders; the template and colours are already chosen.
3. **~8 s:** the **first batch is small (1-2 slides, ~3-4 s)** so real content lands fast; later batches are larger and run in parallel (as today). Each finished batch is saved into the deck and **pushed to the open editor**; the person reads slide 1 while 2-12 are still being written.
4. Pictures flow in after (already looked up alongside the writing). The critic and checks run last and fix quietly.
5. The person can edit finished slides at once; slides still being written are locked placeholders (the editor's save already merges changes safely).

Estimated from the measured per-call times: **deck on screen in ~1 s, titled outline in ~4 s, first real slide ≈ 8 s, whole deck ≈ 15-20 s** (today 25-30 s with nothing visible until the end). A further lever for the fastest plans: **start the first batch while the outline is still streaming** (read the outline's first entries as they arrive), which brings the first real slide to ≈ 5 s. All of this is an estimate to be proven (section 9).

### B. Never stand in a line: capacity with headroom, not capacity on demand
- Scaling on "how long the line is" means someone already waited. We scale on **free slots**: keep **at least 40 % of worker slots idle** at all times, so a new deck starts within a second.
- This is cheap. 3,000 decks a minute is ~1,250 decks at once; with 40 % headroom that is ~2,100 slots = ~88 worker tasks ≈ **$4.40 an hour** at peak. The AI is the cost, not the servers.
- **Reserved floor per lane** so the free plan can never be crowded out by a surge of paid users or the other way round (proposal: Gold 30 %, Pro 40 %, Starter 30 % of slots reserved, spare capacity flows to whoever is waiting).
- AWS's own guidance for this kind of worker pool: scale on **backlog per worker** (acceptable latency ÷ average job time) rather than raw queue depth, and protect running tasks from being shut down when scaling in ([AWS re:Post](https://repost.aws/es/questions/QUUxiucv6fQL2BfP3JSWIUUA/how-can-i-properly-scale-an-ecs-with-sqs-standard), [StackHarbor](https://stackharbor.com/en/knowledge-base/awsscale-custom-cloudwatch-metric-scaling/)). Our target latency is ~0, so the "acceptable backlog" per slot is tiny, which in practice means *keep headroom* (above).
- Our jobs are already **checkpointed**, so workers can run on cheap spot machines and be stopped at any moment.

### C. Make the real time shorter (all plans)
- Merge analysis + outline into one fast call (saves ~1.8 s and the slow-model outline wait).
- Smaller first batch, more parallel batches (parallelism is where plans differ, below).
- Turn on **prompt caching** (0 cached tokens on Gemini 3.x in the test): the fixed instructions are already first in each prompt.
- Move the template choice and the critic **off the critical path**.

## 4. Same quality for everyone, extra speed for paid plans
| | Starter (free) | Pro | Gold |
|---|---|---|---|
| Model that writes the slides | **same strong default as paid** (no worse results) | same | same, plus the frontier option |
| Queue wait (**target**, p95) | ≤ 3 s | ≤ 1 s | ≈ 0 |
| First real slide visible (**target**, p95) | ≤ 12 s | ≤ 9 s | ≤ 7 s (≤ 5 s once the outline streams) |
| Whole deck (**target**, p95) | ≤ 45 s | ≤ 30 s | ≤ 20 s |
| Deck opens on screen (**target**, p95) | ≤ 2 s | ≤ 1 s | ≤ 1 s |
| How the extra speed is made | normal lane, 3 batches in parallel | priority lane, 5 in parallel | reserved slots, 8 in parallel, picks first |
| When the system is overloaded | still opens the deck at once and shows position and estimate | same, ahead of Starter | same, first |

The plans already promise this (standard / fast / ultra speed); today nothing delivers it.

**What the free plan costs.** Measured AI cost per deck: **$0.0144**. A Starter user who spends every credit costs us at most **$0.07 a month** (`docs/PRICING_PLANS_V4.md`), so **100,000 free users ≈ $7,000 a month at the very most**, and most use a fraction. That is the price of letting them feel the product at full speed; abuse stays contained by one account per mailbox, e-mail confirmation and the per-account daily limit.

## 5. The design
```
 click ─► API (stateless, many)
            │ 1. create the deck row NOW, return its id; editor opens on it
            ▼
      ┌───────────┐  lane by plan   ┌──────────────────────────────┐   limit-aware calls    ┌──────────────────┐
      │ Job table │ ───────────────►│ Queue: Gold / Pro / Starter  │ ─────────────────────► │ AI gateway       │
      │ (Postgres)│                 │ priority + reserved slots    │  token buckets,        │ keys/providers   │
      └───────────┘                 └──────────────┬───────────────┘  weighted routing,     │ pooled           │
            ▲                                      ▼                  retry budget          └──────────────────┘
            │ batch saved into the deck   ┌────────────────────┐
            └─────────────────────────────│ Worker service      │  N job slots each, spot, autoscaled on free slots
   editor receives slides as they finish  │ stage 1 skeleton    │
   (server-sent events)                   │ stage 2 batches ×K  │  K by plan
                                          │ stage 3 pictures    │
                                          │ stage 4 critic/fix  │  off the critical path
                                          └────────────────────┘
```
- **Workers are their own service** (the API runs no generation), `WORKER_SLOTS` jobs each (default 24), same safe claim query, any number of processes.
- **The provider layer is limit-aware** (section 6): a request waits its turn at a token bucket instead of bursting into a 429.
- **Progress is pushed**, not polled (server-sent events): at 10,000 decks in flight, polling is ~3,300 requests a second of noise.
- **Honest wait if it ever happens:** position and estimate on screen; never a blank bar.

## 6. The AI provider: the real ceiling
At 3,000 decks a minute: ~24 million input and ~9.6 million output tokens a minute. No default account allows that.

| Finding | Source | What we do |
|---|---|---|
| Vertex pay-as-you-go uses **Dynamic Shared Quota**: no fixed limit, a shared pool, and 429s appear under contention even below your own usage; Google says combine it with backoff and retry | [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/learn-how-to-handle-429-resource-exhaustion-errors-in-your-llms), [forum reports](https://discuss.google.dev/t/vertex-gemini-429-resource-exhausted/172569) | steady client-side rate limiting (never retry bursts), use GA models not previews, spread over regions |
| **Provisioned Throughput** is the usual fix for steady, SLA-bound traffic, with pay-as-you-go as overflow; it can still return 429 above the reserved amount | [Vertex docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/resources/provisioned-throughput), [429 on PT](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/error-code-429) | reserve throughput for the **baseline** (the headroom we always run), overflow on pay-as-you-go; confirm current Gemini model support and price first |
| **OpenRouter** (our production plan): no gateway cap on paid models, the upstream provider returns 429 when saturated; `:free` models are capped (about 20 requests a minute) | [OpenRouter limits (third-party summaries, verify)](https://fast.io/resources/openrouter-rate-limit/) | never use free models for users; read the real limits of our key (`GET /api/v1/key`); route across several providers |
| Gateways pool several keys/providers with weights and RPM/TPM limits; fallback on 429 is *reactive*, limit-aware balancing is *proactive* | [Portkey load balancing](https://www.portkey.ai/docs/product/ai-gateway/load-balancing), [Portkey vs LiteLLM](https://truefoundry.com/blog/portkey-vs-litellm) | build the proactive part into **our** gateway: token bucket per key and model, weighted routing across keys and providers, a retry budget, and fall back across providers (not to a weaker model) |

**Owner actions (cannot be coded):** request a quota increase / Provisioned Throughput on Vertex, confirm OpenRouter limits for the production key, and set up a second provider or account so one outage or one quota never stops the product.

## 7. Which package? (decision table)
Our pipeline already survives crashes (every stage is checkpointed and the job is idempotent), so we do **not** need a durable-execution engine to get safety. What we need is: priority lanes, a rate limiter toward the provider, worker concurrency, push progress and autoscaling.

| Option | Good for | Against | Verdict |
|---|---|---|---|
| **Our Postgres queue** (today) | zero extra infrastructure, fair share per person | claim query gets slow with a long queue; no priority lanes or rate limits | keep **only** for the first steps; replace the claim query |
| **BullMQ on Redis** | the standard Node.js queue; per-worker concurrency, global rate limiter, priorities | needs Redis (ElastiCache); no durable step model (we already have it) | **recommended transport** for lanes, priority and the provider limiter |
| **Amazon SQS** (one queue per lane) | nothing to operate, scales almost without limit | no priorities inside a queue, no rate limiter | the alternative if we want no Redis; lanes become separate queues |
| **Inngest** | per-user concurrency, throttling, step durability, managed | per-step pricing is expensive at high volume of small steps; our work already checkpoints | not now |
| **Trigger.dev** | managed compute, open source, built for AI | concurrency limits only, no time-based rate limit | not now |
| **Temporal** | strongest durable workflows | heavy to run; pays off with hundreds of workflows and compliance needs | not needed |
| **LiteLLM / Portkey** | key pooling, RPM/TPM limits, fallbacks as a ready service | another service in the path; our gateway already has chains and fallbacks | borrow the ideas, extend our gateway; revisit if we add many providers |

Sources for the table (mostly vendor-written comparisons, so verify details before buying): [Trigger.dev vs BullMQ](https://trigger.dev/vs/bullmq), [Inngest: best job queue alternatives](https://www.inngest.com/blog/best-job-queue-alternatives), [Inngest alternatives compared](https://hookdeck.com/webhooks/platforms/inngest-alternatives), [durable execution for AI agents](https://noqta.tn/blog/durable-execution-ai-agents-inngest-trigger-temporal-2026).

## 8. Capacity and cost at a glance
`decks being built at once = decks started per minute × 25 s ÷ 60` (checked: it predicted the measured 14 minutes).

| Decks per minute | At once | Slots with 40 % headroom | Worker tasks (24 slots) | Worker cost, per hour at peak | AI cost per hour at peak |
|---|---|---|---|---|---|
| 600 | 250 | 420 | 18 | ≈ $0.9 | ≈ $520 |
| 3,000 | 1,250 | 2,100 | 88 | ≈ $4.4 | ≈ $2,600 |
| 10,000 | 4,170 | 6,950 | 290 | ≈ $14 | ≈ $8,600 |

The AI bill dwarfs the servers, which is why speed headroom is the cheap part of this design, and why the provider plan (section 6) and per-plan credits matter most.

## 9. Proof before trust (mostly free)
1. **Stub provider** with realistic delays (a fake model answering in 2-5 s, refusing at a set rate like Google did): run 1,000 → 5,000 → 20,000 decks at once for **$0** and measure, **per plan**: queue wait, time to first slide, time to whole deck (p50/p95), refusals, worker count over time. These are the targets in section 4.
2. A **small real-AI run** (a few hundred decks, about $5) to confirm tokens and the provider's real limits.
3. Re-run the assistant test the same way.
4. Gates: a number fails the step if it misses its target.

## 10. Build plan (each step ends at a measured gate; nothing is pushed without asking)
| Step | Work | Gate |
|---|---|---|
| 1 | **Progressive generation**: create the deck first; skeleton in ~4 s; small first batch; each batch saved into the deck and pushed to the editor; "still writing" state in the editor | deck on screen ≤ 2 s and first real slide ≤ 12 s with an empty queue; the person can edit slide 1 while 2+ are written |
| 2 | **Worker service + slots + headroom autoscaling** (and the faster claim query) | stub run: queue wait p95 ≤ 3 s for every plan at 5,000 at once |
| 3 | **Limit-aware gateway**: token buckets, weighted routing across keys and providers, retry budget, provider-level fallback | zero 429s reaching users in a 5,000-deck stub run at the configured quota |
| 4 | **Plan lanes and reserved slots** (BullMQ, or SQS per lane) + per-plan parallelism | Gold ≤ 20 s and Pro ≤ 30 s whole deck while Starter has 10,000 waiting |
| 5 | Merge analysis + outline, prompt caching, move the critic and template choice off the critical path | whole deck ≤ 20 s alone |
| 6 | Dashboards and alerts on the section 4 numbers, per plan | alert fires in a test overload |

## 11. Decisions for the owner
1. **Approve the new principle** (no queue for anyone, free plan at full speed, extra speed for paid)? And the **free-plan cost** (≤ $0.07 per free user a month) as the acquisition budget?
2. **Targets in section 4**: are these the numbers you want to hold ourselves to (deck on screen ≤ 2 s; first real slide ≤ 12 / 9 / 7 s; whole deck ≤ 45 / 30 / 20 s)?
3. **Start with step 1** (progressive generation): it is the biggest visible win and needs an editor change (the "still writing" state), so I want your go-ahead on that design first.
4. **Queue transport:** BullMQ on Redis (my recommendation) or SQS per lane?
5. **Provider capacity:** who requests Vertex quota / Provisioned Throughput and the OpenRouter limits; do we add a second provider now?
6. **Worker platform:** AWS ECS Fargate with spot workers (the AWS stack exists), or EC2 auto-scaling?
7. **Lane shares** (proposal Gold 30 / Pro 40 / Starter 30) and **headroom** (proposal 40 % idle slots).

## 12. What was built (2026-11-03) and what it measured

**Decisions taken** (the owner asked to build the architecture; where section 11 left a choice, this is what was chosen and why):
- **Queue transport: Postgres behind the `JobQueue` seam, not BullMQ or SQS yet.** The claim is one indexed lane query; the measured gate below passes without Redis. BullMQ/SQS is only introduced if a gate on a real fleet fails (Redis is a new thing to run and to lose). The seam (`src/generation/queue.ts`) keeps that change local.
- **Lanes and shares:** Gold 0, Pro 1, Starter 2; busy slots are shared 30 / 40 / 30 by weight (`LANE_SHARES`), a lane with nobody waiting lends its share. The line furthest below its share is served next (`nextLane`).
- **Headroom:** the worker publishes `/metrics` (slots busy / free, queue and oldest wait per lane). The rule for any autoscaler is to keep 40 % of the slots free (scale on free slots, not on queue length) and to watch CPU too (a deck costs about 0.1 s of CPU, section 12.3).
- **Worker platform:** the worker is its own service (`dist/worker.js`, `WORKER_SLOTS`, `/healthz`, `/metrics`, graceful hand-back of running decks on shutdown). Compose has it as the `worker` profile; the platform definition (ECS Fargate spot or EC2 auto-scaling) is NOT written, it waits for the owner's choice (section 13).

**Step 1 progressive generation** (`generation/progress.ts`, `pipeline.ts`): the deck row is created with the job (placeholders, `presentationId` returned at once); the browser opens it immediately. Generation is one more writer: every write is a three-way merge (`mergeDocs`, now in `packages/validation`, the same code the editor uses for collaborators) over the deck as generation last wrote it (`generation_job.shown`), so what the person changed meanwhile (a retyped title, a deleted slide, a resized text) is kept. Element ids are stable per slide, so re-writing a slide never drops edits. Stages written: themed deck + placeholders (as soon as the topic is understood, the template is chosen in parallel with the outline), titled outline, the first slide(s) (batch of 2, then 4, side by side), the finished deck (pictures, checks). Cancel or failure keeps what was written (an empty deck is removed and does not count toward the allowance).
**Step 2 workers:** `startWorker({ slots })` (a dispatcher claims while a slot is free, woken by `NOTIFY`, a 2 s poll is the safety net), lease heartbeat every 30 s, leases handed back on shutdown, `DB_POOL_MAX`, one connection serves many slots.
**Step 3 limit-aware gateway** (`packages/ai/src/limiter.ts`): steady admission per provider and model (adaptive concurrency cap, optional RPM / TPM from `AI_LIMITS`), a refusal cuts the cap by 30 % at most once a second, a model refusing most calls is paused for the time the provider asked (`Retry-After`), retries are a small share of calls, ready models are tried before paused ones.
**Step 4 lanes:** `generation_job.lane` from the plan's promised speed; per-plan parallel model calls per deck (Gold 8, Pro 5, Starter 3).

### 12.1 Proof harness (costs nothing)
`services/api/scripts/load-decks.ts`: its own throw-away database, real accounts, every deck started through the real `POST /generation/jobs`, real worker processes, a stand-in model with the answer times of the 1,500-user test, a capacity above which it answers 429, random refusals. Run: `DECKS=1000 WORKERS=8 SLOTS=200 CAPACITY=300 REFUSE=0.05 npx tsx --env-file=.env scripts/load-decks.ts`.

### 12.2 Measured (one 12-core laptop: the machine is also the database, the model stand-in and the test client, so these are conservative)
| Run | Decks | Failed | Queue wait p95 | Deck on screen | First slide p50 / p95 | Whole deck p95 / max |
|---|---|---|---|---|---|---|
| Alone, unloaded (40 decks over 20 s) | 40 | 0 | 0 - 0.6 s | 30 - 60 ms | 12.5 / 14.7 s | 17 s |
| 1,000 at once, 8 processes | 1,000 | 0 | 0.3 - 0.4 s | 4 s (client busy) | 13 / 18 s | 21 / 22 s |
| 2,500 at once, 12 processes, DB connections sized | 2,500 | 0 | ≤ 1.0 s | 9 s (client busy) | 12 - 16 / 21 s | 28 / 31 s |
| 1,000 at once on ONE process (the old shape) | 1,000 | 0 | 0.9 s | n/a | 75 / 96 s | 98 / 100 s |

Reading: the queue is gone (the line that took 14 minutes at 1,000 at once is under a second for every plan), the deck is on screen in tens of milliseconds, and the work spreads across processes. **Not yet met: first real slide ≤ 12 / 9 / 7 s** (about 12.5 s here, because the stand-in has no pictures lookup but the outline plus the first small batch is ~8.5 s of model time plus the analysis, which the browser flow skips because `/analyze` already ran). Levers left: a one-slide first batch, starting the first batch while the outline streams (needs provider streaming), outline on the fastest model.
### 12.3 Findings that change how it is run
- **A deck costs about 0.1 s of CPU** (drizzle query building, JSON documents, the merge). One process handled ~10 decks a second; 3,000 decks a minute needs about 5 cores of workers plus headroom. Autoscaling must watch CPU as well as free slots.
- **Postgres connections are the hard ceiling before CPU:** 12 processes with 20 connections each exhausted the default 100 (`53300`), decks retried and the tail went to 145 s. Many slots share few connections (a slot mostly waits for the model); above ~200 connections in total put PgBouncer or RDS Proxy in front.
- **The first limiter collapsed under noise:** with 5 % random refusals it halved the cap on every refusal and paused the whole model: 700 of 1,000 decks done after 13 minutes. Fixed (cut once a second, pause only when most recent calls are refused); the same run is the regression check.

### 12.4 When the provider is the bottleneck (stand-in model capped at 300 calls at once, 5 % random refusals, 1,000 decks at once, 8 processes)
| Version | Failed decks | Failed attempts | Gold whole deck p95 | Pro p95 | Starter p95 |
|---|---|---|---|---|---|
| First limiter (retries counted, no priority) | 10 | 1,206 | 175 s | 185 s | 184 s |
| Refusals wait their turn instead of failing the call | 0 | 0 | 131 s | 142 s | 156 s |
| + plan priority at the provider queue | 0 | 0 | **46 s** | **103 s** | 160 s |

The cap makes about 100 s the best possible for everyone together (about 30 model-seconds a deck x 1,000 / 300); the system finishes in 183 s with no failures. The plans keep their promise under overload: Gold stays fast, Starter slows but completes and is never dropped. Under normal load nobody waits (section 12.2).

## 13. Still open
1. **First real slide** is ~12.5 s alone (targets 12 / 9 / 7). Levers: one-slide first batch, outline on the fastest model, starting the first batch while the outline streams (needs provider streaming). Re-measure with a real model (Ollama) first: the stand-in's times are the 1,500-user test's.
2. **Critic off the critical path** (step 5): run the critic after the deck is complete and write its fixes as a quiet later revision. Not built; the deterministic repair stays before completion.
3. **Dashboards and alerts** (step 6) on queue wait, first slide and whole deck per plan: the numbers exist (`generation_job.checkpoint.marks`, `/metrics`), the admin pages do not.
4. **Production platform:** the worker service and its metrics exist; the ECS Fargate (spot) or EC2 auto-scaling definition is not written. Scale on free slots (keep 40 % free) and on CPU; put PgBouncer or RDS Proxy in front of Postgres above ~200 connections.
5. **Provider quota (owner):** Vertex quota / Provisioned Throughput, OpenRouter limits for the production key, a second provider. Then set `AI_LIMITS` per process (account quota / number of processes).
6. **Real-model proof:** a short Ollama run of `load-decks`-style traffic (the Gemini key stays for light local use only).
