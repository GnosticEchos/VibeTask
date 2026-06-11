import type { SettingsLayoutCardPlacement } from '@/types/settingsLayoutTypes'

export type CardConstraint = { minW: number; maxW: number; minH: number; maxH: number }

const CONTENT_FIT_MAX_H = 240

/** Default AI Agents hub geometry: no overlap between right-column stack and full-width delegations row. */
export const AGENTS_LAYOUT_DEFAULT_CARDS: SettingsLayoutCardPlacement[] = [
  { id: 'agents.list', x: 0, y: 0, w: 7, h: 9 },
  { id: 'agents.summary', x: 7, y: 0, w: 3, h: 4 },
  { id: 'agents.create', x: 7, y: 4, w: 3, h: 5 },
  { id: 'agents.delegations', x: 0, y: 9, w: 12, h: 6 },
]

export const SETTINGS_CARD_CONSTRAINTS: Record<string, CardConstraint> = {
  /** Full grid width (12) so expanded cards can span the hub and avoid a permanent empty right gutter. */
  'account.profile': { minW: 4, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'account.security': { minW: 4, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'account.sessions': { minW: 4, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'account.preferences': { minW: 4, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'agents.list': { minW: 6, maxW: 9, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'agents.summary': { minW: 3, maxW: 4, minH: 4, maxH: CONTENT_FIT_MAX_H },
  'agents.create': { minW: 3, maxW: 6, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'agents.delegations': { minW: 6, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'project.context': { minW: 6, maxW: 12, minH: 4, maxH: CONTENT_FIT_MAX_H },
  'project.general': { minW: 4, maxW: 8, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'project.invite': { minW: 4, maxW: 8, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'project.members': { minW: 6, maxW: 12, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'project.columns': { minW: 4, maxW: 12, minH: 4, maxH: CONTENT_FIT_MAX_H },
  'project.danger': { minW: 6, maxW: 12, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'admin.users': { minW: 6, maxW: 12, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'admin.systemHealth': { minW: 3, maxW: 6, minH: 4, maxH: CONTENT_FIT_MAX_H },
  'admin.rateLimits': { minW: 6, maxW: 9, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'admin.platformAgents': { minW: 6, maxW: 12, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'admin.planningSkills': { minW: 6, maxW: 12, minH: 6, maxH: CONTENT_FIT_MAX_H },
  'admin.summary': { minW: 3, maxW: 4, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'admin.roadmapSecurity': { minW: 4, maxW: 6, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'admin.roadmapCompliance': { minW: 4, maxW: 6, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'admin.roadmapPlatform': { minW: 4, maxW: 6, minH: 5, maxH: CONTENT_FIT_MAX_H },
  'theme.builder': { minW: 8, maxW: 12, minH: 10, maxH: CONTENT_FIT_MAX_H },
}

/** Detects the pre-2026 agents hub default that overlapped `agents.delegations` with the right-column cards (create/summary), forcing vertical-compact to insert a large gap. */
export function isLegacyAgentsDefaultFingerprint(cards: SettingsLayoutCardPlacement[]): boolean {
  if (cards.length !== 4) return false
  const g = (id: string) => cards.find((c) => c.id === id)
  const list = g('agents.list')
  const summ = g('agents.summary')
  const crt = g('agents.create')
  const del = g('agents.delegations')
  if (!list || !summ || !crt || !del) return false
  return (
    list.x === 0 &&
    list.y === 0 &&
    list.w === 7 &&
    list.h === 6 &&
    summ.x === 7 &&
    summ.y === 0 &&
    summ.w === 3 &&
    summ.h === 4 &&
    crt.x === 7 &&
    crt.y === 4 &&
    crt.w === 3 &&
    crt.h === 4 &&
    del.x === 0 &&
    del.y === 6 &&
    del.w === 12 &&
    del.h === 6
  )
}

export function overlaps(a: SettingsLayoutCardPlacement, b: SettingsLayoutCardPlacement): boolean {
  const ax2 = a.x + a.w
  const ay2 = a.y + a.h
  const bx2 = b.x + b.w
  const by2 = b.y + b.h
  return a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y
}

export function cardConstraint(id: string, columns: number): CardConstraint {
  const c = SETTINGS_CARD_CONSTRAINTS[id] ?? { minW: 3, maxW: columns, minH: 3, maxH: CONTENT_FIT_MAX_H }
  return {
    minW: Math.max(1, Math.min(columns, c.minW)),
    maxW: Math.max(1, Math.min(columns, c.maxW)),
    minH: Math.max(1, c.minH),
    maxH: Math.max(1, c.maxH),
  }
}

/**
 * Clamp each card to min/max size and bounds without changing stacking order.
 * Use after vue-grid-layout updates so we do not fight the library's compact/collision logic (which caused large gaps when combined with `normalizeCards`).
 */
export function clampCardsToConstraints(
  input: SettingsLayoutCardPlacement[],
  columns: number,
): SettingsLayoutCardPlacement[] {
  return input.map((raw) => {
    const { minW, maxW, minH, maxH } = cardConstraint(raw.id, columns)
    const w = Math.max(minW, Math.min(maxW, raw.w))
    const h = Math.max(minH, Math.min(maxH, raw.h))
    const x = Math.max(0, Math.min(columns - w, raw.x))
    const y = Math.max(0, raw.y)
    return { ...raw, x, y, w, h }
  })
}

/**
 * Resolve overlaps and clamp card geometry. Used by "Normalize layout" in the store (explicit user action).
 */
export function normalizeCards(
  input: SettingsLayoutCardPlacement[],
  columns: number,
  prioritizeId?: string,
): SettingsLayoutCardPlacement[] {
  const sorted = [...input].sort((a, b) => {
    if (prioritizeId && a.id === prioritizeId && b.id !== prioritizeId) return -1
    if (prioritizeId && b.id === prioritizeId && a.id !== prioritizeId) return 1
    return a.y - b.y || a.x - b.x
  })
  const placed: SettingsLayoutCardPlacement[] = []

  for (const raw of sorted) {
    const { minW, maxW, minH, maxH } = cardConstraint(raw.id, columns)
    const w = Math.max(minW, Math.min(maxW, raw.w))
    const h = Math.max(minH, Math.min(maxH, raw.h))
    const x = Math.max(0, Math.min(columns - w, raw.x))
    let y = Math.max(0, raw.y)

    for (let candidateY = 0; candidateY <= y; candidateY += 1) {
      const probe = { ...raw, x, y: candidateY, w, h }
      if (!placed.some((p) => overlaps(probe, p))) {
        y = candidateY
        break
      }
    }
    while (placed.some((p) => overlaps({ ...raw, x, y, w, h }, p))) {
      y += 1
    }

    placed.push({ ...raw, x, y, w, h })
  }

  return placed
}
