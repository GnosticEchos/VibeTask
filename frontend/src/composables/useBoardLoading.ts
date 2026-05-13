import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'

export function useBoardLoading() {
  const projectStore = useProjectStore()
  const isBoardLoading = computed(() => projectStore.loading)
  return { isBoardLoading }
} 