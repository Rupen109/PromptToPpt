/**
 * Characters XML 1.0 forbids (control characters other than tab, newline and return, and the two non-characters). Text pulled out of PDFs and pasted from other
 * apps carries them now and then; one of them anywhere in a PowerPoint file makes PowerPoint "repair" it. They are invisible, so removing them changes nothing a
 * reader sees.
 */
export const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g
export const xmlSafe = (s: string) => s.replace(XML_FORBIDDEN, '')
