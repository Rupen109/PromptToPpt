/**
 * The largest file of each kind the server reads as a source for a deck. One place, so the server enforces them and the website can say them (or warn before an
 * upload that would be refused, e.g. "Redesign it with AI" on a PDF larger than the PDF limit).
 */
const MB = 1024 * 1024
export const SOURCE_MAX_BYTES = { pdf: 10 * MB, pptx: 15 * MB, docx: 15 * MB, xlsx: 15 * MB, csv: 15 * MB } as const
