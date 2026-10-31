import { spawn } from 'node:child_process'
import { env } from '../env.ts'

/**
 * ffmpeg / ffprobe, run as child processes with a hard time limit. The files they read were uploaded by a stranger, so: no stdin, only the `file`
 * protocol (an uploaded playlist cannot make ffmpeg fetch URLs), errors only, and output size capped.
 */
export class FfmpegError extends Error {}
const bin = () => env.FFMPEG_PATH ?? 'ffmpeg'
const probeBin = () => env.FFPROBE_PATH ?? 'ffprobe'
const SAFE_IN = ['-protocol_whitelist', 'file']

function run(cmd: string, args: string[], timeoutMs: number, maxOut = 8 * 1024 * 1024): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    let outLen = 0, err = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new FfmpegError('timed out')) }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => { outLen += d.length; if (outLen > maxOut) { child.kill('SIGKILL'); reject(new FfmpegError('output too large')) } else out.push(d) })
    child.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-4000) })
    child.on('error', (e) => { clearTimeout(timer); reject(new FfmpegError(`could not start ${cmd}: ${e.message}`)) })
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout: Buffer.concat(out), stderr: err }) : reject(new FfmpegError(`exit ${code}: ${err.slice(-300)}`)) })
  })
}

let available: Promise<boolean> | null = null
export const ffmpegAvailable = () => (available ??= run(bin(), ['-version'], 5000).then(() => run(probeBin(), ['-version'], 5000)).then(() => true, () => false))
export const resetFfmpegCheck = () => { available = null }

export interface Probe { durationSec: number; hasAudio: boolean; hasVideo: boolean; width: number; height: number }

export async function probeMedia(path: string): Promise<Probe> {
  const { stdout } = await run(probeBin(), ['-v', 'error', ...SAFE_IN, '-print_format', 'json', '-show_format', '-show_streams', path], 30_000)
  const j = JSON.parse(stdout.toString()) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number; duration?: string; disposition?: { attached_pic?: number } }[] }
  const streams = j.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic) // cover art in an MP3 is not a video
  const audio = streams.find((s) => s.codec_type === 'audio')
  const dur = Number(j.format?.duration ?? streams.map((s) => Number(s.duration ?? 0)).sort((a, b) => b - a)[0] ?? 0)
  if (!Number.isFinite(dur) || dur <= 0) throw new FfmpegError('no duration')
  return { durationSec: Math.round(dur), hasAudio: !!audio, hasVideo: !!video, width: video?.width ?? 0, height: video?.height ?? 0 }
}

/** One piece of the sound as small mono AAC (32 kbit/s ≈ 4 MB for 17 minutes), ready to send to the model. */
export async function extractAudio(path: string, startSec: number, durSec: number, outPath: string): Promise<void> {
  await run(bin(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...SAFE_IN, '-ss', String(startSec), '-t', String(durSec), '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '32k', outPath], 180_000)
}

export const THUMB_W = 64
export const THUMB_H = 36
/** A tiny grey picture of the frame at `t` (for finding where the screen changes). */
export async function thumbAt(path: string, t: number): Promise<Uint8Array> {
  const { stdout } = await run(bin(), ['-nostdin', '-hide_banner', '-loglevel', 'error', ...SAFE_IN, '-ss', String(t), '-i', path, '-an', '-frames:v', '1', '-vf', `scale=${THUMB_W}:${THUMB_H},format=gray`, '-f', 'rawvideo', '-'], 60_000, 1 << 20)
  if (stdout.length < THUMB_W * THUMB_H) throw new FfmpegError('no frame')
  return new Uint8Array(stdout.subarray(0, THUMB_W * THUMB_H))
}

/** The frame at `t` as a JPEG up to 1024 px wide (≈ 100 KB). */
export async function frameAt(path: string, t: number, outPath: string): Promise<void> {
  await run(bin(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...SAFE_IN, '-ss', String(t), '-i', path, '-an', '-frames:v', '1', '-vf', "scale='min(1024,iw)':-2", '-q:v', '4', outPath], 60_000)
}
