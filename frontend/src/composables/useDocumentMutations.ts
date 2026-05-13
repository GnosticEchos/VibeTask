import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter } from 'vue'
import { documentsApi } from '../api/v1/documentsApi'
import type { CreateDocumentPayload, UpdateDocumentPayload } from '../types/documentTypes'

export function useDocumentsQuery(projectId: MaybeRefOrGetter<number>, params?: { type?: string }) {
  return useQuery({
    queryKey: ['documents', projectId, params] as const,
    queryFn: () => documentsApi.getDocuments(toValue(projectId), { limit: 100, ...params }),
    enabled: () => !!toValue(projectId),
  })
}

export function useDocumentQuery(projectId: MaybeRefOrGetter<number>, docId: MaybeRefOrGetter<number>) {
  return useQuery({
    queryKey: ['document', projectId, docId] as const,
    queryFn: () => documentsApi.getDocument(toValue(projectId), toValue(docId)),
    enabled: () => !!toValue(projectId) && !!toValue(docId),
  })
}

export function useDocumentMutations(projectId: MaybeRefOrGetter<number>) {
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (payload: CreateDocumentPayload) => documentsApi.createDocument(toValue(projectId), payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', toValue(projectId)] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ docId, payload }: { docId: number; payload: UpdateDocumentPayload }) =>
      documentsApi.updateDocument(toValue(projectId), docId, payload),
    onSuccess: (_data, { docId }) => {
      queryClient.invalidateQueries({ queryKey: ['document', toValue(projectId), docId] })
      queryClient.invalidateQueries({ queryKey: ['documents', toValue(projectId)] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => documentsApi.deleteDocument(toValue(projectId), docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', toValue(projectId)] })
    },
  })

  return {
    createDocument: createMutation.mutateAsync,
    updateDocument: updateMutation.mutateAsync,
    deleteDocument: deleteMutation.mutateAsync,
    createLoading: createMutation.isPending,
    updateLoading: updateMutation.isPending,
    deleteLoading: deleteMutation.isPending,
  }
}

export function useLinkedTasksQuery(projectId: MaybeRefOrGetter<number>, docId: MaybeRefOrGetter<number>) {
  return useQuery({
    queryKey: ['linked-tasks', projectId, docId] as const,
    queryFn: () => documentsApi.getLinkedTasks(toValue(projectId), toValue(docId)),
    enabled: () => !!toValue(projectId) && !!toValue(docId),
  })
}
