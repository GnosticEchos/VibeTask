/**
 * Project-level default outline color for workspace container tasks.
 */

export function readDefaultWorkspaceOutlineColor(settings: unknown): string | null {
  if (!settings || typeof settings !== 'object') return null
  const color = (settings as { subBoardOutlineColor?: unknown }).subBoardOutlineColor
  if (typeof color !== 'string') return null
  const trimmed = color.trim()
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : null
}
