/** Smallest valid text PDF, one string per page — for tests that need a real file for the extractor. */
export function tinyPdf(pages: string[]): Uint8Array {
  const objs: string[] = ['<</Type/Catalog/Pages 2 0 R>>', `<</Type/Pages/Kids[${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}]/Count ${pages.length}>>`]
  pages.forEach((t, i) => {
    const content = `BT /F1 24 Tf 72 700 Td (${t}) Tj ET`
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${4 + i * 2} 0 R/Resources<</Font<</F1 ${3 + pages.length * 2} 0 R>>>>>>`, `<</Length ${content.length}>>\nstream\n${content}\nendstream`)
  })
  objs.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>')
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(out)
}
