import type { components } from '@/api/generated/openapi-types'

export type ProjectStats = components['schemas']['ProjectStats']
export type ProjectColumnStats = components['schemas']['ProjectColumnStats']

function isAgentReviewColumn(column: ProjectColumnStats): boolean {
  return column.roleType === 'AGENT_REVIEW'
}

/** Main-board task count for a column (matches boardTaskScope / hub summary). */
export function columnMainTaskCount(column: ProjectColumnStats): number {
  if (isAgentReviewColumn(column)) {
    return column.taskCountAll ?? column.taskCount ?? column.taskCountMain ?? 0
  }
  return column.taskCountMain ?? column.taskCount ?? 0
}

/** Footer / bar total for explore cards (`scope=main`). */
export function projectMainBoardTaskTotal(stats: ProjectStats): number {
  if (typeof stats.mainBoardTasks === 'number') {
    return stats.mainBoardTasks
  }
  return (stats.columns ?? []).reduce((sum, col) => sum + columnMainTaskCount(col), 0)
}
