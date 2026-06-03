import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBacklogStore } from '../backlog'
import { REWRITE_MAX_LIST_PAGE_SIZE } from '@/utils/paginatedListResponse'

vi.mock('@/api/axios', () => ({
  axiosApi: {
    get: vi.fn(),
  },
}))

const { axiosApi } = await import('@/api/axios')

describe('BacklogStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(axiosApi.get).mockReset()
  })

  it('initial state: items empty, isLoading false', () => {
    const store = useBacklogStore()
    expect(store.items).toEqual([])
    expect(store.isLoading).toBe(false)
  })

  it('fetchBacklogTasks sets items from API and filters unassigned', async () => {
    const store = useBacklogStore()
    const unassigned = [
      { id: 1, name: 'Task A', projectColumnId: null },
      { id: 2, name: 'Task B', projectColumnId: null },
    ]
    const withAssigned = [
      ...unassigned,
      { id: 3, name: 'Task C', projectColumnId: 5 },
    ]
    vi.mocked(axiosApi.get).mockResolvedValue({ data: withAssigned })

    await store.fetchBacklogTasks(1)

    expect(axiosApi.get).toHaveBeenCalledWith('/tasks', {
      params: {
        projectId: 1,
        noColumn: 'true',
        archived: 'false',
        limit: REWRITE_MAX_LIST_PAGE_SIZE,
      },
    })
    expect(store.items).toHaveLength(2)
    expect(store.items.map((t: { id: number }) => t.id)).toEqual([1, 2])
    expect(store.isLoading).toBe(false)
  })

  it('fetchBacklogTasks unwraps paginated API body', async () => {
    const store = useBacklogStore()
    const unassigned = { id: 1, name: 'Task A', projectColumnId: null }
    vi.mocked(axiosApi.get).mockResolvedValue({
      data: {
        data: [unassigned, { id: 2, name: 'Task B', projectColumnId: 5 }],
        pagination: { page: 1, limit: 100, total: 2, hasNext: false },
      },
    })

    await store.fetchBacklogTasks(1)

    expect(store.items).toHaveLength(1)
    expect(store.items[0].id).toBe(1)
  })

  it('fetchBacklogTasks on error sets items to []', async () => {
    const store = useBacklogStore()
    vi.mocked(axiosApi.get).mockRejectedValue(new Error('Network error'))

    await store.fetchBacklogTasks(1)

    expect(store.items).toEqual([])
    expect(store.isLoading).toBe(false)
  })

  it('removeTask removes item by id', () => {
    const store = useBacklogStore()
    store.items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ] as any

    store.removeTask(1)

    expect(store.items).toHaveLength(1)
    expect(store.items[0].id).toBe(2)
  })

  it('addTask pushes only when projectColumnId is null', () => {
    const store = useBacklogStore()
    store.items = [] as any

    store.addTask({ id: 1, projectColumnId: null, name: 'New' } as any)
    expect(store.items).toHaveLength(1)

    store.addTask({ id: 2, projectColumnId: 5, name: 'Assigned' } as any)
    expect(store.items).toHaveLength(1)
  })
})
