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

export type WorkspaceChildSummary = Pick<
  iTask,
  'id' | 'name' | 'identifier' | 'order' | 'isContainer' | 'planAccepted'
> & {
  parentId?: number | null
  projectColumnId?: number | null
}

/**
 * Board columns only include tasks with a column assignment. Workspace children that
 * have parentId set but no projectColumnId (or missing from the column payload) still
 * belong on the workspace board — merge them into the matching column, or the first
 * non–Agent Review column when unassigned.
 */
export function mergeWorkspaceChildrenIntoBoard(
  columns: iColumn[],
  workspaceParentId: number,
  children: WorkspaceChildSummary[],
): iColumn[] {
  if (!children?.length || !Number.isFinite(workspaceParentId)) return columns

  const merged = (columns || []).map((column) => ({
    ...(column as iColumn),
    tasks: Array.isArray((column as iColumn).tasks)
      ? [...((column as iColumn).tasks as iTask[])]
      : [],
  }))

  const onBoard = new Set<number>()
  for (const column of merged) {
    for (const task of column.tasks ?? []) {
      if ((task as { parentId?: number | null }).parentId === workspaceParentId) {
        onBoard.add(task.id)
      }
    }
  }

  const defaultColumn =
    merged.find((col) => !isReviewColumn(col)) ?? merged[0] ?? null

  for (const child of children) {
    const childParentId = child.parentId ?? workspaceParentId
    if (childParentId !== workspaceParentId) continue
    if (onBoard.has(child.id)) continue

    const target =
      (child.projectColumnId != null
        ? merged.find((col) => col.id === child.projectColumnId)
        : null) ?? defaultColumn
    if (!target) continue

    const stub = {
      id: child.id,
      name: child.name,
      identifier: child.identifier,
      order: child.order ?? 0,
      isContainer: child.isContainer ?? false,
      planAccepted: child.planAccepted ?? false,
      parentId: workspaceParentId,
      projectColumnId: child.projectColumnId ?? target.id,
    } as iTask

    target.tasks = [...(target.tasks ?? []), stub].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    )
    onBoard.add(child.id)
  }

  return merged
}
