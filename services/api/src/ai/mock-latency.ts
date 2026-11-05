import { ProviderError, type AIProvider, type ImageRequest, type TextRequest, type TextResponse } from '@prompttoppt/ai'

/**
 * A model that behaves like a real one WITHOUT costing money, for load tests (AI_PROVIDER=mock, MOCK_AI_LATENCY=realistic):
 *   · answers take as long as the real ones did in the 1,500-user test (docs/LOAD_TEST_AI_2026-11-02.md), with some spread;
 *   · it can only serve MOCK_AI_CAPACITY calls at once: more than that are refused with a 429 and a Retry-After, the way a shared quota refuses;
 *   · MOCK_AI_REFUSE_RATE of all calls are refused at random (Google refused every request at one point: the system must survive that).
 * Everything else (the prompts, the answers, the ledger) is the normal mock.
 */
export interface LatencyProfile { capacity: number; refuseRate: number; scale?: number }

/** measured times in ms: analysis 1.8 s, outline about 4 s on the Flash models every plan now uses (the strong models took up to 10 s), a batch of slides about 2.5 s + 1 s a slide, critic and picture steps a few seconds */
const BASE_MS: Record<string, number> = { analyze: 1800, directions: 2500, design_pick: 1500, outline: 4000, critic: 4000, picture_query: 1200, picture_verify: 1500, aiedit: 3000, assist_understand: 1500, assist_write: 3500, askdeck: 3000, enrich: 2500 }

export function slidesMs(prompt: string): number {
  let n = 4
  try { n = (JSON.parse(prompt.match(/<params>([\s\S]*?)<\/params>/)?.[1] ?? '{}').outline ?? []).length || 4 } catch { /* a prompt without params: an average batch */ }
  return 2500 + 1000 * Math.min(Math.max(n, 1), 8)
}

export function withLatency(base: AIProvider, p: LatencyProfile): AIProvider & { stats(): { inflight: number; peak: number; refused: number; calls: number } } {
  let inflight = 0, peak = 0, refused = 0, calls = 0
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  return {
    id: base.id,
    stats: () => ({ inflight, peak, refused, calls }),
    ...(base.generateImage ? { generateImage: (req: ImageRequest) => base.generateImage!(req) } : {}),
    async generateText(req: TextRequest): Promise<TextResponse> {
      calls++
      const task = req.system.match(/\[task:(\w+)\]/)?.[1] ?? ''
      if (inflight >= p.capacity || Math.random() < p.refuseRate) { refused++; throw new ProviderError('Resource exhausted (mock quota)', 'RESOURCE_EXHAUSTED', true, 429, 2000) }
      inflight++; peak = Math.max(peak, inflight)
      try {
        const ms = (task === 'slides' ? slidesMs(req.prompt) : (BASE_MS[task] ?? 2000)) * (p.scale ?? 1) * (0.8 + Math.random() * 0.4)
        await wait(ms)
        return await base.generateText(req)
      } finally { inflight-- }
    },
  }
}
