import { describe, expect, it } from 'vitest'
import { applyDeleteTaskFromColumns, applyUpsertTaskToColumns } from '@/utils/websocketTaskProjectColumns'

describe('websocket task/column sync helpers', () => {
  it('upserts into target column and keeps order', () => {
    const columns: any = [
      { id: 1, tasks: [{ id: 1, order: 2, projectColumnId: 1 }] },
      { id: 2, tasks: [{ id: 2, order: 3, projectColumnId: 2 }] },
    ]
    const updatedTask = { id: 3, order: 1, projectColumnId: 1 } as any
    const next = applyUpsertTaskToColumns(columns, updatedTask)
    expect(next[0].tasks.map((t: any) => t.id)).toEqual([3, 1])
  })

  it('moves task across columns (removes stale copy)', () => {
    const columns: any = [
      { id: 1, tasks: [{ id: 9, order: 1, projectColumnId: 1 }] },
      { id: 2, tasks: [] },
    ]
    const moved = { id: 9, order: 4, projectColumnId: 2 } as any
    const next = applyUpsertTaskToColumns(columns, moved)
    expect(next[0].tasks.find((t: any) => t.id === 9)).toBeUndefined()
    expect(next[1].tasks.find((t: any) => t.id === 9)).toBeTruthy()
  })

  it('deletes task from all columns', () => {
    const columns: any = [
      { id: 1, tasks: [{ id: 5 }, { id: 7 }] },
      { id: 2, tasks: [{ id: 5 }] },
    ]
    const next = applyDeleteTaskFromColumns(columns, 5)
    expect(next[0].tasks.map((t: any) => t.id)).toEqual([7])
    expect(next[1].tasks).toEqual([])
  })

  it('ignores stale update when existing updatedAt is newer', () => {
    const columns: any = [
      { id: 1, tasks: [{ id: 5, order: 1, projectColumnId: 1, updatedAt: '2026-03-26T14:00:00.000Z', description: 'newer' }] },
      { id: 2, tasks: [] },
    ]
    const stale = {
      id: 5,
      order: 0,
      projectColumnId: 2,
      updatedAt: '2026-03-26T13:00:00.000Z',
      description: 'older',
    } as any
    const next = applyUpsertTaskToColumns(columns, stale)
    expect(next[0].tasks[0].projectColumnId).toBe(1)
    expect(next[0].tasks[0].description).toBe('newer')
  })

  it('moves top-level task even when review column contains child tasks', () => {
    const columns: any = [
      { id: 1, tasks: [{ id: 20, order: 1, projectColumnId: 1, parentId: null }] },
      { id: 2, tasks: [] },
      { id: 3, name: 'Agent Review', tasks: [{ id: 99, order: 1, projectColumnId: 3, parentId: 77 }] },
    ]
    const moved = { id: 20, order: 0, projectColumnId: 2, parentId: null } as any
    const next = applyUpsertTaskToColumns(columns, moved)
    expect(next[1].tasks.find((t: any) => t.id === 20)).toBeTruthy()
  })

  it('accepts string projectColumnId from websocket payload', () => {
    const columns: any = [
      { id: 1, tasks: [{ id: 30, order: 1, projectColumnId: 1 }] },
      { id: 2, tasks: [] },
    ]
    const moved = { id: 30, order: 0, projectColumnId: '2' } as any
    const next = applyUpsertTaskToColumns(columns, moved)
    expect(next[1].tasks.find((t: any) => t.id === 30)).toBeTruthy()
  })
})

