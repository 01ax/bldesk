import createClient from 'openapi-fetch'
import type { paths } from '@shared/api/schema'

export function createBinaryLaneClient(token: string) {
  const client = createClient<paths>({
    baseUrl: 'https://api.binarylane.com.au',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  })

  return client
}

export type BinaryLaneClient = ReturnType<typeof createBinaryLaneClient>
