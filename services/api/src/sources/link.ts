import { type Extracted, fetchPage } from './extract.ts'
import { SourceError } from './errors.ts'
import { type FetchLike, parseGoogleLink, readGoogle } from './google.ts'
import { isYouTubeLink, YOUTUBE_HELP } from './transcript.ts'

/** A link a person pasted: a Google Doc / Sheet / Slides is read through its export, anything else is read as a public web page. */
export async function readLink(rawUrl: string, fetchImpl?: FetchLike): Promise<Extracted> {
  if (isYouTubeLink(rawUrl)) throw new SourceError(YOUTUBE_HELP) // never fetched: see transcript.ts
  const google = parseGoogleLink(rawUrl.trim())
  return google ? readGoogle(google, fetchImpl) : fetchPage(rawUrl, fetchImpl)
}
