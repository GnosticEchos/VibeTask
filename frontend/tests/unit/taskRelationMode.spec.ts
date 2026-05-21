import { describe, expect, it } from 'vitest'
import {
  normalizeRelationModeForApi,
  relationModeToUiLabel,
  relationUiLabelToApiMode,
} from '@/utils/taskRelationMode'

describe('taskRelationMode', () => {
  it('maps legacy duplicated-by to duplicate-of for API', () => {
    expect(normalizeRelationModeForApi('duplicated-by')).toBe('duplicate-of')
  })

  it('maps UI labels to API modes', () => {
    expect(relationUiLabelToApiMode('Blocked by')).toBe('blocked-by')
    expect(relationUiLabelToApiMode('Duplicate of')).toBe('duplicate-of')
  })

  it('shows Duplicate of label for legacy duplicated-by', () => {
    expect(relationModeToUiLabel('duplicated-by')).toBe('Duplicate of')
  })

  it('returns null for unknown modes', () => {
    expect(normalizeRelationModeForApi('not-a-relation')).toBeNull()
  })

  it('treats baseline and patched legacy mode as unchanged', () => {
    const base = normalizeRelationModeForApi('duplicated-by')
    const next = relationUiLabelToApiMode('Duplicate of')
    expect(base).toBe('duplicate-of')
    expect(next).toBe('duplicate-of')
    expect(base === next).toBe(true)
  })
})
