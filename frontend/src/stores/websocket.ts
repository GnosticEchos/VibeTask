import { useWebSocket } from '../composables/useWebsockets.js'
import { useColumnsStore } from './columns'
import { useMembersStore } from './members'
import { useTasksStore } from './tasks'
import { iColumn } from '../types/columnTypes'
import { iTask } from '../types/taskTypes'
import { iUser } from '../types/userTypes'
import { iProjectDataWSPayload } from '../types/websocketTypes'
import type { WebsocketInboundMessage } from '../types/websocketTypes'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invalidateProjectsQuery } from '@/queryClient'
import { applyDeleteTaskFromColumns, applyUpsertTaskToColumns } from '@/utils/websocketTaskProjectColumns'
import { wsLog } from '@/utils/logger'

import { useProjectStore } from './project'
const WS_DEBUG = import.meta.env.VITE_WS_DEBUG === 'true'

type FunctionDictionary = {
  [key: string]: {
    [key: string]: (data: any) => void
  }
}

function upsertTaskInProjectColumns(projectStore: ReturnType<typeof useProjectStore>, task: iTask) {
  const columns = Array.isArray(projectStore.project.columns) ? (projectStore.project.columns as iColumn[]) : []
  if (!columns.length) return
  projectStore.project.columns = applyUpsertTaskToColumns(columns, task)
}

function deleteTaskFromProjectColumns(projectStore: ReturnType<typeof useProjectStore>, taskId: number) {
  const columns = Array.isArray(projectStore.project.columns) ? (projectStore.project.columns as iColumn[]) : []
  if (!columns.length) return
  projectStore.project.columns = applyDeleteTaskFromColumns(columns, taskId)
}

export function dispatchWebsocketMessage(
  functionDictionary: FunctionDictionary,
  payload: WebsocketInboundMessage,
): boolean {
  const { identifier, message } = payload || {}
  const channel = identifier?.channel
  const actionType = message?.actionType
  if (!channel || !actionType) return false
  const actionMap = functionDictionary[channel]
  if (!actionMap) return false
  const selectedFunction = actionMap[actionType]
  if (typeof selectedFunction !== 'function') return false
  if (WS_DEBUG) {
    wsLog.debug('dispatch', {
      channel,
      actionType,
      itemType: message?.itemType,
    })
  }
  selectedFunction(message?.data)
  return true
}

export const useWebsocketStore = defineStore('websocket', () => {
  const storesList = {
    tasks: useTasksStore(),
    columns: useColumnsStore(),
    members: useMembersStore(),
    project: useProjectStore(),
  }
  const projectStore = useProjectStore();

  const functionDictionary: FunctionDictionary = {
    TasksIndexChannel: {
      create: (data: iTask) => {
        const projectId = typeof projectStore.selectedProjectId === 'number' ? projectStore.selectedProjectId : 0;
        const task = { ...(data as any), projectId } as iTask
        storesList.tasks.WSCreatedItemsHandler(task as any);
        upsertTaskInProjectColumns(projectStore, task)
      },
      update: (data: iTask) => {
        const projectId = typeof projectStore.selectedProjectId === 'number' ? projectStore.selectedProjectId : 0;
        const task = { ...(data as any), projectId } as iTask
        storesList.tasks.WSUpdatedItemsHandler(task as any);
        upsertTaskInProjectColumns(projectStore, task)
      },
      delete: (data: iTask) => {
        const projectId = typeof projectStore.selectedProjectId === 'number' ? projectStore.selectedProjectId : 0;
        const task = { ...(data as any), projectId } as iTask
        storesList.tasks.WSDeletedItemsHandler(task as any);
        if (typeof task.id === 'number') {
          deleteTaskFromProjectColumns(projectStore, task.id)
        }
      },
    },
    TaskIndexChannel: {
      update: (data: iTask) => {
        const projectId = typeof projectStore.selectedProjectId === 'number' ? projectStore.selectedProjectId : 0;
        storesList.tasks.WSUpdatedItemHandler({ ...(data as any), projectId } as any);
      },
    },
    ColumnsIndexChannel: {
      create: (data: iColumn) => {
        storesList.columns.WSCreatedItemsHandler(data)
      },
      update: (data: iColumn) => {
        storesList.columns.WSUpdatedItemsHandler(data)
      },
      delete: (data: iColumn) => {
        storesList.columns.WSDeletedItemsHandler(data)
      },
    },
    MembersIndexChannel: {
      create: (data: iUser) => {
        storesList.members.WSCreatedItemsHandler({ ...data, userId: data.id })
      },
      update: (data: iUser) => {
        storesList.members.WSUpdatedItemsHandler({ ...data, userId: data.id })
      },
      delete: (data: iUser) => {
        storesList.members.WSDeletedItemsHandler({ ...data, userId: data.id })
      },
    },
    MemberIndexChannel: {
      update: (data: iUser) => {
        storesList.members.WSUpdatedItemHandler({ ...data, userId: data.id })
      },
    },
    ProjectIndexChannel: {
      update: (data: iProjectDataWSPayload) => {
        storesList.project.WSUpdatedProjectHandler(data)
      },
    },
    UserProjectsIndexChannel: {
      create: () => {
        invalidateProjectsQuery()
      },
      update: () => {
        invalidateProjectsQuery()
      },
      delete: () => {
        invalidateProjectsQuery()
      },
    },
  }

  const websocket = useWebSocket()
  const socket = ref<any>(null)

  const connectWS = () => {
    socket.value = websocket.connect()
  }

  const disconnectWS = () => {
    websocket.disconnect()
    socket.value = null
  }

  const joinChannel = (channel: string, params: any) => {
    websocket.joinChannel(channel, params)
  }

  const leaveChannel = (channel: string) => {
    websocket.leaveChannel(channel)
  }

  const handleMessage = (payload: WebsocketInboundMessage) => {
    try {
      const handled = dispatchWebsocketMessage(functionDictionary, payload)
      if (!handled) {
        wsLog.warn('ignored message (unmapped/invalid)', payload)
      }
    } catch (error) {
      wsLog.error('handleMessage error', { error, payload })
    }
  }

  return {
    socket,
    connectWS,
    disconnectWS,
    joinChannel,
    leaveChannel,
    handleMessage,
    storesList,
  }
})
