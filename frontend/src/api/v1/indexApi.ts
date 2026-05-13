import { axiosApi } from '../axios'
import { isValidId } from '../../utils/validation'
import {
  ENABLE_IMPLICIT_LIST_LIMIT,
  REWRITE_MAX_LIST_PAGE_SIZE,
  unwrapListItems,
} from '../../utils/paginatedListResponse'
import { devLog, devWarn, logError } from '../../utils/logger'
import authApi from './authApi'
import projectApi from './projectApi'

/** Endpoints that use Kanban-rewrite pagination unless caller passes `limit` / `page`. */
const PAGINATED_GET_ITEMS_ENDPOINTS = new Set(['tasks', 'columns', 'projects'])
const BULK_PATCH_ENDPOINTS = new Set(['columns'])
const LONG_RUNNING_ENDPOINTS = new Set(['tasks', 'columns', 'projects'])
const DEFAULT_TIMEOUT_MS = 15000
const LONG_RUNNING_TIMEOUT_MS = 25000

function timeoutForEndpoint(endpoint: string): number {
  return LONG_RUNNING_ENDPOINTS.has(endpoint) ? LONG_RUNNING_TIMEOUT_MS : DEFAULT_TIMEOUT_MS
}

function isUnauthorizedError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  return status === 401
}

const getItems = async <T = unknown>(endpoint: string, params: any): Promise<T[]> => {
  devLog(`[API] getItems called for endpoint: ${endpoint}`, { params })
  if (params?.projectId != null && !isValidId(params.projectId)) {
    const error = new Error('Invalid projectId in getItems params')
    logError(`[API] getItems validation failed: ${error.message}`)
    return Promise.reject(error)
  }
  try {
    const shouldApplyDefaultLimit =
      ENABLE_IMPLICIT_LIST_LIMIT &&
      PAGINATED_GET_ITEMS_ENDPOINTS.has(endpoint) &&
      params?.limit === undefined
    const requestParams =
      shouldApplyDefaultLimit
        ? { ...params, limit: REWRITE_MAX_LIST_PAGE_SIZE }
        : { ...params }
    const response = await axiosApi.get(`/${endpoint}`, {
      params: requestParams,
      timeout: timeoutForEndpoint(endpoint),
    })
    devLog(`[API] getItems success for endpoint: ${endpoint}`, { data: response.data })
    const { items, pagination } = unwrapListItems(response.data)
    if (import.meta.env?.DEV && pagination?.hasNext) {
      devWarn(
        `[API] getItems ${endpoint}: more pages available (total=${pagination.total}). Consider paging or raising limit.`,
      )
    }
    return items as T[]
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      logError(`[API] getItems failed for endpoint: ${endpoint}`, { error })
    }
    throw error
  }
}

const getItem = async (endpoint: string, id: number, params: any) => {
  devLog(`[API] getItem called for endpoint: ${endpoint}/${id}`, { params })
  
  if (!isValidId(id)) {
    const error = new Error('Invalid ID parameter')
    logError(`[API] getItem validation failed: ${error.message}`)
    return Promise.reject(error)
  }
  
  try {
    const response = await axiosApi.get(`/${endpoint}/${Number(id)}`, {
      params,
      timeout: timeoutForEndpoint(endpoint),
    })
    devLog(`[API] getItem success for endpoint: ${endpoint}/${id}`, { data: response.data })
    return response.data
  } catch (error) {
    logError(`[API] getItem failed for endpoint: ${endpoint}/${id}`, { error })
    throw error
  }
}

const createItem = async (endpoint: string, params: any) => {
  devLog(`[API] createItem called for endpoint: ${endpoint}`, { params })
  
  try {
    const response = await axiosApi.post(`/${endpoint}`, params, {
      timeout: timeoutForEndpoint(endpoint),
    })
    devLog(`[API] createItem success for endpoint: ${endpoint}`, { data: response.data })
    return response.data
  } catch (error) {
    logError(`[API] createItem failed for endpoint: ${endpoint}`, { error })
    throw error
  }
}

const updateItem = async (endpoint: string, id: number, params: any) => {
  devLog(`[API] updateItem called for endpoint: ${endpoint}/${id}`, { params })
  
  if (!isValidId(id)) {
    const error = new Error('Invalid ID parameter')
    logError(`[API] updateItem validation failed: ${error.message}`)
    return Promise.reject(error)
  }
  
  const { projectId, ...data } = params
  
  try {
    const response = await axiosApi.patch(`/${endpoint}/${Number(id)}`, data, {
      params: { projectId },
      timeout: timeoutForEndpoint(endpoint),
    })
    devLog(`[API] updateItem success for endpoint: ${endpoint}/${id}`, { data: response.data })
    return response.data
  } catch (error) {
    logError(`[API] updateItem failed for endpoint: ${endpoint}/${id}`, { error })
    throw error
  }
}

const updateItems = async (endpoint: string, params: any) => {
  devLog(`[API] updateItems called for endpoint: ${endpoint}`, { params })
  if (!BULK_PATCH_ENDPOINTS.has(endpoint)) {
    const error = new Error(`Bulk update is not supported for endpoint: ${endpoint}`)
    logError(`[API] updateItems validation failed: ${error.message}`)
    return Promise.reject(error)
  }
  if (params?.projectId != null && !isValidId(params.projectId)) {
    const error = new Error('Invalid projectId in updateItems params')
    logError(`[API] updateItems validation failed: ${error.message}`)
    return Promise.reject(error)
  }
  try {
    const response = await axiosApi.patch(`/${endpoint}`, params, {
      timeout: timeoutForEndpoint(endpoint),
    })
    devLog(`[API] updateItems success for endpoint: ${endpoint}`, { data: response.data })
    return response.data
  } catch (error) {
    logError(`[API] updateItems failed for endpoint: ${endpoint}`, { error })
    throw error
  }
}

const deleteItem = async (endpoint: string, id: number) => {
  devLog(`[API] deleteItem called for endpoint: ${endpoint}/${id}`)
  
  if (!isValidId(id)) {
    const error = new Error('Invalid ID parameter')
    logError(`[API] deleteItem validation failed: ${error.message}`)
    return Promise.reject(error)
  }
  
  try {
    const response = await axiosApi.delete(`/${endpoint}/${Number(id)}`, {
      timeout: timeoutForEndpoint(endpoint),
    })
    devLog(`[API] deleteItem success for endpoint: ${endpoint}/${id}`, { data: response.data })
    return response.data
  } catch (error) {
    logError(`[API] deleteItem failed for endpoint: ${endpoint}/${id}`, { error })
    throw error
  }
}

export default {
  ...authApi,
  ...projectApi,
  getItems,
  getItem,
  createItem,
  updateItem,
  updateItems,
  deleteItem,
}
