import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { defineComponent, ref } from 'vue'

vi.mock('@/api/axios', () => ({
  axiosApi: {
    get: vi.fn(),
  },
}))

import { useProjectDetailSummaryQuery } from '../useProjectDetailSummaryQuery'
import { axiosApi } from '@/api/axios'

const TestHost = defineComponent({
  setup() {
    const projectId = ref(10)
    useProjectDetailSummaryQuery(projectId, { kind: 'workspace', workspaceId: 123 })
    return {}
  },
  template: '<div />',
})

describe('useProjectDetailSummaryQuery', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  beforeEach(() => {
    queryClient.clear()
    vi.mocked(axiosApi.get).mockReset()
  })

  it('fetches project summary with workspace scope', async () => {
    vi.mocked(axiosApi.get).mockResolvedValue({
      data: {
        project: { id: 10, name: 'P', prefix: 'P', columns: [] },
        members: [],
      },
    })

    mount(TestHost, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    })

    await flushPromises()
    await vi.waitFor(() => {
      expect(axiosApi.get).toHaveBeenCalledWith('/projects/10/summary', {
        params: { scope: 'workspace:123' },
      })
    })
  })

  it('fetches project summary with scope=all', async () => {
    vi.mocked(axiosApi.get).mockResolvedValue({
      data: {
        project: { id: 10, name: 'P', prefix: 'P', columns: [] },
        members: [],
      },
    })

    const AllHost = defineComponent({
      setup() {
        useProjectDetailSummaryQuery(10, { kind: 'all' })
        return {}
      },
      template: '<div />',
    })

    mount(AllHost, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    })

    await flushPromises()
    await vi.waitFor(() => {
      expect(axiosApi.get).toHaveBeenCalledWith('/projects/10/summary', {
        params: { scope: 'all' },
      })
    })
  })
})
