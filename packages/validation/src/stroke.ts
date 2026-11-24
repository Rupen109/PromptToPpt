/**
 * The style of an outline or a line: solid (not stored), dashed or dotted. ONE rule for the slide (SVG), the PowerPoint file and the template importer, with PowerPoint's own
 * proportions so the download looks like the screen: a dash is 4 widths long with a 3-width gap (`dash`), a dot is 1 width with a 1-width gap (`sysDot`), square ends.
 */
export type StrokeDash = 'dash' | 'dot'
export const STROKE_DASHES = ['dash', 'dot'] as const

/** the SVG `stroke-dasharray` for a dash style at a line width (undefined = solid) */
export function dashArray(dash: StrokeDash | undefined, width: number): string | undefined {
  if (!dash || width <= 0) return undefined
  const w = Math.round(width * 100) / 100
  return dash === 'dash' ? `${w * 4} ${w * 3}` : `${w} ${w}`
}

/** PowerPoint's preset for a dash style (`<a:prstDash val=…>`) */
export const pptDash = (dash: StrokeDash | undefined): 'dash' | 'sysDot' | undefined => (dash === 'dash' ? 'dash' : dash === 'dot' ? 'sysDot' : undefined)

/** a PowerPoint preset dash (from a file being imported) as ours: dotted kinds are dots, every other broken line is a dash; `exact` is false when it is only close (dash-dot) */
export function dashFromPpt(val: string | undefined): { dash: StrokeDash | undefined; exact: boolean } {
  if (!val || val === 'solid') return { dash: undefined, exact: true }
  if (val === 'dot' || val === 'sysDot') return { dash: 'dot', exact: true }
  return { dash: 'dash', exact: !/Dot/.test(val) }
}

/**
 * A two-colour gradient as CSS: linear along its angle, or radial from the middle out to the corners (CSS's own default ellipse, the shape of the box). The exporter draws the
 * very same ramps into a picture (png.ts gradientPng), and shapes drawn as SVG use `radialGradient` r = √½ of the box, which is the same ellipse.
 */
export function gradientCss(g: { from: string; to: string; angle: number; kind?: 'linear' | 'radial' | undefined }): string {
  return g.kind === 'radial' ? `radial-gradient(${g.from}, ${g.to})` : `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`
}
