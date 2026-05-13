import { computed } from 'vue'
import type { iSimplifiedProject } from '@/types/projectTypes'
import { useProjectsQuery } from '@/composables/useProjectsQuery'

/**
 * Read-only composable that exposes projects data and a derived list
 * of projects where the current user is a member.
 *
 * This keeps TanStack Query as the source of truth for project lists
 * and avoids coupling Pinia stores directly to query hooks.
 */
export function useMemberProjects() {
  const { data, isLoading, isError, error } = useProjectsQuery()

  const memberProjects = computed<iSimplifiedProject[]>(() => {
    if (!data.value) return []
    return (data.value as iSimplifiedProject[]).filter(
      (project) => project.isMember,
    )
  })

  return {
    projects: data,
    memberProjects,
    isLoading,
    isError,
    error,
  }
}

