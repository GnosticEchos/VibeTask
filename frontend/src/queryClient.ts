import type { QueryClient } from '@tanstack/vue-query'

let client: QueryClient | null = null

export function setQueryClient(c: QueryClient) {
  client = c
}

export function getQueryClient(): QueryClient | null {
  return client
}

/** Invalidate projects query (e.g. from websocket or outside component tree). */
export function invalidateProjectsQuery() {
  return client?.invalidateQueries({ queryKey: ['projects'] })
}
