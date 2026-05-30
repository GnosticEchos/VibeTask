/** Sentinel values for task status assignment (backlog / archive / column id). */
export const TASK_STATUS_BACKLOG = 'backlog' as const
export const TASK_STATUS_ARCHIVE = 'archive' as const

export type TaskStatusValue = typeof TASK_STATUS_BACKLOG | typeof TASK_STATUS_ARCHIVE | number

export type BoardColumnOption = { id: number; name: string }

export function isAgentReviewColumn(col: { name?: string; roleType?: string }): boolean {
  const name = String(col.name || '').toLowerCase()
  const type = String(col.roleType || '').toUpperCase()
  return name.includes('agent review') || type === 'AGENT_REVIEW'
}

export function boardColumnOptions(
  columns: Array<{ id: number; name: string; roleType?: string }> | undefined | null,
): BoardColumnOption[] {
  return (columns || [])
    .filter((col) => !isAgentReviewColumn(col))
    .map((col) => ({ id: col.id, name: col.name }))
}

export function taskStatusFromTask(task: {
  projectColumnId?: number | null
  archivedAt?: string | null
}): TaskStatusValue {
  if (task.archivedAt) return TASK_STATUS_ARCHIVE
  if (task.projectColumnId == null) return TASK_STATUS_BACKLOG
  return task.projectColumnId
}

export function taskStatusToSelectValue(status: TaskStatusValue): string {
  if (status === TASK_STATUS_BACKLOG) return TASK_STATUS_BACKLOG
  if (status === TASK_STATUS_ARCHIVE) return TASK_STATUS_ARCHIVE
  return String(status)
}

export function taskStatusFromSelectValue(raw: string): TaskStatusValue {
  if (raw === TASK_STATUS_BACKLOG) return TASK_STATUS_BACKLOG
  if (raw === TASK_STATUS_ARCHIVE) return TASK_STATUS_ARCHIVE
  const id = Number(raw)
  return Number.isFinite(id) ? id : TASK_STATUS_BACKLOG
}

export function patchPayloadForTaskStatus(status: TaskStatusValue): {
  projectColumnId?: number
  archived?: boolean
} {
  if (status === TASK_STATUS_ARCHIVE) return { archived: true }
  if (status === TASK_STATUS_BACKLOG) return { projectColumnId: 0, archived: false }
  return { projectColumnId: status, archived: false }
}
