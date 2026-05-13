import { defineStore } from 'pinia'
import { ref } from 'vue'
import { axiosApi } from '../api/axios'
import { devLog } from '../utils/logger'
import { isValidId } from '../utils/validation'
import { REWRITE_MAX_LIST_PAGE_SIZE, unwrapListItems } from '../utils/paginatedListResponse'

export const useBacklogStore = defineStore('backlog', () => {
  const items = ref<any[]>([])
  const isLoading = ref(false)

  async function fetchBacklogTasks(projectId: number | string) {
    if (!isValidId(projectId)) {
      items.value = []
      return
    }
    isLoading.value = true
    try {
      // Use only projectId; backend may 500 if unassigned is sent. Filter unassigned client-side.
      const response = await axiosApi.get('/tasks', {
        params: { projectId, limit: REWRITE_MAX_LIST_PAGE_SIZE },
      })
      const { items: rows, pagination } = unwrapListItems(response.data)
      if (import.meta.env?.DEV && pagination?.hasNext) {
        devLog(
          '[BacklogStore] Task list truncated by pagination; not all unassigned tasks may be loaded.',
        )
      }
      items.value = rows.filter((task: any) => task.projectColumnId == null)
    } catch (error) {
      items.value = []
      devLog('[BacklogStore] Failed to fetch backlog tasks (backend may not support GET /tasks?projectId yet):', error)
    } finally {
      isLoading.value = false
    }
  }

  function removeTask(id: number | string) {
    items.value = items.value.filter((task: any) => task.id !== id)
  }

  function addTask(task: any) {
    if (task && task.projectColumnId == null) {
      items.value.push(task)
    }
  }

  return {
    items,
    isLoading,
    fetchBacklogTasks,
    removeTask,
    addTask,
  }
}) 