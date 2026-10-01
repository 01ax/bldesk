// What a failed BinaryLane call becomes, and the paged reads that must not hide one. No imports, so it can be tested
// on its own (scripts/test-api-errors.mjs).

/**
 * A failed API call: a message a customer can read, and the HTTP status so the code that handles it
 * (the retry policy, the token banner) can tell kinds of failure apart. A plain `Error` carries no status.
 */
export class ApiError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const MAX_TEXT = 300

/**
 * The reason BinaryLane gave, in words. Never raw JSON: a body with none of the fields the API reference
 * documents reads as a generic failure rather than a dump of what came back.
 */
export function describeApiError(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') {
    const text = error.trim()
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text || 'Unknown error'
  }
  const e = error as { message?: unknown; detail?: unknown; title?: unknown; errors?: Record<string, unknown> }
  if (typeof e.message === 'string' && e.message) return e.message
  if (typeof e.detail === 'string' && e.detail) return e.detail
  if (e.errors && typeof e.errors === 'object') {
    const parts = Object.entries(e.errors).map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : String(msgs)}`)
    if (parts.length) return parts.join('; ')
  }
  if (typeof e.title === 'string' && e.title) return e.title
  return 'BinaryLane returned an error without a reason.'
}

/**
 * The error to throw for a failed result of the typed client. A failure with an empty body leaves `error`
 * unset (openapi-fetch), so the response status counts too: `if (error || !response.ok) throw apiFailure(error, response)`.
 */
export function apiFailure(error: unknown, response?: { status: number } | null): ApiError {
  const status = response?.status
  if (error) return new ApiError(describeApiError(error), status)
  return new ApiError(status ? `BinaryLane answered HTTP ${status} with no reason.` : 'BinaryLane returned an error without a reason.', status)
}

/**
 * Statuses that retrying cannot change: the token is refused (401, 403) or the thing is not there (404). A read
 * that fails this way is reported at once instead of being retried.
 */
export function isFinalFailure(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status
  return status === 401 || status === 403 || status === 404
}

/**
 * Whether a response says the token itself is refused, which raises the "token failed" banner. A 401 always does.
 * A 403 does too, except where the API reference uses it for a rule about the request rather than the token:
 * deleting a VPC that is not allowed. That one is an ordinary failure with its own reason.
 */
export function refusesToken(method: string, url: string, status: number): boolean {
  if (status === 401) return true
  if (status !== 403) return false
  let path = url
  try {
    path = new URL(url, 'https://api.binarylane.com.au').pathname
  } catch {
    // Not a URL: test it as given.
  }
  return !(method.toUpperCase() === 'DELETE' && /^\/v2\/vpcs\/[^/]+\/?$/.test(path))
}

/** Statuses that cannot carry a body: rebuilding a Response with one and a body throws. */
export const NULL_BODY_STATUSES = new Set([204, 205, 304])

/**
 * Fetch every page of a paginated list endpoint.
 *
 * `per_page` defaults to 20 across this API and `meta.total` is returned but easy
 * to ignore, which silently truncates. It matters for the create form: there are
 * 27 distribution images and 21 sizes, so a single default-page request drops 7
 * operating systems and a plan without any indication.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    page: number,
    perPage: number
  ) => Promise<{ data?: { meta?: { total?: number } } & Record<string, any>; error?: unknown; response?: { ok: boolean; status: number } }>,
  key: string,
  label: string
): Promise<T[]> {
  const PER_PAGE = 200
  const MAX_PAGES = 10
  const failed = (r: { error?: unknown; response?: { ok: boolean } }) => !!r.error || r.response?.ok === false
  const first = await fetchPage(1, PER_PAGE)
  if (failed(first)) throw apiFailure(first.error, first.response)
  const items: T[] = [...((first.data?.[key] as T[]) || [])]
  const total = first.data?.meta?.total ?? items.length
  const pages = Math.min(Math.ceil(total / PER_PAGE), MAX_PAGES)
  if (pages > 1) {
    const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => fetchPage(i + 2, PER_PAGE)))
    for (const r of rest) {
      // A page that failed is a failed read: returning the pages that did load would pass off a shorter list as the whole one.
      if (failed(r)) {
        console.warn(`[${label}] Error loading a page:`, r.error)
        throw apiFailure(r.error, r.response)
      }
      items.push(...((r.data?.[key] as T[]) || []))
    }
  }
  return items
}
