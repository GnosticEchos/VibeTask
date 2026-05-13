import { useMutation, useQueryClient } from '@tanstack/vue-query'
import projectsApi from '../api/v1/projectApi'
import { iProject, CreateProjectPayload } from '../types/projectTypes'
import api from '../api/v1/indexApi'
import { isValidId } from '../utils/validation'

export function useProjectMutations() {
  const queryClient = useQueryClient()

  const deleteProjectMutation = useMutation({
    mutationFn: (id: number) => projectsApi.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const createProjectMutation = useMutation({
    mutationFn: (projectData: CreateProjectPayload) => projectsApi.createProject(projectData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<iProject> }) =>
      projectsApi.updateProject(id, payload),
    onSuccess: (/* data, */ variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', variables.id] })
    },
  })

  const updateColumnsMutation = useMutation({
    mutationFn: async ({ projectId, columns }: { projectId: number; columns: any[] }) => {
      if (!isValidId(projectId)) throw new Error('Valid project ID is required')
      return api.updateItems('columns', { projectId, columns })
    },
    onSuccess: (_data, variables) => {
      // Invalidate board and columns queries for this project
      queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['columns', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['board', variables.projectId] })
    },
  })

  const updateColumnDescriptionMutation = useMutation({
    mutationFn: async ({
      projectId,
      columnId,
      description,
    }: {
      projectId: number
      columnId: number
      description: string
    }) => {
      if (!isValidId(projectId) || !isValidId(columnId)) throw new Error('Valid project and column IDs are required')
      return api.updateItem('columns', columnId, { projectId, description })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['columns', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['board', variables.projectId] })
    },
  })

  return {
    createProject: createProjectMutation.mutateAsync,
    updateProject: updateProjectMutation.mutateAsync,
    updateColumns: updateColumnsMutation.mutateAsync,
    updateColumnDescription: updateColumnDescriptionMutation.mutateAsync,
    deleteProject: deleteProjectMutation.mutateAsync,
    isDeletingProject: deleteProjectMutation.isPending,
  }
} 