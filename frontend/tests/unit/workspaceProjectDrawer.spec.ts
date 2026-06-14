import { describe, expect, it } from 'vitest'
import {
  buildCreateProjectPayload,
  getFallbackDrawerProjects,
  isDrawerUsingFallback,
  isProjectInMembershipList,
  validateProjectPrefix,
} from '@/utils/workspaceProjectDrawer'

describe('workspaceProjectDrawer utils', () => {
  it('marks fallback only when error + empty live list + non-empty drawer list', () => {
    expect(isDrawerUsingFallback(true, 0, 1)).toBe(true)
    expect(isDrawerUsingFallback(false, 0, 1)).toBe(false)
    expect(isDrawerUsingFallback(true, 2, 2)).toBe(false)
    expect(isDrawerUsingFallback(true, 0, 0)).toBe(false)
  })

  it('uses fallback project when live list is empty', () => {
    const out = getFallbackDrawerProjects([], { id: 7, name: 'Fallback' }, true)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(7)
    expect(out[0].name).toBe('Fallback')
  })

  it('validates prefix rules', () => {
    expect(validateProjectPrefix('ab').isValid).toBe(true)
    expect(validateProjectPrefix('a').reason).toBe('too_short')
    expect(validateProjectPrefix('abcdefghi').reason).toBe('too_long')
    expect(validateProjectPrefix('ab-1').reason).toBe('invalid_chars')
  })

  it('builds create payload and normalizes prefix', () => {
    const payload = buildCreateProjectPayload(' New Project ', ' ab12 ', '  desc ')
    expect(payload).toEqual({
      name: 'New Project',
      prefix: 'AB12',
      description: 'desc',
    })
  })

  it('rejects invalid create payload', () => {
    expect(buildCreateProjectPayload('', 'AB', '')).toBeNull()
    expect(buildCreateProjectPayload('X', 'a-', '')).toBeNull()
  })

  it('checks membership list for selected project id', () => {
    const live = [{ id: 8, name: 'Alpha' }]
    expect(isProjectInMembershipList(8, live)).toBe(true)
    expect(isProjectInMembershipList(39, live)).toBe(false)
    expect(isProjectInMembershipList(null, live)).toBe(false)
  })
})
