/**
 * How big a picture this device can edit. NOT a fixed number: browsers and devices differ a lot (iOS Safari historically refuses canvases above 16,777,216 pixels, small phones run out
 * of memory long before a laptop does), so the limit comes from what the device is (a conservative estimate) and is then PROVEN on the real picture size by a canvas probe
 * (canvasSupport.ts). The result is always the smaller of: the device estimate, the provider's own limit, and an optional override (for support and tests: `?bgmaxmp=4` or the setting
 * `slidesdone.bg.maxmp` in local storage, in megapixels).
 */
export interface DeviceEnv {
  /** navigator.deviceMemory in GB when the browser says (Chromium only, rounded and capped at 8) */
  deviceMemory?: number | undefined
  /** iPhone, iPad (including an iPad that says it is a Mac) */
  ios: boolean
  /** a touch phone or tablet */
  mobile: boolean
}

export interface PixelLimits { maxPixels: number; maxSide: number; why: string }

/** Where the estimate comes from, most restrictive first. */
export function deviceLimits(env: DeviceEnv): PixelLimits {
  const mp = (n: number) => n * 1_000_000
  if (env.ios) return { maxPixels: mp(16), maxSide: 8192, why: 'iPhone and iPad browsers limit the size of a canvas' }
  if (env.deviceMemory !== undefined && env.deviceMemory <= 2) return { maxPixels: mp(8), maxSide: 8192, why: 'this device has little memory' }
  if (env.mobile) return { maxPixels: mp(16), maxSide: 8192, why: 'phones and tablets have limited memory' }
  if (env.deviceMemory !== undefined && env.deviceMemory <= 4) return { maxPixels: mp(16), maxSide: 10_000, why: 'this device has limited memory' }
  return { maxPixels: mp(25), maxSide: 10_000, why: 'the editor\'s general limit' }
}

export interface LimitInputs { env: DeviceEnv; provider: { maxInputPixels: number; maxInputSide: number }; overrideMegapixels?: number | undefined }

/** The limits for one picture: the smallest of the device, the provider and the override. */
export function effectiveLimits(i: LimitInputs): PixelLimits {
  const d = deviceLimits(i.env)
  let { maxPixels, maxSide, why } = d
  if (i.provider.maxInputPixels < maxPixels) { maxPixels = i.provider.maxInputPixels; why = 'the background removal service\'s limit' }
  maxSide = Math.min(maxSide, i.provider.maxInputSide)
  if (i.overrideMegapixels && i.overrideMegapixels > 0 && i.overrideMegapixels * 1_000_000 < maxPixels) { maxPixels = Math.round(i.overrideMegapixels * 1_000_000); why = 'a limit set for this browser' }
  return { maxPixels, maxSide, why }
}

export function detectEnv(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { deviceMemory?: number; platform?: string } = navigator): DeviceEnv {
  const ua = nav.userAgent ?? ''
  const ipadAsMac = /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1
  const ios = /iPhone|iPad|iPod/.test(ua) || ipadAsMac
  const mobile = ios || /Android|Mobile/.test(ua)
  return { deviceMemory: nav.deviceMemory, ios, mobile }
}

/** The optional override in megapixels: `?bgmaxmp=4` in the address, or local storage. Never throws (storage can be blocked). */
export function readOverrideMegapixels(): number | undefined {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('bgmaxmp')
    const s = q ?? globalThis.localStorage?.getItem('slidesdone.bg.maxmp') ?? null
    const n = s === null ? NaN : Number(s)
    return Number.isFinite(n) && n > 0 ? n : undefined
  } catch { return undefined }
}

export const megapixels = (w: number, h: number) => Math.round((w * h) / 100_000) / 10
