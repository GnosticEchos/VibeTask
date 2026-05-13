/**
 * Kanban-rewrite list endpoints return `{ data: T[], pagination }`.
 * Legacy backends may return a bare array. Normalize both shapes here.
 *
 * Backend caps `limit` at 100 per request (see rewrite task/column/project routes).
 */
export const REWRITE_MAX_LIST_PAGE_SIZE = 100
/**
 * Policy toggle: when true, list fetchers may inject a high default limit for
 * rewrite paginated endpoints if caller did not pass one explicitly.
 */
export const ENABLE_IMPLICIT_LIST_LIMIT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_IMPLICIT_LIST_LIMIT !== 'false')

export interface ListPaginationMeta {
  page?: number
  limit?: number
  total?: number
  totalPages?: number
  hasNext?: boolean
  hasPrev?: boolean
}

export function unwrapListItems(body: unknown): {
  items: unknown[]
  pagination?: ListPaginationMeta
} {
  if (Array.isArray(body)) {
    return { items: body }
  }
  if (
    body !== null &&
    typeof body === 'object' &&
    'data' in body &&
    Array.isArray((body as { data: unknown }).data)
  ) {
    const raw = body as { data: unknown[]; pagination?: ListPaginationMeta }
    return { items: raw.data, pagination: raw.pagination }
  }
  return { items: [] }
}
