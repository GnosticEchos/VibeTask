import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import api from '../indexApi'

vi.mock('@/api/axios', () => ({
  axiosApi: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))
vi.mock('@/utils/logger', () => ({
  devLog: vi.fn(),
  devWarn: vi.fn(),
  devDebug: vi.fn(),
  devInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}))

const { axiosApi } = await import('@/api/axios')

describe('indexApi', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(axiosApi.get).mockReset()
    vi.mocked(axiosApi.patch).mockReset()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('getItems', () => {
    it('rejects when params.projectId is invalid', async () => {
      await expect(api.getItems('columns', { projectId: NaN })).rejects.toThrow(
        'Invalid projectId in getItems params'
      )
      await expect(api.getItems('columns', { projectId: 0 })).rejects.toThrow(
        'Invalid projectId in getItems params'
      )
      await expect(api.getItems('tasks', { projectId: 'x' })).rejects.toThrow(
        'Invalid projectId in getItems params'
      )
      expect(axiosApi.get).not.toHaveBeenCalled()
    })

    it('calls axios.get when params.projectId is valid', async () => {
      vi.mocked(axiosApi.get).mockResolvedValue({ data: [] })
      await api.getItems('columns', { projectId: 1 })
      expect(axiosApi.get).toHaveBeenCalledWith('/columns', {
        params: { projectId: 1, limit: 100 },
        timeout: 25000,
      })
    })

    it('calls axios.get when params has no projectId', async () => {
      vi.mocked(axiosApi.get).mockResolvedValue({ data: [] })
      await api.getItems('projects', {})
      expect(axiosApi.get).toHaveBeenCalledWith('/projects', {
        params: { limit: 100 },
        timeout: 25000,
      })
    })

    it('returns items array from paginated { data, pagination } body', async () => {
      vi.mocked(axiosApi.get).mockResolvedValue({
        data: {
          data: [{ id: 1 }],
          pagination: { page: 1, limit: 20, total: 1, hasNext: false },
        },
      })
      const result = await api.getItems('tasks', { projectId: 1 })
      expect(result).toEqual([{ id: 1 }])
    })

    it('does not override caller-provided limit for paginated endpoints', async () => {
      vi.mocked(axiosApi.get).mockResolvedValue({ data: [] })
      await api.getItems('tasks', { projectId: 1, limit: 10 })
      expect(axiosApi.get).toHaveBeenCalledWith('/tasks', {
        params: { projectId: 1, limit: 10 },
        timeout: 25000,
      })
    })
  })

  describe('updateItems', () => {
    it('rejects when params.projectId is invalid', async () => {
      await expect(
        api.updateItems('columns', { projectId: NaN, columns: [] })
      ).rejects.toThrow('Invalid projectId in updateItems params')
      await expect(
        api.updateItems('columns', { projectId: 0, columns: [] })
      ).rejects.toThrow('Invalid projectId in updateItems params')
      expect(axiosApi.patch).not.toHaveBeenCalled()
    })

    it('calls axios.patch when params.projectId is valid', async () => {
      vi.mocked(axiosApi.patch).mockResolvedValue({ data: {} })
      await api.updateItems('columns', { projectId: 1, columns: [] })
      expect(axiosApi.patch).toHaveBeenCalledWith('/columns', { projectId: 1, columns: [] }, { timeout: 25000 })
    })
  })

  describe('getItem', () => {
    it('rejects when id is invalid', async () => {
      await expect(api.getItem('tasks', 0, {})).rejects.toThrow('Invalid ID parameter')
      await expect(api.getItem('tasks', NaN as number, {})).rejects.toThrow('Invalid ID parameter')
      expect(axiosApi.get).not.toHaveBeenCalled()
    })

    it('calls axios.get when id is valid', async () => {
      vi.mocked(axiosApi.get).mockResolvedValue({ data: { id: 1 } })
      await api.getItem('tasks', 1, { projectId: 1 })
      expect(axiosApi.get).toHaveBeenCalledWith('/tasks/1', {
        params: { projectId: 1 },
        timeout: 25000,
      })
    })
  })

  describe('updateItem', () => {
    it('rejects when id is invalid', async () => {
      await expect(api.updateItem('tasks', 0, { name: 'x' })).rejects.toThrow('Invalid ID parameter')
      expect(axiosApi.patch).not.toHaveBeenCalled()
    })

    it('calls axios.patch when id is valid', async () => {
      vi.mocked(axiosApi.patch).mockResolvedValue({ data: {} })
      await api.updateItem('tasks', 1, { projectId: 1, name: 'Updated' })
      expect(axiosApi.patch).toHaveBeenCalledWith('/tasks/1', { name: 'Updated' }, {
        params: { projectId: 1 },
        timeout: 25000,
      })
    })
  })
})
