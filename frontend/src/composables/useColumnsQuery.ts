import { useQuery } from '@tanstack/vue-query';
import type { Ref, ComputedRef } from 'vue';
import { computed, unref } from 'vue';
import api from '../api/v1/indexApi';
import { isValidId } from '../utils/validation';
import type { iColumn } from '../types/columnTypes';

const fetchColumns = async (projectId: number | string) => {
  if (!isValidId(projectId)) throw new Error('Valid project ID is required');
  const response = await api.getItems('columns', { projectId: Number(projectId) });
  return response as iColumn[];
};

export function useColumnsQuery(projectId: number | string | Ref<number | string> | ComputedRef<number | string>) {
  // Use a computed for the query key so it reacts to ref changes
  const queryKey = computed(() => ['columns', unref(projectId)]);
  const enabled = computed(() => isValidId(unref(projectId)));
  
  return useQuery({
    queryKey,
    queryFn: () => fetchColumns(unref(projectId)),
    enabled,
  });
} 