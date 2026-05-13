export interface DrawerProjectLike {
  id: number
  name?: string
  prefix?: string
  description?: string
}

export interface CreateProjectPayload {
  name: string
  prefix?: string
  description?: string
}

export function isDrawerUsingFallback(
  isError: boolean,
  liveProjectsCount: number,
  drawerProjectsCount: number,
): boolean {
  return isError && liveProjectsCount === 0 && drawerProjectsCount > 0
}

export function getFallbackDrawerProjects(
  liveProjects: DrawerProjectLike[],
  fallbackProject: DrawerProjectLike | null,
  hasValidFallbackId: boolean,
): DrawerProjectLike[] {
  if (liveProjects.length > 0) return liveProjects
  if (
    fallbackProject &&
    hasValidFallbackId &&
    (fallbackProject.name || fallbackProject.prefix || fallbackProject.description)
  ) {
    return [{ ...fallbackProject }]
  }
  return []
}

export function validateProjectPrefix(prefixRaw: string): {
  isValid: boolean
  normalized: string
  reason: 'ok' | 'too_short' | 'too_long' | 'invalid_chars'
} {
  const normalized = String(prefixRaw || '').trim().toUpperCase()
  if (!normalized) return { isValid: true, normalized, reason: 'ok' }
  if (normalized.length < 2) return { isValid: false, normalized, reason: 'too_short' }
  if (normalized.length > 8) return { isValid: false, normalized, reason: 'too_long' }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return { isValid: false, normalized, reason: 'invalid_chars' }
  }
  return { isValid: true, normalized, reason: 'ok' }
}

export function buildCreateProjectPayload(
  nameRaw: string,
  prefixRaw: string,
  descriptionRaw: string,
): CreateProjectPayload | null {
  const name = String(nameRaw || '').trim()
  if (!name) return null

  const prefixValidation = validateProjectPrefix(prefixRaw)
  if (!prefixValidation.isValid) return null

  const payload: CreateProjectPayload = { name }
  if (prefixValidation.normalized) payload.prefix = prefixValidation.normalized

  const description = String(descriptionRaw || '').trim()
  if (description) payload.description = description

  return payload
}
