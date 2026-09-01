import createClient from 'openapi-fetch'
import type { paths } from '@shared/api/schema'

// In-flight mutation tracker to prevent duplicate concurrent requests and rapid-fire spam
const inFlightMutations = new Map<string, Promise<Response>>()
const recentMutationTimestamps = new Map<string, number>()
const MUTATION_COOLDOWN_MS = 1500 // 1.5 second debounce for identical mutations

async function safeNormalizeResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    try {
      const text = await response.text()
      let parsed: any = { message: text }
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { message: text || `HTTP ${response.status} ${response.statusText}` }
      }
      return new Response(JSON.stringify(parsed), {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    } catch {
      return response
    }
  }
  return response
}

export function createBinaryLaneClient(token: string) {
  const cleanToken = token?.trim() || ''

  const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!cleanToken) {
      // Return 401 early if token is empty instead of making an unauthenticated network request
      return new Response(JSON.stringify({ message: 'No API token configured.' }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (init?.method || 'GET').toUpperCase()
    const isMutation = method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH'

    // Spam & Concurrency Protection for Mutations (Create/Update/Delete/Actions)
    if (isMutation) {
      const mutationKey = `${method}:${url}:${init?.body ? String(init.body) : ''}`
      const now = Date.now()
      const lastSent = recentMutationTimestamps.get(mutationKey) || 0

      // If exact same mutation was triggered within the cooldown window, suppress duplicate
      if (now - lastSent < MUTATION_COOLDOWN_MS) {
        console.warn(`[AntiSpam] Blocked duplicate mutation within cooldown: ${method} ${url}`)
        throw new Error('Action was already submitted. Please wait a moment before trying again.')
      }

      // If exact same mutation is actively in-flight, return the existing pending promise
      if (inFlightMutations.has(mutationKey)) {
        console.warn(`[AntiSpam] Reusing in-flight request for: ${method} ${url}`)
        return inFlightMutations.get(mutationKey)!
      }

      recentMutationTimestamps.set(mutationKey, now)

      const executionPromise = (async () => {
        try {
          const rawResponse = await window.fetch(input, init)
          const response = await safeNormalizeResponse(rawResponse)

          if (response.status === 401 || response.status === 403) {
            window.dispatchEvent(new CustomEvent('bldesk:auth_error', { detail: { status: response.status } }))
          }

          return response
        } finally {
          inFlightMutations.delete(mutationKey)
        }
      })()

      inFlightMutations.set(mutationKey, executionPromise)
      return executionPromise
    }

    // Standard GET / read query path
    const rawResponse = await window.fetch(input, init)
    const response = await safeNormalizeResponse(rawResponse)
    if (response.status === 401 || response.status === 403) {
      window.dispatchEvent(new CustomEvent('bldesk:auth_error', { detail: { status: response.status } }))
    }
    return response
  }

  const client = createClient<paths>({
    baseUrl: 'https://api.binarylane.com.au',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    fetch: customFetch
  })

  return client
}

export type BinaryLaneClient = ReturnType<typeof createBinaryLaneClient>
