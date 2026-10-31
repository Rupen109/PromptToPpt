/**
 * Which moments of a video are worth reading? A slide, whiteboard or screen recording changes in steps: look at tiny grey pictures taken at regular
 * times and keep the first one and every one that differs clearly from the last kept. Cheap (no model) and it keeps the AI bill proportional to how
 * much the screen actually changes, not to how long the video is.
 */
export interface Sample { t: number; gray: Uint8Array }

const meanDiff = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!); return s / a.length }
const flat = (g: Uint8Array) => { let min = 255, max = 0; for (const v of g) { if (v < min) min = v; if (v > max) max = v } return max - min < 12 } // black, white or blank frame

export function pickKeyframes(samples: Sample[], opts: { max?: number; minGapSec?: number; threshold?: number } = {}): number[] {
  const max = opts.max ?? 60, gap = opts.minGapSec ?? 10, threshold = opts.threshold ?? 6
  const kept: { t: number; diff: number }[] = []
  let last: Sample | null = null
  for (const s of samples) {
    if (flat(s.gray)) continue
    if (!last) { kept.push({ t: s.t, diff: 255 }); last = s; continue }
    const d = meanDiff(last.gray, s.gray)
    if (d >= threshold && s.t - kept[kept.length - 1]!.t >= gap) { kept.push({ t: s.t, diff: d }); last = s }
  }
  if (kept.length <= max) return kept.map((k) => k.t)
  // too many changes (a busy video): keep the first and the biggest changes, in time order
  const [first, ...rest] = kept
  return [first!, ...rest.sort((a, b) => b.diff - a.diff).slice(0, max - 1)].sort((a, b) => a.t - b.t).map((k) => k.t)
}

/** How many moments to look at for a video of this length: about one every 5–15 seconds, between 12 and 200. */
export const sampleCount = (durationSec: number) => Math.max(12, Math.min(200, Math.ceil(durationSec / (durationSec < 600 ? 5 : 15))))
