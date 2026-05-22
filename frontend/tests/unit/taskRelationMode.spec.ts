import { describe, expect, it } from 'vitest'
import {
  dependencyRelationTypeOptions,
  normalizeRelationModeForApi,
  relationFieldsForApiPatch,
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

  it('includes None as first dependency option', () => {
    const options = dependencyRelationTypeOptions()
    expect(options[0]?.value).toBe('')
    expect(options.some((o) => o.value === 'Blocked by')).toBe(true)
  })

  it('clears relation id when type is None even if task id remains in UI state', () => {
    expect(relationFieldsForApiPatch('', '102')).toEqual({ relationId: null, relationMode: null })
  })

  it('requires both mode and id when type is set', () => {
    expect(relationFieldsForApiPatch('Blocked by', '99')).toEqual({
      relationId: 99,
      relationMode: 'blocked-by',
    })
    expect(relationFieldsForApiPatch('Blocked by', '')).toEqual({
      relationId: null,
      relationMode: 'blocked-by',
    })
  })

  it('treats baseline and patched legacy mode as unchanged', () => {
    const base = normalizeRelationModeForApi('duplicated-by')
    const next = relationUiLabelToApiMode('Duplicate of')
    expect(base).toBe('duplicate-of')
    expect(next).toBe('duplicate-of')
    expect(base === next).toBe(true)
  })
})
