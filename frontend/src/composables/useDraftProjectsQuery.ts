import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { axiosApi } from '@/api/axios'

export type DraftProjectColumn = {
  id: number
  name: string
  order: number
  description?: string | null
}

export type DraftProjectRow = {
  id: number
  name: string
  prefix: string
  description?: string | null
  lifecycleStatus?: string
  status?: string
  columns?: DraftProjectColumn[]
}

async function fetchDraftProjects(): Promise<DraftProjectRow[]> {
  const response = await axiosApi.get<{ data: DraftProjectRow[] }>('/projects', {
    params: { lifecycleStatus: 'DRAFT' },
  })
  return response.data.data ?? []
}

export function useDraftProjectsQuery() {
  return useQuery({
    queryKey: ['projects', 'drafts'],
    queryFn: fetchDraftProjects,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

export type PlanningPreview = {
  projectId: number
  name: string
  prefix: string
  description: string | null
  lifecycleStatus: string
  templateId: string | null
  columns: Array<{ id: number; name: string; roleType: string | null; order: number }>
  documents: Array<{ id: number; title: string; docType: string; contentPreview: string }>
  backlogCount: number
  checklist: Array<{ id: string; label: string; passed: boolean }>
  warnings: string[]
}

export function usePlanningPreviewQuery(projectId: () => number | null) {
  return useQuery({
    queryKey: computed(() => ['planning-preview', projectId()] as const),
    queryFn: async () => {
      const id = projectId()
      if (!id) return null
      const response = await axiosApi.get<PlanningPreview>(`/projects/${id}/planning/preview`)
      return response.data
    },
    enabled: () => {
      const id = projectId()
      return typeof id === 'number' && id > 0
    },
  })
}
