import { iTask } from '../types/taskTypes'
import { defineStore } from 'pinia'

import { addTaskComment } from '../api/v1/tasksApi'
import { storeConstructor } from './storeConstructor'
import { storeLog } from '@/utils/logger'

export const useTasksStore = defineStore('tasks', () => {
  const store = storeConstructor<iTask, iTask>('tasks')

  async function addComment(taskId: number, content: string) {
    return addTaskComment(taskId, content)
  }

  function updateBacklogOrder(newOrder: iTask[]) {
    storeLog.debug('updateBacklogOrder called', { newOrder })
    store.items.value.splice(0, store.items.value.length, ...newOrder)
    storeLog.debug('updateBacklogOrder store updated')
  }

  storeLog.debug('Store Init')

  return {
    ...store,
    updateBacklogOrder,
    addComment,
  }
})
