import { useQuery } from '@tanstack/vue-query'
import { getAdminUsers } from '@/api/v1/adminApi'
import type { AdminUserRow } from '@/api/v1/adminApi'

export function useAdminUsersQuery() {
  return useQuery<AdminUserRow[]>({
    queryKey: ['admin', 'users'],
    queryFn: getAdminUsers,
    retry: (failureCount, error: unknown) => {
      const err = error as { response?: { status?: number } }
      const status = err?.response?.status
      if (status === 403 || status === 401) return false
      if (status === 429 && failureCount < 3) return true
      if (status === 429) return false
      return failureCount < 2
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })
}
