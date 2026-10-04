import { createApiClient } from '@prompttoppt/api-client'
import { API_URL } from './env'

export const api = createApiClient({ apiUrl: API_URL })
