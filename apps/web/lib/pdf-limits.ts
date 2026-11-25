/**
 * How big a PDF the free in-browser PDF tools take, and the error they report. No imports, so pages that only show the numbers (tool cards, the tool page's own text) stay light.
 */
/** the default for the free PDF tools (PDF to JPG, the PDF editor): what they were measured at */
export const MAX_PAGES = 60
export const MAX_BYTES = 30 * 1024 * 1024
/** PDF to PowerPoint: one page at a time, pdf.js's caches emptied as it goes, so it takes far bigger PDFs */
export const PPT_MAX_PAGES = 300
export const PPT_MAX_BYTES = 100 * 1024 * 1024
export interface PdfLimits { maxPages: number; maxBytes: number }

/** a problem with the visitor's file, said in plain words */
export class PdfConvertError extends Error {}
