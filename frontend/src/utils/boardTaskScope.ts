import type { iColumn } from '@/types/columnTypes'
import type { iTask } from '@/types/taskTypes'

export type BoardTaskScopeParentId = number | null

function isReviewColumn(column: iColumn): boolean {
  const name = String((column as any).name || '').toLowerCase()
  const type = String((column as any).type || (column as any).roleType || '').toUpperCase()
  return name.includes('agent review') || type === 'AGENT_REVIEW'
}

function matchesScope(task: iTask, scopeParentId: BoardTaskScopeParentId, includeNestedReviewOnMain: boolean, column: iColumn): boolean {
  if (scopeParentId === null) {
    if (includeNestedReviewOnMain && isReviewColumn(column)) return true
    return ((task as any).parentId ?? null) === null
  }
  return ((task as any).parentId ?? null) === scopeParentId
}

export function applyBoardTaskScope(
  columns: iColumn[],
  scopeParentId: BoardTaskScopeParentId,
  options: { includeNestedReviewOnMain?: boolean } = {},
): iColumn[] {
  const includeNestedReviewOnMain = options.includeNestedReviewOnMain === true
  return (columns || []).map((column) => {
    const tasks = Array.isArray((column as any).tasks) ? ((column as any).tasks as iTask[]) : []
    const filteredTasks = tasks.filter((task) =>
      matchesScope(task, scopeParentId, includeNestedReviewOnMain, column),
    )
    return {
      ...(column as any),
      __scopeParentId: scopeParentId,
      tasks: filteredTasks,
    } as iColumn
  })
}
