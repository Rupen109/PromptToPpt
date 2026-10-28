import { createApiClient } from '@prompttoppt/api-client'
import { API_URL } from './env'

/** The account this tab is showing. Sent with every write so the server refuses it if another tab switched accounts (see RequireAuth). */
let sessionUser: string | null = null
export const setSessionUser = (id: string | null) => { sessionUser = id }
export const SESSION_CHANGED_EVENT = 'pt:session-changed'

export const api = createApiClient({
  apiUrl: API_URL,
  sessionUser: () => sessionUser,
  onSessionChanged: () => window.dispatchEvent(new Event(SESSION_CHANGED_EVENT)),
})
