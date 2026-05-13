import { describe, expect, it } from 'vitest'
import { cardConstraint, normalizeCards, overlaps } from '@/utils/settingsLayoutNormalize'

describe('settingsLayoutNormalize', () => {
  it('clamps card width to per-card maxW', () => {
    const c = cardConstraint('admin.summary', 12)
    expect(c.maxW).toBe(4)
    const out = normalizeCards([{ id: 'admin.summary', x: 0, y: 0, w: 12, h: 5 }], 12)
    expect(out[0].w).toBe(4)
  })

  it('removes overlap by pushing later card down', () => {
    const cards = [
      { id: 'admin.rateLimits', x: 0, y: 0, w: 6, h: 4 },
      { id: 'admin.summary', x: 0, y: 2, w: 3, h: 4 },
    ]
    const out = normalizeCards(cards, 12)
    expect(overlaps(out[0], out[1])).toBe(false)
    expect(out[1].y).toBeGreaterThanOrEqual(out[0].y + out[0].h)
  })
})
