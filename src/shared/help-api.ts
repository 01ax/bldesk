// The published-article service has no access to BinaryLane accounts.
export const HELP_API_ORIGIN = 'https://uai.adamhomenet.com'
export const HELP_TIMEOUT_MS = 20_000
export interface HelpAnswer {
  answer: string
  results: Array<{ title: string; url: string }>
  id: string
}
export interface HelpApi {
  helpAsk: (question: string) => Promise<HelpAnswer>
  helpSuggest: (prefix: string) => Promise<string[]>
  helpFeedback: (id: string, helpful: boolean) => Promise<void>
}

export function helpQuestion(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw new Error('Enter a question of 1–1000 characters.')
  return value.trim()
}

export function helpFeedbackBody(id: unknown, helpful: unknown): { id: number; helpful: boolean } {
  const number = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : NaN
  if (!Number.isSafeInteger(number) || number <= 0 || typeof helpful !== 'boolean') throw new Error('Invalid help feedback.')
  return { id: number, helpful }
}

export function isHelpArticle(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && (
      (u.hostname === 'support.binarylane.com.au' && u.pathname.startsWith('/support/solutions/')) ||
      (u.hostname === 'api.binarylane.com.au' && (u.pathname === '/reference' || u.pathname.startsWith('/reference/')))
    )
  } catch { return false }
}

export function readHelpAnswer(value: unknown): HelpAnswer {
  const v = value as HelpAnswer
  if (!v || typeof v.answer !== 'string' || !Array.isArray(v.results) || typeof v.id !== 'string') throw new Error('Invalid help response.')
  return { answer: v.answer, id: v.id, results: v.results.filter(r => r && typeof r.title === 'string' && typeof r.url === 'string' && isHelpArticle(r.url)) }
}

export function readHelpSuggestions(value: unknown): string[] {
  const v = value as { suggestions?: unknown }
  if (!v || !Array.isArray(v.suggestions)) throw new Error('Invalid help suggestions.')
  return [...new Set(v.suggestions.filter((s): s is string => typeof s === 'string' && !!s.trim() && s.length <= 1000))].slice(0, 6)
}
