import { describe, expect, it } from 'vitest'
import {
  TASK_STATUS_ARCHIVE,
  TASK_STATUS_BACKLOG,
  patchPayloadForTaskStatus,
  taskStatusFromTask,
} from '@/utils/taskStatusAssignment'

describe('taskStatusAssignment', () => {
  it('maps task fields to backlog, column, and archive status', () => {
    expect(taskStatusFromTask({ projectColumnId: null })).toBe(TASK_STATUS_BACKLOG)
    expect(taskStatusFromTask({ projectColumnId: 5 })).toBe(5)
    expect(taskStatusFromTask({ projectColumnId: 5, archivedAt: '2026-01-01T00:00:00.000Z' })).toBe(
      TASK_STATUS_ARCHIVE,
    )
  })

  it('builds PATCH payloads for backlog, column, and archive', () => {
    expect(patchPayloadForTaskStatus(TASK_STATUS_BACKLOG)).toEqual({
      projectColumnId: 0,
      archived: false,
    })
    expect(patchPayloadForTaskStatus(3)).toEqual({ projectColumnId: 3, archived: false })
    expect(patchPayloadForTaskStatus(TASK_STATUS_ARCHIVE)).toEqual({ archived: true })
  })
})
