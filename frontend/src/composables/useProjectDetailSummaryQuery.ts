import { useQuery } from '@tanstack/vue-query'
import { axiosApi } from '../api/axios'
import type { ProjectStats } from '@/types/projectStatsTypes'
import { computed, unref, type MaybeRef } from 'vue'

export type ProjectDetailSummaryScope =
  | { kind: 'main' }
  | { kind: 'all' }
  | { kind: 'workspace'; workspaceId: number }

export type HumanProjectSummaryMember = {
  id: number
  name: string
  email: string
  avatarUrl: string | null
  role: string
}

type ProjectDetailSummaryResponse = {
  project: ProjectStats
  members: HumanProjectSummaryMember[]
}

function scopeQueryParams(scope: ProjectDetailSummaryScope): Record<string, string> {
  if (scope.kind === 'all') return { scope: 'all' }
  if (scope.kind === 'workspace') return { scope: `workspace:${scope.workspaceId}` }
  return { scope: 'main' }
}

function scopeCacheKey(scope: ProjectDetailSummaryScope): string {
  if (scope.kind === 'workspace') return `workspace:${scope.workspaceId}`
  return scope.kind
}

async function fetchProjectDetailSummary(
  projectId: number,
  scope: ProjectDetailSummaryScope,
): Promise<ProjectDetailSummaryResponse> {
  const response = await axiosApi.get<ProjectDetailSummaryResponse>(`/projects/${projectId}/summary`, {
    params: scopeQueryParams(scope),
  })
  const body = response.data
  if (!body?.project) {
    throw new Error('Project summary response missing project stats')
  }
  return {
    project: body.project,
    members: body.members ?? [],
  }
}

export function useProjectDetailSummaryQuery(
  projectId: MaybeRef<number | null | undefined>,
  scope: MaybeRef<ProjectDetailSummaryScope> = { kind: 'main' },
) {
  const normalizedId = computed(() => {
    const id = unref(projectId)
    return typeof id === 'number' && Number.isFinite(id) && id > 0 ? id : null
  })
  const normalizedScope = computed(() => unref(scope))

  return useQuery({
    queryKey: computed(() => [
      'project',
      normalizedId.value,
      'summary',
      scopeCacheKey(normalizedScope.value),
    ]),
    queryFn: () =>
      fetchProjectDetailSummary(normalizedId.value as number, normalizedScope.value),
    enabled: computed(() => normalizedId.value != null),
    placeholderData: (prev) => prev,
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403 || status === 404) return false
      if (status === 429) return failureCount < 3
      return failureCount < 2
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })
}
