import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { taskDocLinksApi } from '../api/v1/taskDocLinksApi'
import type { CreateDocLinkPayload, UpdateDocLinkPayload } from '../types/documentTypes'

export function useTaskDocLinks(projectId: MaybeRefOrGetter<number>, taskId: MaybeRefOrGetter<number>) {
  return useQuery({
    queryKey: computed(() => ['task-doc-links', toValue(projectId), toValue(taskId)]),
    queryFn: () => taskDocLinksApi.getLinks(toValue(projectId), toValue(taskId)),
    enabled: computed(() => !!toValue(projectId) && !!toValue(taskId)),
  })
}

export function useTaskDocLinkMutations(projectId: MaybeRefOrGetter<number>, taskId: MaybeRefOrGetter<number>) {
  const queryClient = useQueryClient()
  const projectIdValue = computed(() => toValue(projectId))
  const taskIdValue = computed(() => toValue(taskId))

  const createMutation = useMutation({
    mutationFn: (payload: CreateDocLinkPayload) =>
      taskDocLinksApi.createLink(projectIdValue.value, taskIdValue.value, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-doc-links', projectIdValue.value, taskIdValue.value] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ linkId, payload }: { linkId: number; payload: UpdateDocLinkPayload }) =>
      taskDocLinksApi.updateLink(projectIdValue.value, taskIdValue.value, linkId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-doc-links', projectIdValue.value, taskIdValue.value] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (linkId: number) => taskDocLinksApi.deleteLink(projectIdValue.value, taskIdValue.value, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-doc-links', projectIdValue.value, taskIdValue.value] })
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
