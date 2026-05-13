import { useQuery } from '@tanstack/vue-query'
import api from '../api/v1/indexApi'
import type { iProject } from '@/types/projectTypes'

const fetchProjects = async () => (await api.getItems('projects', {})) as iProject[]

export function useProjectsQuery() {
  return useQuery<iProject[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    // Keep prior data visible while revalidating after route/context changes.
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