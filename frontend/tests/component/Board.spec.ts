import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import Board from '@/components/dashboard/board/Board.vue'
import api from '@/api/v1/indexApi'
import i18n from '@/locale'

vi.mock('@/api/v1/indexApi', () => ({
  default: {
    getProjectBoard: vi.fn(),
  },
}))

// Board triggers backlogStore.fetchBacklogTasks which uses axiosApi
vi.mock('@/api/axios', () => ({
  axiosApi: {
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { id: '1' } })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

const mockBoardData = {
  id: 1,
  name: 'Test Project',
  columns: [
    {
      id: 1,
      name: 'To Do',
      order: 0,
      tasks: [{ id: 1, name: 'Task 1', identifier: 'P-1', projectColumnId: 1 }],
    },
  ],
  members: [],
}

describe('Board (smoke)', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    queryClient.clear()
    vi.mocked(api.getProjectBoard).mockReset()
  })

  it('renders without throwing', async () => {
    vi.mocked(api.getProjectBoard).mockResolvedValue(mockBoardData as any)

    const wrapper = mount(Board, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }], i18n],
      },
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('calls getProjectBoard with project id from route', async () => {
    vi.mocked(api.getProjectBoard).mockResolvedValue(mockBoardData as any)

    mount(Board, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }], i18n],
      },
    })

    await vi.waitFor(() => {
      expect(api.getProjectBoard).toHaveBeenCalledWith(1)
    })
  })
})
