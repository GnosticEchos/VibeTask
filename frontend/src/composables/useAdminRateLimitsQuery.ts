import { useQuery } from '@tanstack/vue-query'
import { getRateLimitConfigs } from '@/api/v1/adminApi'
import type { RateLimitConfig } from '@/api/v1/adminApi'

export function useAdminRateLimitsQuery() {
  return useQuery<RateLimitConfig[]>({
    queryKey: ['admin', 'rate-limits'],
    queryFn: getRateLimitConfigs,
    retry: (failureCount, error: unknown) => {
      const err = error as { response?: { status?: number } }
      const status = err?.response?.status
      // 429: allow a couple retries (window may reset)
      if (status === 403 || status === 401) return false
      if (status === 429 && failureCount < 3) return true
      if (status === 429) return false
      return failureCount < 2
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })
}
