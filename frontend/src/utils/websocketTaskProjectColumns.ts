import type { iColumn } from '@/types/columnTypes'
import type { iTask } from '@/types/taskTypes'

function cloneColumns(columns: iColumn[]): iColumn[] {
  return columns.map((col) => ({
    ...col,
    tasks: Array.isArray((col as any).tasks) ? [...((col as any).tasks as iTask[])] : [],
  }))
}

function toMillis(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function shouldApplyTaskUpdate(existingTask: iTask | undefined, incomingTask: iTask): boolean {
  if (!existingTask) return true
  const existingMs = toMillis((existingTask as any).updatedAt)
  const incomingMs = toMillis((incomingTask as any).updatedAt)
  if (existingMs == null || incomingMs == null) return true
  return incomingMs >= existingMs
}

function isReviewColumn(column: iColumn): boolean {
  const name = String((column as any).name || '').toLowerCase()
  const type = String((column as any).type || (column as any).roleType || '').toUpperCase()
  return name.includes('agent review') || type === 'AGENT_REVIEW'
}

function inferParentScope(columns: iColumn[]): number | null {
  for (const col of columns) {
    if ((col as any).__scopeParentId !== undefined) {
      return (col as any).__scopeParentId ?? null
    }
  }
  return null
}

export function applyUpsertTaskToColumns(columns: iColumn[], task: iTask): iColumn[] {
  const cloned = cloneColumns(columns)
  const existingTask = cloned
    .flatMap((col) => (Array.isArray((col as any).tasks) ? ((col as any).tasks as iTask[]) : []))
    .find((t) => t.id === task.id)

  if (!shouldApplyTaskUpdate(existingTask, task)) {
    return cloneColumns(cloned)
  }

  for (const col of cloned) {
    const colTasks = Array.isArray((col as any).tasks) ? ((col as any).tasks as iTask[]) : []
    ;(col as any).tasks = colTasks.filter((t) => t.id !== task.id)
  }

  const scopeParentId = inferParentScope(columns)

  if (task.projectColumnId !== null && task.projectColumnId !== undefined) {
    const targetColumnId = Number(task.projectColumnId)
    if (!Number.isFinite(targetColumnId)) {
      return cloneColumns(cloned)
    }
    const target = cloned.find((c) => c.id === targetColumnId)
    const shouldInsertByScope =
      !!target &&
      (scopeParentId === null
        ? (isReviewColumn(target) || ((task as any).parentId ?? null) === null)
        : ((task as any).parentId ?? null) === scopeParentId)
    if (target && shouldInsertByScope) {
      const targetTasks = Array.isArray((target as any).tasks) ? ((target as any).tasks as iTask[]) : []
      targetTasks.push(task)
      targetTasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      ;(target as any).tasks = targetTasks
    }
  }

  return cloneColumns(cloned)
}

export function applyDeleteTaskFromColumns(columns: iColumn[], taskId: number): iColumn[] {
  const cloned = cloneColumns(columns)
  for (const col of cloned) {
    const colTasks = Array.isArray((col as any).tasks) ? ((col as any).tasks as iTask[]) : []
    ;(col as any).tasks = colTasks.filter((t) => t.id !== taskId)
  }
  return cloneColumns(cloned)
}

