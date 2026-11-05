/**
 * Limit-aware calls to the AI providers: a request waits its turn instead of bursting into a 429.
 *
 * One limiter holds, per KEY (provider and model, e.g. "vertex:gemini-3.6-flash"):
 *   · a concurrency cap that ADAPTS to what the provider really allows. A refusal cuts it by 30 % (at most once a second, however many calls were refused
 *     together) and every good answer gives a little back, so the cap settles at the share of the quota this process can use, with no shared state to run.
 *     A stray refusal costs almost nothing; when MOST recent calls are refused the provider is out of capacity and the whole key pauses (for the time the
 *     provider asked, else an exponential back-off) instead of hammering it;
 *   · optional requests-per-minute and tokens-per-minute buckets (set them when the quota is known: AI_LIMITS), which spread calls evenly;
 *   · a retry budget: retries are allowed while they stay a small share of the calls, so one struggling provider never turns into a retry storm.
 * Callers wait in order (first come, first served) and a waiting call that is aborted leaves the line at once.
 */
export interface LimitConfig {
  /** most calls running at the same time (also the ceiling the adaptive cap recovers to); default 256 */
  concurrency?: number
  /** calls per minute, spread evenly */
  rpm?: number
  /** tokens per minute (estimated input + expected output), spread evenly */
  tpm?: number
}

export interface Permit {
  /** report how the call went: frees the slot and teaches the limiter */
  release(result: { ok: boolean; tokens?: number; rateLimited?: boolean; retryAfterMs?: number }): void
}

interface KeyState {
  inflight: number
  cap: number
  max: number
  coolUntil: number
  backoffMs: number
  /** when the cap was last cut: a burst of refusals is one event */
  lastCutAt: number
  /** the last 20 outcomes, true = refused for rate limit: tells a stray refusal from an exhausted quota */
  recent: boolean[]
  rpmTokens: number
  tpmTokens: number
  refilledAt: number
  queue: { priority: number; tokens: number; resolve: (p: Permit) => void; reject: (e: unknown) => void; signal?: AbortSignal | undefined; onAbort?: () => void }[]
  timer: ReturnType<typeof setTimeout> | null
  calls: number
  retries: number
}

export interface LimiterOptions {
  limits?: (key: string) => LimitConfig
  now?: () => number
  /** retries may be at most this share of the calls (default 20 %), after a small allowance so the first calls can retry */
  retryShare?: number
}

const DEFAULT_MAX = 256
const RETRY_ALLOWANCE = 20

export class ProviderLimiter {
  private readonly keys = new Map<string, KeyState>()
  private readonly now: () => number
  constructor(private readonly o: LimiterOptions = {}) {
    this.now = o.now ?? Date.now
  }

  private cfg(key: string): LimitConfig { return this.o.limits?.(key) ?? {} }

  private state(key: string): KeyState {
    let s = this.keys.get(key)
    if (!s) {
      const c = this.cfg(key)
      const max = c.concurrency ?? DEFAULT_MAX
      s = { inflight: 0, cap: max, max, coolUntil: 0, backoffMs: 1000, lastCutAt: -Infinity, recent: [], rpmTokens: c.rpm ? burst(c.rpm) : 0, tpmTokens: c.tpm ? burst(c.tpm) : 0, refilledAt: this.now(), queue: [], timer: null, calls: 0, retries: 0 }
      this.keys.set(key, s)
    }
    return s
  }

  private refill(s: KeyState, c: LimitConfig) {
    const t = this.now()
    const dt = (t - s.refilledAt) / 60_000
    s.refilledAt = t
    if (c.rpm) s.rpmTokens = Math.min(burst(c.rpm), s.rpmTokens + c.rpm * dt)
    if (c.tpm) s.tpmTokens = Math.min(burst(c.tpm), s.tpmTokens + c.tpm * dt)
  }

