import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_OUTLINE_COLOR,
  normalizeHexColor,
  resolveTaskWorkspaceOutlineColor,
  resolveWorkspaceOutlineColor,
} from '@/utils/workspaceOutlineColor'

describe('workspaceOutlineColor', () => {
  it('normalizes hex with or without hash', () => {
    expect(normalizeHexColor('#8B5CF6')).toBe('#8B5CF6')
    expect(normalizeHexColor('8b5cf6')).toBe('#8b5cf6')
    expect(normalizeHexColor('  #AABBCC  ')).toBe('#AABBCC')
  })

  it('rejects invalid colors', () => {
    expect(normalizeHexColor('')).toBeNull()
    expect(normalizeHexColor('#abc')).toBeNull()
    expect(normalizeHexColor('not-a-color')).toBeNull()
  })

  it('falls back to default when settings omit color', () => {
    expect(resolveWorkspaceOutlineColor(undefined)).toBe(DEFAULT_WORKSPACE_OUTLINE_COLOR)
    expect(resolveWorkspaceOutlineColor({})).toBe(DEFAULT_WORKSPACE_OUTLINE_COLOR)
  })

  it('uses project settings color when valid', () => {
    expect(resolveWorkspaceOutlineColor({ subBoardOutlineColor: '#ff00aa' })).toBe('#ff00aa')
  })

  it('falls back to project default for containers without task color', () => {
    expect(
      resolveTaskWorkspaceOutlineColor({ isContainer: true }, { subBoardOutlineColor: '#112233' }),
    ).toBe('#112233')
  })

  it('prefers project default over stale task color', () => {
    expect(
      resolveTaskWorkspaceOutlineColor(
        { isContainer: true, subBoardOutlineColor: '#6366f1' },
        { subBoardOutlineColor: '#f264c5' },
      ),
    ).toBe('#f264c5')
  })

  it('uses task color when project has no workspace color', () => {
    expect(
      resolveTaskWorkspaceOutlineColor(
        { isContainer: true, subBoardOutlineColor: '#aabbcc' },
        {},
      ),
    ).toBe('#aabbcc')
  })
})
