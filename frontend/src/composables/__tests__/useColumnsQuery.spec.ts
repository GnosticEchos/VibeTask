import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, ref } from 'vue'
import { useColumnsQuery } from '../useColumnsQuery'
import api from '../../api/v1/indexApi'

vi.mock('../../api/v1/indexApi', () => ({
  default: {
    getItems: vi.fn(),
  },
}))

const TestHost = defineComponent({
  setup() {
    const projectId = ref(1)
    const query = useColumnsQuery(projectId.value)
    return { query, projectId }
  },
  template: '<div>{{ query.isLoading ? "loading" : (query.data?.length ?? 0) }}</div>',
})

describe('useColumnsQuery', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    queryClient.clear()
    vi.mocked(api.getItems).mockReset()
  })

  it('does not fetch when projectId is invalid', async () => {
    const Host = defineComponent({
      setup() {
        const query = useColumnsQuery(0)
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
    expect(api.getItems).not.toHaveBeenCalled()
  })

  it('fetches columns when projectId is valid', async () => {
    const columns = [{ id: 1, name: 'To Do', order: 1 }]
    vi.mocked(api.getItems).mockResolvedValue(columns as any)

    mount(TestHost, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    await flushPromises()
    await vi.waitFor(
      () => {
        expect(api.getItems).toHaveBeenCalledWith('columns', { projectId: 1 })
      },
      { timeout: 2000 }
    )
  })
})
