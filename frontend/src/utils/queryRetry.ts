import { ForbiddenError, NotFoundError } from '@/api/errors'

/** Skip TanStack Query retries for auth/membership failures that will not heal on retry. */
export function shouldRetryQueryError(failureCount: number, error: unknown): boolean {
  if (error instanceof ForbiddenError || error instanceof NotFoundError) return false
  return failureCount < 3
}
