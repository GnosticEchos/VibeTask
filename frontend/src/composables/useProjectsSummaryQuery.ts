import { useQuery } from '@tanstack/vue-query'
import { axiosApi } from '../api/axios'
import type { ProjectStats } from '@/types/projectStatsTypes'
import { computed, unref, type MaybeRef } from 'vue'

export type ProjectsSummaryScope = 'main' | 'all'

type FleetSummaryResponse = {
  projects: ProjectStats[]
}

async function fetchProjectsSummary(scope: ProjectsSummaryScope): Promise<ProjectStats[]> {
  const response = await axiosApi.get<FleetSummaryResponse>('/projects/summary', {
    params: { scope },
  })
  return response.data?.projects ?? []
}

export function useProjectsSummaryQuery(scope: MaybeRef<ProjectsSummaryScope> = 'main') {
  const normalizedScope = computed<ProjectsSummaryScope>(() => unref(scope))
  return useQuery<ProjectStats[]>({
    queryKey: computed(() => ['projects', 'summary', normalizedScope.value]),
    queryFn: () => fetchProjectsSummary(normalizedScope.value),
    placeholderData: (prev) => prev,
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) return false
      if (status === 429) return failureCount < 3
      return failureCount < 2
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })
}
