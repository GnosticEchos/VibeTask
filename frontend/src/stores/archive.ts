import { defineStore } from 'pinia'
import { ref } from 'vue'
import { axiosApi } from '../api/axios'
import { devLog } from '../utils/logger'
import { isValidId } from '../utils/validation'
import { REWRITE_MAX_LIST_PAGE_SIZE, unwrapListItems } from '../utils/paginatedListResponse'

export const useArchiveStore = defineStore('archive', () => {
  const items = ref<any[]>([])
  const isLoading = ref(false)

  async function fetchArchivedTasks(projectId: number | string) {
    if (!isValidId(projectId)) {
      items.value = []
      return
    }
    isLoading.value = true
    try {
      const response = await axiosApi.get('/tasks', {
        params: { projectId, archived: 'true', limit: REWRITE_MAX_LIST_PAGE_SIZE },
      })
      const { items: rows, pagination } = unwrapListItems(response.data)
      if (import.meta.env?.DEV && pagination?.hasNext) {
        devLog(
          '[ArchiveStore] Task list truncated by pagination; not all archived tasks may be loaded.',
        )
      }
      items.value = rows
    } catch (error) {
      items.value = []
      devLog('[ArchiveStore] Failed to fetch archived tasks:', error)
    } finally {
      isLoading.value = false
    }
  }

  function removeTask(id: number | string) {
    items.value = items.value.filter((task: any) => task.id !== id)
  }

  function addTask(task: any) {
    if (task?.archivedAt) {
      items.value.push(task)
    }
  }

  return {
    items,
    isLoading,
    fetchArchivedTasks,
    removeTask,
    addTask,
  }
})
