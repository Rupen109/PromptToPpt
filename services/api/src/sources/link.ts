import { type Extracted, fetchPage } from './extract.ts'
import { type FetchLike, parseGoogleLink, readGoogle } from './google.ts'

/** A link a person pasted: a Google Doc / Sheet / Slides is read through its export, anything else is read as a public web page. */
export async function readLink(rawUrl: string, fetchImpl?: FetchLike): Promise<Extracted> {
  const google = parseGoogleLink(rawUrl.trim())
  return google ? readGoogle(google, fetchImpl) : fetchPage(rawUrl, fetchImpl)
}
