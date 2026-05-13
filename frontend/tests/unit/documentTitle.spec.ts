import { describe, expect, it } from 'vitest'
import { viewKeyFromMetaTitle } from '@/router/documentTitle'

describe('documentTitle', () => {
  it('maps known meta.title strings to stable view keys', () => {
    expect(viewKeyFromMetaTitle('Administration')).toBe('administration')
    expect(viewKeyFromMetaTitle('Project settings')).toBe('project_settings')
    expect(viewKeyFromMetaTitle('Theme Builder')).toBe('theme_builder')
  })

  it('slugifies unknown titles for fallback lookup', () => {
    expect(viewKeyFromMetaTitle('Some New Page')).toBe('some_new_page')
  })
})
