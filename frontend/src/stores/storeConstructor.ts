import api from '../api/v1/indexApi'
import { useProjectStore } from './project'
import { falseLoadingState } from '../utils/functions'
import { isValidId } from '../utils/validation'
import { computed, ref, Ref } from 'vue'
import { Task, type iTask } from '../types/taskTypes'
import { mergeBoardTaskFromWebsocket } from '../utils/websocketTaskProjectColumns'
import { storeLog } from '@/utils/logger'

interface Item {
  id: number
}

export const storeConstructor = <T extends Item, Y extends Item>(
  endpoint: string,
) => {
  const items = ref([]) as Ref<Y[]>
  const item = ref({} as T) as Ref<T>
  const loadingItem = ref(false) as Ref<boolean>
  const loadingItems = ref(false) as Ref<boolean>

  const projectStore = useProjectStore()
  const selectedProjectId = computed<number | null>(
    () => projectStore.selectedProjectId || null,
  )

  const getItems = async (filters: any | undefined = {}) => {
    storeLog.debug('getItems called', { filters })
    loadingItems.value = true
    const response = await api.getItems<Y>(endpoint, {
      projectId: selectedProjectId.value,
      filters,
    })
    // Normalize tasks if endpoint is 'tasks'
    items.value =
      endpoint === 'tasks'
        ? (response as unknown[]).map((row: any) => new Task(row) as unknown as Y)
        : response
    storeLog.debug('getItems result', { itemCount: items.value.length })
    loadingItems.value = await falseLoadingState()
  }

  const getItem = async (id: number) => {
    storeLog.debug('getItem called', { id })
    if (!isValidId(id)) {
      storeLog.error('getItem invalid id', { id })
      return Promise.reject(new Error('Invalid ID parameter'))
    }

    loadingItem.value = true
    const response = await api.getItem(endpoint, Number(id), {
      projectId: selectedProjectId.value,
    })
    // Normalize task if endpoint is 'tasks'
    item.value = endpoint === 'tasks' ? (new Task(response) as unknown as T) : (response as T)
    storeLog.debug('getItem result', { item: item.value })
    loadingItem.value = await falseLoadingState()
  }

  const fetchItem = async (id: number) => {
    if (!isValidId(id)) {
      return Promise.reject(new Error('Invalid ID parameter'))
    }

    loadingItem.value = true
    const response = await api.getItem(endpoint, Number(id), {
      projectId: selectedProjectId.value,
    })
    loadingItem.value = await falseLoadingState()
    // Normalize task if endpoint is 'tasks'
    return endpoint === 'tasks' ? (new Task(response) as unknown as T) : (response as T)
  }

  const createItem = async (params: any) => {
    storeLog.debug('createItem called', { params })
    loadingItem.value = true
    const response = await api.createItem(endpoint, {
      projectId: selectedProjectId.value,
      ...params,
    })
    loadingItem.value = await falseLoadingState()
    storeLog.debug('createItem finished')
    return endpoint === 'tasks' ? (new Task(response) as unknown as T) : (response as T)
  }

  const updateItem = async (id: number, params: any) => {
    storeLog.debug('updateItem called', { id, params })
    if (!isValidId(id)) {
      storeLog.error('updateItem invalid id', { id })
      return Promise.reject(new Error('Invalid ID parameter'))
    }

    loadingItem.value = true
    const index = items.value.findIndex((item) => item.id === id)
    items.value[index] = { ...items.value[index], updating: true }
    await api.updateItem(endpoint, Number(id), {
      projectId: selectedProjectId.value,
      ...params,
    })
    loadingItem.value = await falseLoadingState()
    storeLog.debug('updateItem finished', { id })
  }

  const updateItems = async (payload: any) => {
    storeLog.debug('updateItems called', { payload })
    loadingItems.value = true
    await api.updateItems(endpoint, {
      projectId: selectedProjectId.value,
      [endpoint]: payload,
    })
    loadingItems.value = await falseLoadingState()
    storeLog.debug('updateItems finished')
  }

  const WSCreatedItemsHandler = (createdItem: Y) => {
    items.value.push(createdItem as Y)
  }

  const WSUpdatedItemHandler = (updatedItem: T) => {
    item.value = updatedItem
  }

  const WSUpdatedItemsHandler = (updatedItem: Y) => {
    const index = items.value.findIndex((i) => i.id === updatedItem.id)
    if (index === -1) {
      items.value.push(updatedItem as Y)
      return
    }
    if (endpoint === 'tasks') {
      items.value[index] = mergeBoardTaskFromWebsocket(
        items.value[index] as unknown as iTask,
        updatedItem as unknown as iTask,
      ) as unknown as Y
      return
    }
    items.value[index] = updatedItem as Y
  }

  const WSDeletedItemsHandler = (deletedItem: Y) => {
    const index = items.value.findIndex((i) => i.id === deletedItem.id)
    if (index !== -1) {
      items.value.splice(index, 1)
    }
  }

  const deleteItem = async (id: number) => {
    storeLog.debug('deleteItem called', { id })
    if (!isValidId(id)) {
      storeLog.error('deleteItem invalid id', { id })
      return Promise.reject(new Error('Invalid ID parameter'))
    }

    loadingItem.value = true
    await api.deleteItem(endpoint, Number(id))
    loadingItem.value = await falseLoadingState()
    storeLog.debug('deleteItem finished', { id })
  }

  /**
   * Replace a single item in the items array by id with a new object reference.
   * This is required for robust reactivity in components like ProjectGrid.vue and Board.vue,
   * following the parent-child data sync pattern. Use after editing a single item (e.g., from a modal)
   * to ensure all consumers of the array see the update immediately.
   *
   * Note: updatedItem must be of type Y (the array type), not T (the single item type).
   */
  function replaceItemInArray(updatedItem: Y) {
    const index = items.value.findIndex((item) => item.id === updatedItem.id)
    if (index !== -1) {
      // Replace with a new object reference
      items.value[index] = { ...updatedItem }
    }
  }

  return {
    loadingItems,
    loadingItem,
    items,
    item,
    getItems,
    getItem,
    fetchItem,
    createItem,
    updateItem,
    updateItems,
    deleteItem,
    WSCreatedItemsHandler,
    WSUpdatedItemHandler,
    WSUpdatedItemsHandler,
    WSDeletedItemsHandler,
    replaceItemInArray,
  }
}
