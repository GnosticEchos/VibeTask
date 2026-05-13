import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, ref } from 'vue'
import { useProjectQuery } from '../useProjectQuery'
import projectsApi from '../../api/v1/projectApi'

// Mock the same module path the composable uses (relative from composables/)
vi.mock('../../api/v1/projectApi', () => ({
  default: {
    getSingleProject: vi.fn(),
  },
}))

const TestHost = defineComponent({
  setup() {
    const id = ref(1)
    const query = useProjectQuery(id.value)
    return { query, id }
  },
  template: '<div>{{ query.isLoading ? "loading" : query.data?.name || "none" }}</div>',
})

describe('useProjectQuery', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    queryClient.clear()
    vi.mocked(projectsApi.getSingleProject).mockReset()
  })

  it('does not fetch when id is invalid', async () => {
    const Host = defineComponent({
      setup() {
        const query = useProjectQuery(0)
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
    expect(projectsApi.getSingleProject).not.toHaveBeenCalled()
  })

  it('fetches project when id is valid (query enabled and API called)', async () => {
    const project = { id: 1, name: 'Test Project', columns: [] }
    vi.mocked(projectsApi.getSingleProject).mockResolvedValue(project as any)

    mount(TestHost, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })

    await flushPromises()
    await vi.waitFor(
      () => {
        expect(projectsApi.getSingleProject).toHaveBeenCalledWith(1)
      },
      { timeout: 2000 }
    )
  })
})
