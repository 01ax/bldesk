import createClient from 'openapi-fetch'
import type { paths } from '@shared/api/schema'
import { Capacitor, CapacitorHttp } from '@capacitor/core'

export function createBinaryLaneClient(token: string) {
  const cleanToken = token.trim()

  const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // When running natively on Android / Capacitor, route via native CapacitorHttp to bypass WebView CORS restrictions completely
    if (Capacitor.isNativePlatform()) {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        const method = init?.method || 'GET'
        const headers: Record<string, string> = {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init?.headers as Record<string, string>)
        }

        let parsedData: any = undefined
        if (init?.body) {
          if (typeof init.body === 'string') {
            try {
              parsedData = JSON.parse(init.body)
            } catch {
              parsedData = init.body
            }
          } else {
            parsedData = init.body
          }
        }

        const res = await CapacitorHttp.request({
          url,
          method,
          headers,
          data: parsedData
        })

        const responseBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        return new Response(responseBody, {
          status: res.status,
          statusText: res.status === 200 ? 'OK' : '',
          headers: new Headers(res.headers as Record<string, string>)
        })
      } catch (err) {
        console.warn('[NativeFetch] Native fetch fallback triggered:', err)
      }
    }

    return window.fetch(input, init)
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
