import { describe, it, expect, vi, beforeEach } from 'vitest'
import { documentsApi } from '../documentsApi'

vi.mock('@/api/axios', () => ({
  axiosApi: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const { axiosApi } = await import('@/api/axios')

describe('documentsApi', () => {
  beforeEach(() => {
    vi.mocked(axiosApi.get).mockReset()
    vi.mocked(axiosApi.post).mockReset()
    vi.mocked(axiosApi.patch).mockReset()
    vi.mocked(axiosApi.delete).mockReset()
  })

  describe('getDocuments', () => {
    it('fetches documents list with projectId', async () => {
      const mockDocs = { data: [{ id: 1, title: 'Doc 1' }] }
      vi.mocked(axiosApi.get).mockResolvedValue({ data: mockDocs })

      const result = await documentsApi.getDocuments(1)

      expect(axiosApi.get).toHaveBeenCalledWith('/projects/1/docs', { params: undefined })
      expect(result).toEqual(mockDocs)
    })

    it('passes query params correctly', async () => {
      const mockDocs = { data: [] }
      vi.mocked(axiosApi.get).mockResolvedValue({ data: mockDocs })

      await documentsApi.getDocuments(1, { page: 1, limit: 10, type: 'SPECIFICATION' })

      expect(axiosApi.get).toHaveBeenCalledWith('/projects/1/docs', {
        params: { page: 1, limit: 10, type: 'SPECIFICATION' },
      })
    })
  })

  describe('createDocument', () => {
    it('creates document with payload', async () => {
      const payload = { title: 'New Doc', content: 'Content', docType: 'SPECIFICATION' as const }
      const mockDoc = { id: 1, ...payload }
      vi.mocked(axiosApi.post).mockResolvedValue({ data: mockDoc })

      const result = await documentsApi.createDocument(1, payload)

      expect(axiosApi.post).toHaveBeenCalledWith('/projects/1/docs', payload)
      expect(result).toEqual(mockDoc)
    })
  })

  describe('getDocument', () => {
    it('fetches single document', async () => {
      const mockDoc = { id: 1, title: 'Doc 1' }
      vi.mocked(axiosApi.get).mockResolvedValue({ data: mockDoc })

      const result = await documentsApi.getDocument(1, 1)

      expect(axiosApi.get).toHaveBeenCalledWith('/projects/1/docs/1')
      expect(result).toEqual(mockDoc)
    })
  })

  describe('updateDocument', () => {
    it('updates document with payload', async () => {
      const payload = { title: 'Updated Doc' }
      const mockDoc = { id: 1, title: 'Updated Doc' }
      vi.mocked(axiosApi.patch).mockResolvedValue({ data: mockDoc })

      const result = await documentsApi.updateDocument(1, 1, payload)

      expect(axiosApi.patch).toHaveBeenCalledWith('/projects/1/docs/1', payload)
      expect(result).toEqual(mockDoc)
    })
  })

  describe('deleteDocument', () => {
    it('deletes document', async () => {
      vi.mocked(axiosApi.delete).mockResolvedValue({})

      await documentsApi.deleteDocument(1, 1)

      expect(axiosApi.delete).toHaveBeenCalledWith('/projects/1/docs/1')
    })
  })

  describe('getLinkedTasks', () => {
    it('fetches linked tasks for document', async () => {
      const mockTasks = { data: [{ id: 1, name: 'Task 1' }] }
      vi.mocked(axiosApi.get).mockResolvedValue({ data: mockTasks })

      const result = await documentsApi.getLinkedTasks(1, 1)

      expect(axiosApi.get).toHaveBeenCalledWith('/projects/1/docs/1/linked-tasks')
      expect(result).toEqual(mockTasks)
    })
  })
})
