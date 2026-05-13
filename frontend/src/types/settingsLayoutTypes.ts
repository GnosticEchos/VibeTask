export type SettingsHubPageKey = 'account' | 'agents' | 'project' | 'admin' | 'themeBuilder'

export interface SettingsGridSpec {
  columns: number
}

export interface SettingsLayoutCardPlacement {
  /** Stable card id, e.g. `account.profile` */
  id: string
  /** Grid x coordinate (0-based) */
  x: number
  /** Grid y coordinate (0-based) */
  y: number
  /** Grid width in columns */
  w: number
  /** Grid height in rows */
  h: number
  hidden?: boolean
}

export interface SettingsLayoutPage {
  grid: SettingsGridSpec
  cards: SettingsLayoutCardPlacement[]
}

export interface PersistedSettingsLayoutsV1 {
  version: 1
  userId: string
  lastUpdatedAt: string
  pages: Partial<Record<SettingsHubPageKey, SettingsLayoutPage>>
}

