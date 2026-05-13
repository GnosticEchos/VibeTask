import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { useDocumentsQuery, useDocumentQuery, useDocumentMutations } from '../useDocumentMutations'
import { documentsApi } from '../../api/v1/documentsApi'

vi.mock('../../api/v1/documentsApi', () => ({
  documentsApi: {
    getDocuments: vi.fn(),
    getDocument: vi.fn(),
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
}))

describe('useDocumentsQuery', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    queryClient.clear()
    vi.mocked(documentsApi.getDocuments).mockReset()
  })

  it('does not fetch when projectId is 0', async () => {
    const Host = defineComponent({
      setup() {
        const query = useDocumentsQuery(0)
        return { query }
      },
      template: '<div></div>',
    })

    mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(documentsApi.getDocuments).not.toHaveBeenCalled()
  })

  it('fetches documents when projectId is valid', async () => {
    const mockDocs = { data: [{ id: 1, title: 'Doc 1' }] }
    vi.mocked(documentsApi.getDocuments).mockResolvedValue(mockDocs)

    const Host = defineComponent({
      setup() {
        const query = useDocumentsQuery(1)
        return { query }
      },
      template: '<div>{{ query.isLoading ? "loading" : "loaded" }}</div>',
    })

    mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    await flushPromises()
    await vi.waitFor(() => {
      expect(documentsApi.getDocuments).toHaveBeenCalledWith(1, { limit: 100 })
    })
  })

  it('passes type filter to API', async () => {
    const mockDocs = { data: [] }
    vi.mocked(documentsApi.getDocuments).mockResolvedValue(mockDocs)

    const Host = defineComponent({
      setup() {
        const query = useDocumentsQuery(1, { type: 'SPECIFICATION' })
        return { query }
      },
      template: '<div></div>',
    })

    mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    await flushPromises()
    expect(documentsApi.getDocuments).toHaveBeenCalledWith(1, { limit: 100, type: 'SPECIFICATION' })
  })
})

describe('useDocumentQuery', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    queryClient.clear()
    vi.mocked(documentsApi.getDocument).mockReset()
  })

  it('does not fetch when projectId or docId is missing', async () => {
    const Host = defineComponent({
      setup() {
        const query = useDocumentQuery(0, 1)
        return { query }
      },
      template: '<div></div>',
    })

    mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(documentsApi.getDocument).not.toHaveBeenCalled()
  })

  it('fetches single document when ids are valid', async () => {
    const mockDoc = { id: 1, projectId: 1, title: 'Doc 1', content: 'Content', docType: 'SPECIFICATION' as const, version: 1, createdById: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' }
    vi.mocked(documentsApi.getDocument).mockResolvedValue(mockDoc)

    const Host = defineComponent({
      setup() {
        const query = useDocumentQuery(1, 1)
        return { query }
      },
      template: '<div></div>',
    })

    mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    await flushPromises()
    await vi.waitFor(() => {
      expect(documentsApi.getDocument).toHaveBeenCalledWith(1, 1)
    })
  })
})

describe('useDocumentMutations', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    queryClient.clear()
    vi.mocked(documentsApi.createDocument).mockReset()
    vi.mocked(documentsApi.updateDocument).mockReset()
    vi.mocked(documentsApi.deleteDocument).mockReset()
  })

  it('creates document and invalidates list', async () => {
    const mockDoc = { id: 1, projectId: 1, title: 'New Doc', content: 'Content', docType: 'SPECIFICATION' as const, version: 1, createdById: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' }
    vi.mocked(documentsApi.createDocument).mockResolvedValue(mockDoc)

    const Host = defineComponent({
      setup() {
        const { createDocument } = useDocumentMutations(1)
        return { createDocument }
      },
      template: '<div></div>',
    })

    const wrapper = mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    const payload = { title: 'New Doc', content: 'Content', docType: 'SPECIFICATION' as const }
    await wrapper.vm.createDocument(payload)

    expect(documentsApi.createDocument).toHaveBeenCalledWith(1, payload)
  })

  it('updates document and invalidates queries', async () => {
    const mockDoc = { id: 1, projectId: 1, title: 'Updated Doc', content: 'Content', docType: 'SPECIFICATION' as const, version: 2, createdById: 1, createdAt: '2024-01-01', updatedAt: '2024-01-02' }
    vi.mocked(documentsApi.updateDocument).mockResolvedValue(mockDoc)

    const Host = defineComponent({
      setup() {
        const { updateDocument } = useDocumentMutations(1)
        return { updateDocument }
      },
      template: '<div></div>',
    })

    const wrapper = mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    await wrapper.vm.updateDocument({ docId: 1, payload: { title: 'Updated' } })

    expect(documentsApi.updateDocument).toHaveBeenCalledWith(1, 1, { title: 'Updated' })
  })

  it('deletes document and invalidates list', async () => {
    vi.mocked(documentsApi.deleteDocument).mockResolvedValue(undefined)

    const Host = defineComponent({
      setup() {
        const { deleteDocument } = useDocumentMutations(1)
        return { deleteDocument }
      },
      template: '<div></div>',
    })

    const wrapper = mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    await wrapper.vm.deleteDocument(1)

    expect(documentsApi.deleteDocument).toHaveBeenCalledWith(1, 1)
  })
})
