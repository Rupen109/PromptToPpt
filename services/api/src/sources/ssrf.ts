import { lookup } from 'node:dns'
import { isIP } from 'node:net'
import { Agent } from 'undici'

/**
 * SSRF guard for user-supplied URLs (spec §18). The API server can reach things users can't — cloud metadata
 * (169.254.169.254), localhost admin ports, the VPC. We block those by resolving the hostname ourselves and
 * checking the *connected* address (so DNS rebinding can't swap it after validation).
 */
export class BlockedUrlError extends Error {}

const v4Blocked: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
  [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
]
const ipv4ToInt = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0)
const blockedV4 = (n: number) => v4Blocked.some(([base, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)))

/** Parses an IPv6 literal (with `::` compression and an optional embedded dotted quad) into 16 bytes, or null when malformed. */
export function parseIPv6(raw: string): Uint8Array | null {
  let s = raw.toLowerCase().split('%')[0]!
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    if (isIP(dotted[1]!) !== 4) return null
    const n = ipv4ToInt(dotted[1]!)
    s = s.slice(0, -dotted[1]!.length) + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16)
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const toGroups = (part: string) => (part === '' ? [] : part.split(':'))
  const head = toGroups(halves[0]!)
  const tail = halves.length === 2 ? toGroups(halves[1]!) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const out = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-f]{1,4}$/.test(groups[i]!)) return null
    const v = parseInt(groups[i]!, 16)
    out[i * 2] = v >> 8
    out[i * 2 + 1] = v & 0xff
  }
  return out
}

/**
 * True when the address must NOT be fetched. IPv4 uses a deny list of private/special ranges. IPv6 is allow-list based:
 * only global unicast (2000::/3) outside the documentation range is allowed, and every form that embeds an IPv4 address
 * (IPv4-mapped ::ffff:a.b.c.d in either notation, NAT64 64:ff9b::/96, 6to4 2002::/16) is judged by the address it embeds.
 */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return blockedV4(ipv4ToInt(ip))
  if (kind !== 6) return true // not an IP at all: treat as blocked, callers only pass literals/resolved addresses
  const b = parseIPv6(ip)
  if (!b) return true
  const v4At = (o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0
  const allZero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0)
  if (allZero(0, 10) && b[10] === 0xff && b[11] === 0xff) return blockedV4(v4At(12)) // ::ffff:0:0/96 IPv4-mapped
  if (allZero(0, 12)) return true // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && allZero(4, 12)) return blockedV4(v4At(12)) // 64:ff9b::/96 NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return blockedV4(v4At(2)) // 2002::/16 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true // 2001:db8::/32 documentation
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true // 2001::/32 Teredo (tunnels to arbitrary IPv4)
  return (b[0]! & 0xe0) !== 0x20 // allow only global unicast 2000::/3
}

export function assertPublicUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BlockedUrlError('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedUrlError('Only http(s) URLs are allowed')
  if (url.username || url.password) throw new BlockedUrlError('URLs with credentials are not allowed')
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  if (port !== '80' && port !== '443') throw new BlockedUrlError('Only standard web ports are allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) throw new BlockedUrlError('That host is not allowed')
  if (isIP(host) && isBlockedIp(host)) throw new BlockedUrlError('That address is not allowed')
  return url
}

/** undici dispatcher that validates the address actually being connected to. */
export const ssrfSafeAgent = new Agent({
  connect: {
    lookup: (hostname, options, cb) =>
      lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err, '', 0)
        const list = addrs as { address: string; family: number }[]
        const bad = list.find((a) => isBlockedIp(a.address))
        if (bad || list.length === 0) return cb(new BlockedUrlError('That address is not allowed') as NodeJS.ErrnoException, '', 0)
        // `all: true` was requested by undici's connector in newer versions; honour either shape
        return (options as { all?: boolean }).all ? (cb as any)(null, list) : cb(null, list[0]!.address, list[0]!.family)
      }),
  },
})
