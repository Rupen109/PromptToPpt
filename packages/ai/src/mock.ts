import { ProviderError, type AIProvider, type ImageRequest, type ImageResponse, type TextRequest, type TextResponse } from './types'

/**
 * Deterministic provider for tests and key-less local dev. `respond` receives the request and returns text
 * (or throws a ProviderError to simulate outages). Token counts are estimated (~4 chars/token).
 */
export class MockProvider implements AIProvider {
  readonly id = 'gemini' // pretends to be the real provider so registry/pricing/ledger paths are exercised
  readonly calls: TextRequest[] = []
  readonly imageCalls: ImageRequest[] = []
  constructor(
    private readonly respond: (req: TextRequest, n: number) => string | Promise<string>,
    private readonly respondImage?: (req: ImageRequest, n: number) => { bytes: Uint8Array; mime: string } | Promise<{ bytes: Uint8Array; mime: string }>,
  ) {
    if (respondImage) this.generateImage = async (req) => this.image(req)
  }

  generateImage?: (req: ImageRequest) => Promise<ImageResponse>
  private async image(req: ImageRequest): Promise<ImageResponse> {
    this.imageCalls.push(req)
    const out = await this.respondImage!(req, this.imageCalls.length)
    return { ...out, modelVersion: `${req.model}-mock`, usage: { inputTokens: Math.ceil(req.prompt.length / 4), cachedTokens: 0, outputTokens: 1290, reasoningTokens: 0, imageCount: 1 } }
  }

  async generateText(req: TextRequest): Promise<TextResponse> {
    this.calls.push(req)
    const text = await this.respond(req, this.calls.length)
    return {
      text,
      ...(req.webSearch ? { citations: [{ url: 'https://example.com/mock-page', title: 'Mock page' }], extraCostUsd: 0.035 } : {}),
      modelVersion: `${req.model}-mock`,
      usage: { inputTokens: Math.ceil((req.system.length + req.prompt.length) / 4), cachedTokens: 0, outputTokens: Math.ceil(text.length / 4), reasoningTokens: 0, imageCount: 0 },
    }
  }
}

export { ProviderError }