  /** Waits for this key's turn. Rejects if `signal` aborts while waiting. */
  /** `priority`: lower goes first among the callers waiting for this key (a paid plan's calls pass free ones when the provider is the bottleneck); equal priorities keep their order. */
  acquire(key: string, tokens = 0, signal?: AbortSignal, priority = 0): Promise<Permit> {
    const s = this.state(key)
    return new Promise<Permit>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'))
      const entry: KeyState['queue'][number] = { priority, tokens, resolve, reject, signal }
      if (signal) {
        entry.onAbort = () => { const i = s.queue.indexOf(entry); if (i >= 0) { s.queue.splice(i, 1); reject(signal.reason ?? new Error('aborted')) } }
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }
      let at = s.queue.length
      while (at > 0 && s.queue[at - 1]!.priority > priority) at--
      s.queue.splice(at, 0, entry)
      this.pump(key)
    })
  }

  private pump(key: string) {
    const s = this.state(key)
    const c = this.cfg(key)
    if (s.timer) { clearTimeout(s.timer); s.timer = null }
    while (s.queue.length > 0) {
      const head = s.queue[0]!
      if (head.signal?.aborted) { s.queue.shift(); continue }
      this.refill(s, c)
      const t = this.now()
      let waitMs = 0
      if (t < s.coolUntil) waitMs = s.coolUntil - t
      else if (s.inflight >= Math.floor(s.cap)) waitMs = -1 // woken by a release
      else if (c.rpm && s.rpmTokens < 1) waitMs = Math.ceil(((1 - s.rpmTokens) / c.rpm) * 60_000)
      else if (c.tpm && s.tpmTokens < Math.min(head.tokens, burst(c.tpm))) waitMs = Math.ceil(((Math.min(head.tokens, burst(c.tpm)) - s.tpmTokens) / c.tpm) * 60_000)
      if (waitMs !== 0) {
        if (waitMs > 0) s.timer = setTimeout(() => this.pump(key), Math.max(5, waitMs))
        return
      }
      s.queue.shift()
      if (head.signal && head.onAbort) head.signal.removeEventListener('abort', head.onAbort)
      s.inflight++
      s.calls++
      if (c.rpm) s.rpmTokens -= 1
      if (c.tpm) s.tpmTokens -= Math.min(head.tokens, burst(c.tpm))
      let done = false
      head.resolve({ release: (r) => { if (!done) { done = true; this.settle(key, r) } } })
    }
  }

  private settle(key: string, r: { ok: boolean; tokens?: number; rateLimited?: boolean; retryAfterMs?: number }) {
    const s = this.state(key)
    s.inflight = Math.max(0, s.inflight - 1)
    s.recent.push(!!r.rateLimited)
    if (s.recent.length > 20) s.recent.shift()
    const t = this.now()
    if (r.rateLimited) {
      if (t - s.lastCutAt >= 1000) { s.cap = Math.max(1, s.cap * 0.7); s.lastCutAt = t }
      // most of the recent calls refused: the provider is out of capacity. Pause the key (the asked time, else exponential) rather than keep knocking.
      const refused = s.recent.filter(Boolean).length
      if (s.recent.length >= 6 && refused / s.recent.length >= 0.5) {
        const wait = r.retryAfterMs ?? Math.min(30_000, s.backoffMs)
        s.backoffMs = Math.min(30_000, s.backoffMs * 2)
        s.coolUntil = Math.max(s.coolUntil, t + wait + Math.floor(Math.random() * Math.min(500, wait / 4 + 1)))
      }
    } else if (r.ok) {
      s.backoffMs = 1000
      s.cap = Math.min(s.max, s.cap + Math.max(0.25, s.cap * 0.02)) // a little back for every good answer, faster when the cap is large
    }
    this.pump(key)
  }

  /** May this call be retried now? True while retries are a small share of the calls (a storm is cut off; a blip is not). */
  retryAllowed(key: string): boolean {
    const s = this.state(key)
    const ok = s.retries < RETRY_ALLOWANCE || s.retries / Math.max(1, s.calls) <= (this.o.retryShare ?? 0.2)
    if (ok) s.retries++
    return ok
  }

  /** Takes a key out of use for `ms` (a model the provider says no longer exists): calls go to the other models and it is tried again after the pause. */
  pause(key: string, ms: number) {
    const s = this.state(key)
    s.coolUntil = Math.max(s.coolUntil, this.now() + ms)
    this.pump(key)
  }

  /** Milliseconds this key is paused for (0 = ready now): used to try ready models before paused ones. */
  pausedFor(key: string): number {
    const s = this.keys.get(key)
    return s ? Math.max(0, s.coolUntil - this.now()) : 0
  }

  stats(key: string) {
    const s = this.state(key)
    return { inflight: s.inflight, cap: Math.floor(s.cap), waiting: s.queue.length, pausedMs: this.pausedFor(key), calls: s.calls, retries: s.retries }
  }
}

/** a bucket holds ten seconds of the limit: enough to smooth small bursts, never enough to spike the provider */
const burst = (perMinute: number) => Math.max(1, (perMinute / 60) * 10)

/** "vertex:gemini-3.6-flash" → limits from a map keyed by "provider:model", "provider:*" or "*" (most specific wins) */
export function limitsFromMap(map: Record<string, LimitConfig>): (key: string) => LimitConfig {
  return (key) => {
    const provider = key.split(':')[0]!
    return map[key] ?? map[`${provider}:*`] ?? map['*'] ?? {}
  }
}
