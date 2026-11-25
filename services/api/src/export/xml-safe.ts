import { XML_FORBIDDEN, xmlSafe } from '@prompttoppt/validation'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

/**
 * The last pass over every PowerPoint file we write: no XML part may hold a character XML forbids (text reaches the file from many places — slides, notes,
 * tables, charts, picture descriptions — and one stray control character makes PowerPoint "repair" the whole file). The file is rewritten only when one is found.
 */
export function xmlSafeFile(file: Buffer): Buffer {
  const files = unzipSync(new Uint8Array(file))
  let changed = false
  for (const [name, data] of Object.entries(files)) {
    if (!/\.(xml|rels)$/.test(name)) continue
    const xml = strFromU8(data)
    XML_FORBIDDEN.lastIndex = 0
    if (!XML_FORBIDDEN.test(xml)) continue
    files[name] = strToU8(xmlSafe(xml)); changed = true
  }
  return changed ? Buffer.from(zipSync(files)) : file
}
