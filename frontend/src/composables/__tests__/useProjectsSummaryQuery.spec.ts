import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { defineComponent } from 'vue'
vi.mock('@/api/axios', () => ({
  axiosApi: {
    get: vi.fn(),
  },
}))

import { useProjectsSummaryQuery } from '../useProjectsSummaryQuery'
import { axiosApi } from '@/api/axios'

const TestHost = defineComponent({
  setup() {
    useProjectsSummaryQuery('main')
    return {}
  },
  template: '<div />',
})

describe('useProjectsSummaryQuery', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  beforeEach(() => {
    queryClient.clear()
    vi.mocked(axiosApi.get).mockReset()
  })

  it('fetches fleet summary with scope=main', async () => {
    vi.mocked(axiosApi.get).mockResolvedValue({
      data: {
        projects: [
          {
            id: 1,
            name: 'Alpha',
            prefix: 'ALP',
            formalityLevel: 'LIGHTWEIGHT',
            totalTasks: 10,
            mainBoardTasks: 7,
            columns: [],
          },
        ],
      },
    })

    const wrapper = mount(TestHost, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
      },
    })

    await flushPromises()
    await vi.waitFor(
      () => {
        expect(axiosApi.get).toHaveBeenCalledWith('/projects/summary', { params: { scope: 'main' } })
      },
      { timeout: 2000 },
    )
    expect(wrapper.exists()).toBe(true)
  })
})
