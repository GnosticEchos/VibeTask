import { useQuery } from '@tanstack/vue-query'
import { computed, unref, type MaybeRef } from 'vue'
import {
  getProjectPlanningSkill,
  listProjectPlanningSkills,
  type PlanningSkillContent,
  type ProjectPlanningSkillIndexEntry,
} from '@/api/v1/planningSkillsApi'

function isValidProjectId(id: number | null | undefined): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0
}

export function useProjectPlanningSkillsQuery(projectId: MaybeRef<number | null | undefined>) {
  return useQuery<ProjectPlanningSkillIndexEntry[]>({
    queryKey: ['project', projectId, 'planning-skills'],
    queryFn: async () => {
      const id = unref(projectId)
      if (!isValidProjectId(id)) return []
      return listProjectPlanningSkills(id)
    },
    enabled: () => isValidProjectId(unref(projectId)),
  })
}

export function useProjectPlanningSkillContentQuery(
  projectId: MaybeRef<number | null | undefined>,
  slug: MaybeRef<string | null | undefined>,
) {
  const enabled = computed(() => {
    const id = unref(projectId)
    const s = unref(slug)
    return isValidProjectId(id) && typeof s === 'string' && s.length > 0
  })

  return useQuery<PlanningSkillContent | null>({
    queryKey: ['project', projectId, 'planning-skills', slug, 'content'],
    queryFn: async () => {
      const id = unref(projectId)
      const s = unref(slug)
      if (!isValidProjectId(id) || !s) return null
      return getProjectPlanningSkill(id, s)
    },
    enabled: () => enabled.value,
  })
}
