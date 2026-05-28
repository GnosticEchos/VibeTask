import { describe, it, expect } from 'vitest'
import { applyBoardTaskScope, mergeWorkspaceChildrenIntoBoard } from '../boardTaskScope'
import type { iColumn } from '@/types/columnTypes'
import type { iTask } from '@/types/taskTypes'

describe('applyBoardTaskScope', () => {
  it('includes workspace child tasks in Agent Review column on main board', () => {
    const columns: iColumn[] = [
      {
        id: 1,
        name: 'Agent Review',
        roleType: 'AGENT_REVIEW',
        color: '#ffa500',
        order: 1,
        tasks: [
          { id: 10, parentId: 99, name: 'Nested review' } as iTask,
        ],
      } as iColumn,
    ]

    const scoped = applyBoardTaskScope(columns, null, { includeNestedReviewOnMain: true })
    expect(scoped[0].tasks).toHaveLength(1)
  })

  it('merges workspace children missing from column payloads into the board', () => {
    const columns: iColumn[] = [
      {
        id: 50,
        name: 'Discovery',
        order: 1,
        color: '#ccc',
        tasks: [
          { id: 126, parentId: 123, name: 'Existing', identifier: 'SPEC-21', order: 1 } as iTask,
        ],
      } as iColumn,
    ]

    const merged = mergeWorkspaceChildrenIntoBoard(columns, 123, [
      { id: 126, parentId: 123, name: 'Existing', identifier: 'SPEC-21', order: 1, projectColumnId: 50 },
      { id: 217, parentId: 123, name: 'Orphan', identifier: 'SPEC-80', order: 79, projectColumnId: null },
    ])

    expect(merged[0].tasks).toHaveLength(2)
    expect(merged[0].tasks?.map((t) => t.id)).toEqual([126, 217])
  })
})
