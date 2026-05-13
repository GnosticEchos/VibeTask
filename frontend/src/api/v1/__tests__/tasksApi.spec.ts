import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addTaskComment } from '../tasksApi'

vi.mock('@/api/axios', () => ({
  axiosApi: {
    patch: vi.fn(),
  },
}))

const { axiosApi } = await import('@/api/axios')

describe('tasksApi.addTaskComment', () => {
  beforeEach(() => {
    vi.mocked(axiosApi.patch).mockReset()
  })

  it('rejects when taskId is invalid', async () => {
    await expect(addTaskComment(0, 'hello')).rejects.toThrow('Invalid task ID')
    await expect(addTaskComment(NaN as number, 'hello')).rejects.toThrow('Invalid task ID')
    expect(axiosApi.patch).not.toHaveBeenCalled()
  })

  it('rejects when content is empty or whitespace', async () => {
    await expect(addTaskComment(1, '')).rejects.toThrow('Comment content is required')
    await expect(addTaskComment(1, '   ')).rejects.toThrow('Comment content is required')
    await expect(addTaskComment(1, null as any)).rejects.toThrow('Comment content is required')
    expect(axiosApi.patch).not.toHaveBeenCalled()
  })

  it('calls axios.patch with taskId and content when valid', async () => {
    vi.mocked(axiosApi.patch).mockResolvedValue({ data: {} })
    await addTaskComment(1, 'My comment')
    expect(axiosApi.patch).toHaveBeenCalledWith('/tasks/comment/1', { content: 'My comment' })
  })
})
