import { describe, expect, it } from 'vitest'
import { detectEnv, deviceLimits, effectiveLimits, megapixels } from './limits'

const provider = { maxInputPixels: 50_000_000, maxInputSide: 10_000 }

describe('per-device limits', () => {
  it('25 MP is not assumed everywhere: iPhones and iPads, phones, and low-memory devices get lower limits', () => {
    expect(deviceLimits({ ios: false, mobile: false }).maxPixels).toBe(25_000_000)
    expect(deviceLimits({ ios: true, mobile: true }).maxPixels).toBe(16_000_000)
    expect(deviceLimits({ ios: false, mobile: true }).maxPixels).toBe(16_000_000)
    expect(deviceLimits({ ios: false, mobile: false, deviceMemory: 4 }).maxPixels).toBe(16_000_000)
    expect(deviceLimits({ ios: false, mobile: false, deviceMemory: 2 }).maxPixels).toBe(8_000_000)
    expect(deviceLimits({ ios: false, mobile: false, deviceMemory: 8 }).maxPixels).toBe(25_000_000)
  })

  it('the result is the smallest of the device, the provider and an override', () => {
    const desktop = { ios: false, mobile: false }
    expect(effectiveLimits({ env: desktop, provider }).maxPixels).toBe(25_000_000)
    expect(effectiveLimits({ env: desktop, provider: { maxInputPixels: 12_000_000, maxInputSide: 4000 } })).toMatchObject({ maxPixels: 12_000_000, maxSide: 4000 })
    expect(effectiveLimits({ env: desktop, provider, overrideMegapixels: 4 }).maxPixels).toBe(4_000_000)
    expect(effectiveLimits({ env: desktop, provider, overrideMegapixels: 999 }).maxPixels).toBe(25_000_000) // an override can only lower it
    expect(effectiveLimits({ env: { ios: true, mobile: true }, provider }).why).toMatch(/iPhone and iPad/)
  })

  it('recognises iPhone, iPad (also as a Mac with touch), Android and desktop browsers', () => {
    expect(detectEnv({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 })).toMatchObject({ ios: true, mobile: true })
    expect(detectEnv({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit', maxTouchPoints: 5 })).toMatchObject({ ios: true }) // iPad asking for the desktop site
    expect(detectEnv({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit', maxTouchPoints: 0 })).toMatchObject({ ios: false, mobile: false })
    expect(detectEnv({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile', maxTouchPoints: 5, deviceMemory: 8 })).toMatchObject({ ios: false, mobile: true, deviceMemory: 8 })
    expect(detectEnv({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 })).toMatchObject({ ios: false, mobile: false })
  })

  it('megapixels reads naturally', () => { expect(megapixels(5000, 5000)).toBe(25); expect(megapixels(4032, 3024)).toBe(12.2) })
})
