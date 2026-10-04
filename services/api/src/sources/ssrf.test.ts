import { describe, expect, it } from 'vitest'
import { BlockedUrlError, assertPublicUrl, isBlockedIp } from './ssrf.ts'

describe('SSRF guard (security S5)', () => {
  const blocked = [
    '127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.5', '198.51.100.9', '203.0.113.7',
    '::', '::1', '::7f00:1', '::127.0.0.1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'fec0::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:0a00:0001', '::FFFF:192.168.0.1',
    '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2002:a9fe:a9fe::1', '2001:db8::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2',
  ]
  for (const ip of blocked) it(`blocks ${ip}`, () => expect(isBlockedIp(ip), ip).toBe(true))

  const allowed = ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '2a00:1450:4001:81b::200e', '::ffff:8.8.8.8', '64:ff9b::0808:0808', '2002:0808:0808::1']
  for (const ip of allowed) it(`allows ${ip}`, () => expect(isBlockedIp(ip), ip).toBe(false))

  it('rejects malformed IPv6 and non-IP strings', () => {
    for (const x of ['::g', '1:2:3:4:5:6:7:8:9', ':::', '', 'example.com']) expect(isBlockedIp(x), x).toBe(true)
  })

  const urls = [
    'http://[::ffff:7f00:1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:a9fe:a9fe]/latest/meta-data/', 'http://[::1]/', 'http://localhost/', 'http://x.localhost/',
    'http://169.254.169.254/', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://0177.0.0.1/', 'http://127.1/', 'http://user:pw@example.com/', 'http://example.com:8080/', 'ftp://example.com/', 'file:///etc/passwd', 'http://metadata.internal/',
  ]
  for (const u of urls) it(`assertPublicUrl rejects ${u}`, () => expect(() => assertPublicUrl(u), u).toThrow(BlockedUrlError))
  it('accepts a normal public URL', () => expect(assertPublicUrl('https://example.com/page').hostname).toBe('example.com'))
})
