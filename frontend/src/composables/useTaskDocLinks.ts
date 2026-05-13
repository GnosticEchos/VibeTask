import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { taskDocLinksApi } from '../api/v1/taskDocLinksApi'
import type { CreateDocLinkPayload, UpdateDocLinkPayload } from '../types/documentTypes'

export function useTaskDocLinks(projectId: number, taskId: number) {
  return useQuery({
    queryKey: ['task-doc-links', projectId, taskId],
    queryFn: () => taskDocLinksApi.getLinks(projectId, taskId),
    enabled: !!projectId && !!taskId,
  })
}

export function useTaskDocLinkMutations(projectId: number, taskId: number) {
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (payload: CreateDocLinkPayload) => taskDocLinksApi.createLink(projectId, taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-doc-links', projectId, taskId] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ linkId, payload }: { linkId: number; payload: UpdateDocLinkPayload }) =>
      taskDocLinksApi.updateLink(projectId, taskId, linkId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-doc-links', projectId, taskId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (linkId: number) => taskDocLinksApi.deleteLink(projectId, taskId, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-doc-links', projectId, taskId] })
    },
  })

  return {
    createLink: createMutation.mutateAsync,
    updateLink: updateMutation.mutateAsync,
    deleteLink: deleteMutation.mutateAsync,
    createLoading: createMutation.isPending,
    updateLoading: updateMutation.isPending,
    deleteLoading: deleteMutation.isPending,
  }
}
