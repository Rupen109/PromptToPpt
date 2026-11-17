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

// The Morph template the person picked before typing the request (from the website's template pages): carried to the creation screen.
const MORPH_TPL_KEY = 'prompttoppt:pending-morph-template'
export const setPendingMorphTemplate = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(MORPH_TPL_KEY, id)
    else sessionStorage.removeItem(MORPH_TPL_KEY)
  } catch {
    /* ignore */
  }
}
export const getPendingMorphTemplate = (): string | null => {
  try {
    return sessionStorage.getItem(MORPH_TPL_KEY)
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
    sessionStorage.removeItem(MORPH_TPL_KEY)
    sessionStorage.removeItem('prompttoppt:pending-file-template')
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(SRC_KEY)
    sessionStorage.removeItem(LANG_KEY)
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

// The language the person picked for the deck on the home screen ('' = detect it from the request).
const LANG_KEY = 'prompttoppt:pending-language'
export const setPendingLanguage = (code: string) => {
  try {
    if (code) sessionStorage.setItem(LANG_KEY, code)
    else sessionStorage.removeItem(LANG_KEY)
  } catch {
    /* ignore */
  }
}
export const getPendingLanguage = (): string | undefined => {
  try {
    return sessionStorage.getItem(LANG_KEY) || undefined
  } catch {
    return undefined
  }
}

// "Use a file's design": the uploaded design the person picked on the home screen, carried to the creation screen with its summary (so the screen can show it at once).
export interface PendingFileTemplate { id: string; name: string; slideCount: number; aspect: string; fontsReplaced: { original: string; mapped: string }[]; /** the person left the prompt empty: they will add the data themselves */ preferManual?: boolean }
const FILE_TPL_KEY = 'prompttoppt:pending-file-template'
export const setPendingFileTemplate = (t: PendingFileTemplate | null) => {
  try {
    if (t) sessionStorage.setItem(FILE_TPL_KEY, JSON.stringify(t))
    else sessionStorage.removeItem(FILE_TPL_KEY)
  } catch {
    /* ignore */
  }
}
export const getPendingFileTemplate = (): PendingFileTemplate | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(FILE_TPL_KEY) ?? 'null') as PendingFileTemplate | null
    return v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.slideCount === 'number' ? v : null
  } catch {
    return null
  }
}
