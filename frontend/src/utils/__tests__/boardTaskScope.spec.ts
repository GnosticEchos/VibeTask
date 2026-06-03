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
        color: '#ffa500',
        order: 1,
        type: null,
        description: '',
        tasks: [
          { id: 10, parentId: 99, name: 'Nested review' } as iTask,
        ],
      },
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
        type: null,
        description: '',
        tasks: [
          { id: 126, parentId: 123, name: 'Existing', identifier: 'SPEC-21', order: 1 } as iTask,
        ],
      },
    ]

    const merged = mergeWorkspaceChildrenIntoBoard(columns, 123, [
      { id: 126, parentId: 123, name: 'Existing', identifier: 'SPEC-21', order: 1, projectColumnId: 50 },
      { id: 217, parentId: 123, name: 'Orphan', identifier: 'SPEC-80', order: 79, projectColumnId: null },
    ])

    expect(merged[0].tasks).toHaveLength(2)
    expect(merged[0].tasks?.map((t) => t.id)).toEqual([126, 217])
  })

  it('includeAllAssignedTasks keeps workspace children on main board columns', () => {
    const columns: iColumn[] = [
      {
        id: 50,
        name: 'Discovery',
        order: 1,
        color: '#ccc',
        type: null,
        description: '',
        tasks: [
          { id: 1, parentId: null, name: 'Main' } as iTask,
          { id: 2, parentId: 123, name: 'In workspace' } as iTask,
        ],
      },
    ]

    const mainOnly = applyBoardTaskScope(columns, null, { includeNestedReviewOnMain: true })
    expect(mainOnly[0].tasks).toHaveLength(1)

    const all = applyBoardTaskScope(columns, null, { includeAllAssignedTasks: true })
    expect(all[0].tasks).toHaveLength(2)
  })
})
