import { iProject, iSimplifiedProject, CreateProjectPayload } from '../../types/projectTypes'
import type { ProjectSettings } from '../../types/documentTypes'
import { isValidId } from '../../utils/validation'
import { axiosApi } from '../axios'

const getSingleProject = async (id: number) => {
  if (!isValidId(id)) {
    return Promise.reject(new Error('Invalid project ID'))
  }

  const response = await axiosApi.get<iProject>(`/projects/${Number(id)}`)
  return response.data
}

const updateProject = async (
  id: number,
  payload: Partial<iSimplifiedProject>,
) => {
  if (!isValidId(id)) {
    return Promise.reject(new Error('Invalid project ID'))
  }

  const response = await axiosApi.patch<iProject>(`/projects/${Number(id)}`, payload)
  return response.data
}

const createProject = async (payload: CreateProjectPayload) => {
  const response = await axiosApi.post('/projects', payload)
  return response.data
}

const getProjectBoard = async (id: number, params?: { view?: string; parentId?: number }) => {
  if (!isValidId(id)) {
    return Promise.reject(new Error('Invalid project ID'))
  }
  const response = await axiosApi.get(`/projects/${Number(id)}/board`, {
    params,
  })
  return response.data
}

const deleteProject = async (id: number) => {
  if (!isValidId(id)) {
    return Promise.reject(new Error('Invalid project ID'))
  }
  await axiosApi.delete(`/projects/${Number(id)}`)
}

const getActiveWorkspaces = async (id: number) => {
  if (!isValidId(id)) {
    return Promise.reject(new Error('Invalid project ID'))
  }
  const response = await axiosApi.get(`/projects/${Number(id)}/active-workspaces`)
  return response.data
}

const getProjectDelegates = async (id: number) => {
  if (!isValidId(id)) {
    return Promise.reject(new Error('Invalid project ID'))
  }
  const response = await axiosApi.get(`/projects/${Number(id)}/delegates`)
  return response.data
}

const getProjectTemplates = async () => {
  const response = await axiosApi.get('/projects/templates')
  return response.data
}

const patchProjectSettings = async (id: number, settings: ProjectSettings) => {
  if (!isValidId(id)) {
    return Promise.reject(new Error('Invalid project ID'))
  }
  const response = await axiosApi.patch<{ settings: ProjectSettings }>(`/projects/${Number(id)}/settings`, settings)
  return response.data.settings
}

export default {
  updateProject,
  getSingleProject,
  createProject,
  getProjectBoard,
  deleteProject,
  getActiveWorkspaces,
  getProjectDelegates,
  getProjectTemplates,
  patchProjectSettings,
}
