import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

/**
 * A scatter chart's trend line, as PowerPoint makes it: a linear trendline on each series (dashed, in the series' colour) — the same least-squares line the screen draws
 * (chart-style.ts linearFitXY). The chart library cannot write trendlines, so they are added to the chart files of the scatters that asked for one (`which`: chart number → series colours).
 */
export function scatterTrendlines(file: Buffer, which: ReadonlyMap<number, readonly string[]>): Buffer {
  if (!which.size) return file
  const files = unzipSync(new Uint8Array(file))
  // the library numbers chart files across every deck built in the same process, so the n-th chart of THIS deck is the n-th of its chart files in number order
  const charts = Object.keys(files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))
  let changed = false
  for (const [n, colors] of which) {
    const name = charts[n - 1]
    if (!name) continue
    const xml = files[name] ? strFromU8(files[name]) : null
    if (!xml || !/<c:scatterChart>/.test(xml)) continue
    const next = trendXml(xml, colors)
    if (next !== xml) { files[name] = strToU8(next); changed = true }
  }
  return changed ? Buffer.from(zipSync(files)) : file
}

/** one scatter chart's XML with a linear trendline in each series (placed before its x values, where the format wants it) */
export function trendXml(xml: string, colors: readonly string[]): string {
  let i = 0
  return xml.replace(/<c:ser>([\s\S]*?)<\/c:ser>/g, (ser, body: string) => {
    if (/<c:trendline>/.test(body)) return ser
    const color = (colors[i++] ?? '666666').replace('#', '').toUpperCase()
    const trend = `<c:trendline><c:spPr><a:ln w="25400"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr><c:trendlineType val="linear"/><c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>`
    return `<c:ser>${body.replace(/<c:xVal>/, `${trend}<c:xVal>`)}</c:ser>`
  })
}
