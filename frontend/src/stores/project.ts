import { iProject } from '../types/projectTypes'
import type { ProjectSettings } from '../types/documentTypes'
import type { iColumn } from '../types/columnTypes'
import type { iTask } from '../types/taskTypes'
import { mergeBoardTaskFromWebsocket } from '@/utils/websocketTaskProjectColumns'
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { storeLog } from '@/utils/logger'

function indexColumnTasksById(columns: iColumn[]): Map<number, iTask> {
  const byId = new Map<number, iTask>()
  for (const col of columns) {
    const tasks = Array.isArray(col.tasks) ? (col.tasks as iTask[]) : []
    for (const task of tasks) {
      if (typeof task?.id === 'number') byId.set(task.id, task)
    }
  }
  return byId
}

const defaultProjectState = (): iProject => ({
  id: 0,
  name: '',
  description: '',
  prefix: '',
  role: '',
  columns: [],
  members: [],
  tasks: [], // Only used for legacy compatibility; board tasks are now only in columns or Pinia tasks store
})

export const useProjectStore = defineStore('project', () => {
  const project = reactive<iProject>(defaultProjectState())
  const loading = ref<boolean>(true)
  const selectedProjectId = ref<number|null>(null)

  const setProject = (newProject: iProject | null) => {
    storeLog.debug('setProject called', { newProject })
    if (newProject) {
      // Log type and structure
      storeLog.debug('granular check', { type: typeof newProject, columnsIsArray: Array.isArray(newProject.columns) })
      if (!Array.isArray(newProject.columns)) {
        storeLog.warn('newProject.columns is not an array', { columns: newProject.columns })
        newProject.columns = []
      }
      const priorTasksById = indexColumnTasksById(
        Array.isArray(project.columns) ? (project.columns as iColumn[]) : [],
      )

      // Deep clone columns for robust reactivity
      project.columns = (newProject.columns || []).map((col, colIdx) => {
        if (typeof col !== 'object' || col === null) {
          storeLog.warn(`columns[${colIdx}] is not an object`, { col })
          // Return a default column structure
          return {
            id: -1,
            name: 'Invalid',
            color: '',
            order: -1,
            type: null,
            description: '',
            tasks: [],
            isNew: false
          }
        }
        const newCol = { ...col, tasks: Array.isArray(col.tasks) ? col.tasks.map((task, tIdx) => {
          if (typeof task !== 'object' || task === null) {
            storeLog.warn(`columns[${colIdx}].tasks[${tIdx}] is not an object`, { task })
            // Return a default task structure
            return {
              id: -1,
              name: 'Invalid',
              description: '',
              order: -1,
              createdBy: { id: -1, fullName: 'Invalid', avatarUrl: '' },
              assignee: { id: -1, fullName: 'Invalid', avatarUrl: '' },
              projectColumnId: -1,
              identifier: '',
              updating: false,
              relatedTask: null,
              comments: [],
              history: [],
              createdAt: ''
            }
          }
          const incoming = task as iTask
          const existing = priorTasksById.get(incoming.id)
          return existing ? mergeBoardTaskFromWebsocket(existing, incoming) : { ...incoming }
        }) : [] }
        return newCol
      })
      project.id = newProject.id
      project.name = newProject.name
      project.description = newProject.description
      project.prefix = newProject.prefix
      project.role = newProject.role
      project.members = [...(newProject.members || [])]
      if (newProject.settings !== undefined) {
        project.settings = { ...(newProject.settings as ProjectSettings) }
      }
      project.tasks = [] // Always initialize as empty; tasks are only in columns or Pinia tasks store
      // Log full structure after update
      storeLog.debug('project.columns after update', { columns: project.columns })
      storeLog.debug('project.tasks after update', { tasks: project.tasks })
      // Log references for debugging
      storeLog.debug('columns reference check', { isSame: project.columns === newProject.columns })
      storeLog.debug('members reference check', { isSame: project.members === newProject.members })
    } else {
      Object.assign(project, defaultProjectState())
    }
    storeLog.debug('project state AFTER update', { project })
  }

  const setLoading = (isLoading: boolean) => {
    storeLog.debug('setLoading called', { isLoading })
    loading.value = isLoading
  }

  const clearSelectedProject = () => {
    Object.assign(project, defaultProjectState())
  }

  const WSUpdatedProjectHandler = (data: any) => {
    if (!project.id) return

    const { name, description } = data
    if (name) project.name = name
    if (description) project.description = description
  }

  const setSelectedProjectId = (id: number|null) => {
    selectedProjectId.value = id
  }

  return {
    project,
    loading,
    setProject,
    setLoading,
    clearSelectedProject,
    WSUpdatedProjectHandler,
    selectedProjectId,
    setSelectedProjectId,
  }
})
