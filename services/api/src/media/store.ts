import { mkdir, rm, open, stat, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '../env.ts'

/** Where big uploads wait while they are being sent and processed. Files are named by job id only (never by what the person called them). */
export const MEDIA_DIR = env.MEDIA_TMP_DIR ?? join(tmpdir(), 'slidesdone-media')
export const PART_BYTES = 8 * 1024 * 1024
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024
export const MAX_VIDEO_MINUTES = 90
export const MAX_VIDEO_MINUTES_PER_DAY = 180
export const MAX_JOBS_PER_DAY = 6
export const SEGMENT_SECONDS = 20 * 60

export const filePath = (id: string) => join(MEDIA_DIR, `${id}.bin`)
export const workDir = (id: string) => join(MEDIA_DIR, `${id}.work`)
export const partsFor = (bytes: number) => Math.max(1, Math.ceil(bytes / PART_BYTES))
export const partSize = (bytes: number, n: number) => (n < partsFor(bytes) - 1 ? PART_BYTES : bytes - n * PART_BYTES)

export async function writePart(id: string, n: number, bytes: Uint8Array): Promise<void> {
  await mkdir(MEDIA_DIR, { recursive: true })
  const fh = await open(filePath(id), 'a+') // created if missing; positional writes below make a re-sent part harmless
  try { await fh.write(bytes, 0, bytes.length, n * PART_BYTES) } finally { await fh.close() }
}
export const fileSize = async (id: string) => (await stat(filePath(id)).catch(() => null))?.size ?? -1
export async function head(id: string, n = 65_536): Promise<Uint8Array> {
  const fh = await open(filePath(id), 'r')
  try { const b = Buffer.alloc(n); const { bytesRead } = await fh.read(b, 0, n, 0); return new Uint8Array(b.subarray(0, bytesRead)) } finally { await fh.close() }
}
export const readWork = (id: string, name: string) => readFile(join(workDir(id), name))
export async function cleanup(id: string): Promise<void> {
  await rm(filePath(id), { force: true }).catch(() => {})
  await rm(workDir(id), { recursive: true, force: true }).catch(() => {})
}
/** Files left behind by a crash: anything in the folder whose job id is not in `keep`. */
export async function strayFiles(keep: Set<string>): Promise<string[]> {
  const names = await readdir(MEDIA_DIR).catch(() => [] as string[])
  return names.map((n) => n.replace(/\.(bin|work)$/, '')).filter((id) => !keep.has(id))
}
