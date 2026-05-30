/** Board / grid task scope toggled from ProjectStatsBar. */
export type ProjectBoardCountMode = 'main' | 'all' | 'backlog' | 'archive'

export function isWallCountMode(mode: ProjectBoardCountMode): boolean {
  return mode === 'backlog' || mode === 'archive'
}
