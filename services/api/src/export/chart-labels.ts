import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { highlightText } from '@prompttoppt/validation'

/**
 * The figures inside STACKED bars, readable on every segment: white on a dark series, near-black on a light one (highlightText, the same rule the screen draws with). The chart library gives one
 * label colour per chart, but a PowerPoint chart keeps one per series, so each series' label colour is set here from that series' own fill in the file. Other charts are left as they are.
 */
export function inkStackedLabels(file: Buffer): Buffer {
  const files = unzipSync(new Uint8Array(file))
  let changed = false
  for (const name of Object.keys(files)) {
    if (!/^ppt\/charts\/chart\d+\.xml$/.test(name)) continue
    const xml = strFromU8(files[name]!)
    const next = inkChartXml(xml)
    if (next !== xml) { files[name] = strToU8(next); changed = true }
  }
  return changed ? Buffer.from(zipSync(files)) : file
}

/** one chart's XML: in a stacked bar chart, each series' figures take the colour that reads on that series' fill */
export function inkChartXml(xml: string): string {
  if (!/<c:barChart>[\s\S]*?<c:grouping val="(?:stacked|percentStacked)"\/>/.test(xml)) return xml
  return xml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (ser) => {
    const fill = /<c:spPr>\s*<a:solidFill>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(ser)?.[1]
    if (!fill) return ser
    const ink = highlightText(`#${fill}`).slice(1)
    return ser.replace(/(<c:dLbls>[\s\S]*?<a:defRPr[^>]*>\s*<a:solidFill>\s*<a:srgbClr val=")[0-9A-Fa-f]{6}(")/, `$1${ink}$2`)
  })
}
