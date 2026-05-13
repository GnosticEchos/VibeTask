import { useQuery } from '@tanstack/vue-query'
import { getAdminSystemHealth } from '@/api/v1/adminApi'
import type { SystemHealthResponse } from '@/api/v1/adminApi'

export function useAdminSystemHealthQuery() {
  return useQuery<SystemHealthResponse>({
    queryKey: ['admin', 'system-health'],
    queryFn: getAdminSystemHealth,
    retry: 1,
    staleTime: 15_000,
  })
}
