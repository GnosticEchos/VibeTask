import i18n from '../locale'

/**
 * Explicit map from route `meta.title` strings to `views.<key>` locale keys.
 * Add an entry when adding a route so titles stay stable (spacing/case independent of slug rules).
 */
const META_TITLE_TO_VIEW_KEY: Record<string, string> = {
  Welcome: 'welcome',
  Auth: 'auth',
  'Sign up': 'sign_up',
  Explore: 'explore',
  Board: 'board',
  'Project grid': 'project_grid',
  Account: 'account',
  Preferences: 'preferences',
  Settings: 'settings',
  Agents: 'agents',
  'Project settings': 'project_settings',
  Administration: 'administration',
  'Theme Builder': 'theme_builder',
}

function slugifyMetaTitle(title: string): string {
  return String(title).trim().replace(/\s/g, '_').toLowerCase()
}

/** Resolve `views.*` key: prefer explicit map, else legacy slug of meta.title. */
export function viewKeyFromMetaTitle(metaTitle: string | undefined): string | undefined {
  if (metaTitle == null || String(metaTitle).trim() === '') return undefined
  const trimmed = String(metaTitle).trim()
  return META_TITLE_TO_VIEW_KEY[trimmed] ?? slugifyMetaTitle(trimmed)
}

/**
 * Set `document.title` using `views.<key>` when the key exists; otherwise use the raw meta title (no missing-key warnings).
 */
export function setDocumentTitle(metaTitle: string | undefined): void {
  if (metaTitle == null || String(metaTitle).trim() === '') {
    document.title = 'Kanban'
    return
  }
  const key = viewKeyFromMetaTitle(metaTitle)
  if (!key) {
    document.title = 'Kanban'
    return
  }
  const path = `views.${key}`
  if (i18n.global.te(path)) {
    document.title = `Kanban - ${i18n.global.t(path)}`
  } else {
    document.title = `Kanban - ${String(metaTitle).trim()}`
  }
}
