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

/** Fields the board API enriches but TasksIndexChannel WS payloads omit. */
const BOARD_ENRICHED_KEYS = [
  'relatedTask',
  'isContainer',
  'planAccepted',
  'childCount',
  'parentId',
  'subBoardOutlineColor',
  'assignee',
] as const

/**
 * Merge a websocket task patch into the board column task.
 * WS updates replace the whole task object; without merging, relation badges and
 * sub-board flags flash then disappear when a board refetch is overwritten by WS.
 */
export function mergeBoardTaskFromWebsocket(existing: iTask | undefined, incoming: iTask): iTask {
  if (!existing) return incoming

  const merged = { ...existing, ...incoming } as iTask

  for (const key of BOARD_ENRICHED_KEYS) {
    const incomingRecord = incoming as unknown as Record<string, unknown>
    const existingRecord = existing as unknown as Record<string, unknown>
    const mergedRecord = merged as unknown as Record<string, unknown>
    if (incomingRecord[key] === undefined && existingRecord[key] !== undefined) {
      mergedRecord[key] = existingRecord[key]
    }
  }

  if (incoming.relationMode === undefined && existing.relationMode != null) {
    merged.relationMode = existing.relationMode
  }
  if (incoming.relationId === undefined && existing.relationId != null) {
    merged.relationId = existing.relationId
  }

  if ((incoming as iTask).relatedTask === undefined && existing.relatedTask) {
    const incomingRelId = incoming.relationId !== undefined ? incoming.relationId : existing.relationId
    if (incomingRelId != null && existing.relationId === incomingRelId) {
      merged.relatedTask = existing.relatedTask
    } else if (incoming.relationId !== undefined && incoming.relationId !== existing.relationId) {
      merged.relatedTask = null
    }
  }

  return merged
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
      targetTasks.push(mergeBoardTaskFromWebsocket(existingTask, task))
      targetTasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      ;(target as any).tasks = targetTasks
    }
  }

  return cloneColumns(cloned)
}

export function applyRelationFieldsToProjectColumns(
  columns: iColumn[],
  taskId: number,
  fields: {
    relationMode: string | null
    relationId: number | null
    relatedTask?: iTask['relatedTask']
  },
): iColumn[] {
  const cloned = cloneColumns(columns)
  for (const col of cloned) {
    const colTasks = Array.isArray((col as any).tasks) ? ((col as any).tasks as iTask[]) : []
    const idx = colTasks.findIndex((t) => t.id === taskId)
    if (idx === -1) continue
    colTasks[idx] = {
      ...colTasks[idx],
      relationMode: fields.relationMode,
      relationId: fields.relationId,
      relatedTask: fields.relatedTask ?? null,
    }
    ;(col as any).tasks = colTasks
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

