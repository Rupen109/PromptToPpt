// A prompt survives a refresh of /create without ever appearing in the URL.
const KEY = 'prompttoppt:pending-prompt'

export const setPendingPrompt = (prompt: string) => {
  try {
    sessionStorage.setItem(KEY, prompt)
  } catch {
    /* storage unavailable (private mode) — prompt just won't survive a refresh */
  }
}
export const getPendingPrompt = (): string | null => {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

// An in-flight generation job id, so a refresh resumes progress instead of starting over (and re-spending credits).
const JOB_KEY = 'prompttoppt:pending-job'
export const setPendingJob = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(JOB_KEY, id)
    else sessionStorage.removeItem(JOB_KEY)
  } catch {
    /* ignore */
  }
}
export const getPendingJob = (): string | null => {
  try {
    return sessionStorage.getItem(JOB_KEY)
  } catch {
    return null
  }
}
export const clearPending = () => {
  setPendingJob(null)
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(SRC_KEY)
  } catch {
    /* ignore */
  }
}

// Sources attached on the home screen travel with the prompt into the create flow.
const SRC_KEY = 'prompttoppt:pending-sources'
export const setPendingSources = (ids: string[]) => {
  try {
    sessionStorage.setItem(SRC_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}
export const getPendingSources = (): string[] => {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(SRC_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
