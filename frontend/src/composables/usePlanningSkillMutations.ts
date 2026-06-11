import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { unref, type MaybeRef } from 'vue'
import {
  deleteProjectPlanningSkillOverride,
  revertAdminPlanningSkill,
  syncAdminPlanningSkills,
  upsertAdminPlanningSkill,
  upsertProjectPlanningSkill,
} from '@/api/v1/planningSkillsApi'

export type PlanningSkillScope = 'platform' | 'project'

function isValidProjectId(id: number | null | undefined): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0
}

export function usePlanningSkillMutations(
  scope: PlanningSkillScope,
  projectId?: MaybeRef<number | null | undefined>,
) {
  const queryClient = useQueryClient()

  function invalidateAfterUpsert(slug: string) {
    if (scope === 'platform') {
      queryClient.invalidateQueries({ queryKey: ['admin', 'planning-skills'] })
      return
    }
    const id = unref(projectId)
    if (!isValidProjectId(id)) return
    queryClient.invalidateQueries({ queryKey: ['project', id, 'planning-skills'] })
    queryClient.invalidateQueries({ queryKey: ['project', id, 'planning-skills', slug] })
  }

  const upsertMutation = useMutation({
    mutationFn: async ({ slug, content }: { slug: string; content: string }) => {
      if (scope === 'platform') {
        return upsertAdminPlanningSkill(slug, content)
      }
      const id = unref(projectId)
      if (!isValidProjectId(id)) throw new Error('Valid project ID is required')
      return upsertProjectPlanningSkill(id, slug, content)
    },
    onSuccess: (_data, variables) => {
      invalidateAfterUpsert(variables.slug)
    },
  })

  const syncMutation = useMutation({
    mutationFn: syncAdminPlanningSkills,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'planning-skills'] })
    },
  })

  const revertMutation = useMutation({
    mutationFn: ({ slug, revisionId }: { slug: string; revisionId: string }) =>
      revertAdminPlanningSkill(slug, revisionId),
    onSuccess: (_data, variables) => {
      invalidateAfterUpsert(variables.slug)
    },
  })

  const deleteOverrideMutation = useMutation({
    mutationFn: async ({ slug }: { slug: string }) => {
      const id = unref(projectId)
      if (!isValidProjectId(id)) throw new Error('Valid project ID is required')
      await deleteProjectPlanningSkillOverride(id, slug)
    },
    onSuccess: (_data, variables) => {
      invalidateAfterUpsert(variables.slug)
    },
  })

  return {
    upsertMutation,
    syncMutation,
    revertMutation,
    deleteOverrideMutation,
  }
}
