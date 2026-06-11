import { useQuery } from '@tanstack/vue-query'
import {
  getAdminPlanningSkillCatalog,
  listAdminPlanningSkills,
  type PlanningSkillCatalogEntry,
  type PlanningSkillSummary,
} from '@/api/v1/planningSkillsApi'

export function usePlanningSkillsCatalogQuery() {
  return useQuery<PlanningSkillCatalogEntry[]>({
    queryKey: ['admin', 'planning-skills', 'catalog'],
    queryFn: getAdminPlanningSkillCatalog,
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 2
    },
  })
}

export function useAdminPlanningSkillsListQuery() {
  return useQuery<PlanningSkillSummary[]>({
    queryKey: ['admin', 'planning-skills', 'list'],
    queryFn: listAdminPlanningSkills,
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) return false
      return failureCount < 2
    },
  })
}
