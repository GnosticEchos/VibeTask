/** Default accent for workspace container dots and borders when project has no setting. */
export const DEFAULT_WORKSPACE_OUTLINE_COLOR = '#6366f1'

const HEX_WITH_HASH = /^#[0-9A-Fa-f]{6}$/

/** Normalize user input to `#rrggbb` or null if invalid. */
export function normalizeHexColor(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  const v = value.trim()
  if (HEX_WITH_HASH.test(v)) return v
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`
  return null
}

export function resolveWorkspaceOutlineColor(
  settings?: { subBoardOutlineColor?: string | null } | null,
): string {
  const fromSettings = settings?.subBoardOutlineColor
    ? normalizeHexColor(settings.subBoardOutlineColor)
    : null
  return fromSettings ?? DEFAULT_WORKSPACE_OUTLINE_COLOR
}

type WorkspaceColorTask = {
  subBoardOutlineColor?: string | null
  isContainer?: boolean
  planAccepted?: boolean
}

/** Color shown on board/menu: project setting wins when set; else task color; else default for containers. */
export function resolveTaskWorkspaceOutlineColor(
  task: WorkspaceColorTask,
  projectSettings?: { subBoardOutlineColor?: string | null } | null,
): string | null {
  if (!(task.isContainer || task.planAccepted)) return null

  const fromProject = projectSettings?.subBoardOutlineColor
    ? normalizeHexColor(projectSettings.subBoardOutlineColor)
    : null
  if (fromProject) return fromProject

  const onTask = task.subBoardOutlineColor ? normalizeHexColor(task.subBoardOutlineColor) : null
  if (onTask) return onTask

  return DEFAULT_WORKSPACE_OUTLINE_COLOR
}
