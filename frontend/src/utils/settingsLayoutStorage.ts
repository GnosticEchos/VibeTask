import type {
  PersistedSettingsLayoutsV1,
  SettingsHubPageKey,
  SettingsLayoutPage,
} from '@/types/settingsLayoutTypes'
import {
  AGENTS_LAYOUT_DEFAULT_CARDS,
  isLegacyAgentsDefaultFingerprint,
} from '@/utils/settingsLayoutNormalize'

const STORAGE_VERSION = 1 as const

export function settingsLayoutsStorageKey(userId: string): string {
  return `settings.layouts.v${STORAGE_VERSION}.${userId}`
}

function clampInt(n: unknown, min: number, max: number): number {
  const num = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(num)) return min
  const i = Math.trunc(num)
  return Math.min(max, Math.max(min, i))
}

function normalizeUserId(userId: unknown): string {
  if (typeof userId === 'string' && userId.trim()) return userId.trim()
  if (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) return String(userId)
  return 'anonymous'
}

function normalizePage(page: unknown): SettingsLayoutPage | null {
  if (!page || typeof page !== 'object') return null
  const gridRaw = (page as { grid?: unknown }).grid
  const cardsRaw = (page as { cards?: unknown }).cards

  const columns = (() => {
    if (!gridRaw || typeof gridRaw !== 'object') return 12
    return clampInt((gridRaw as { columns?: unknown }).columns, 1, 24)
  })()

  const cards = Array.isArray(cardsRaw)
    ? cardsRaw
        .map((c) => {
          if (!c || typeof c !== 'object') return null
          const id = (c as { id?: unknown }).id
          if (typeof id !== 'string' || !id.trim()) return null
          const w = clampInt((c as { w?: unknown }).w, 1, columns)
          const h = clampInt((c as { h?: unknown }).h, 1, 48)
          const x = clampInt((c as { x?: unknown }).x, 0, Math.max(0, columns - w))
          const y = clampInt((c as { y?: unknown }).y, 0, 500)
          const hidden = Boolean((c as { hidden?: unknown }).hidden)
          return { id: id.trim(), x, y, w, h, hidden }
        })
        .filter(Boolean)
    : []

  return { grid: { columns }, cards: cards as any }
}

export function loadSettingsLayouts(userId: unknown): PersistedSettingsLayoutsV1 | null {
  const uid = normalizeUserId(userId)
  const key = settingsLayoutsStorageKey(uid)
  const raw = localStorage.getItem(key)
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if ((parsed as { version?: unknown }).version !== STORAGE_VERSION) return null

    const pagesRaw = (parsed as { pages?: unknown }).pages
    const pages: PersistedSettingsLayoutsV1['pages'] = {}
    if (pagesRaw && typeof pagesRaw === 'object') {
      ;(['account', 'agents', 'project', 'admin', 'themeBuilder'] as SettingsHubPageKey[]).forEach((k) => {
        const p = normalizePage((pagesRaw as Record<string, unknown>)[k])
        if (p) pages[k] = p
      })
    }

    const result: PersistedSettingsLayoutsV1 = {
      version: STORAGE_VERSION,
      userId: uid,
      lastUpdatedAt:
        typeof (parsed as { lastUpdatedAt?: unknown }).lastUpdatedAt === 'string'
          ? ((parsed as { lastUpdatedAt?: string }).lastUpdatedAt as string)
          : new Date().toISOString(),
      pages,
    }

    const agentsPage = result.pages.agents
    if (agentsPage && isLegacyAgentsDefaultFingerprint(agentsPage.cards)) {
      const hiddenById = new Map(agentsPage.cards.map((c) => [c.id, c.hidden]))
      result.pages = {
        ...result.pages,
        agents: {
          ...agentsPage,
          cards: AGENTS_LAYOUT_DEFAULT_CARDS.map((c) => ({
            ...c,
            hidden: Boolean(hiddenById.get(c.id)),
          })),
        },
      }
      result.lastUpdatedAt = new Date().toISOString()
      saveSettingsLayouts(result)
    }

    return result
  } catch {
    return null
  }
}

export function saveSettingsLayouts(payload: PersistedSettingsLayoutsV1): void {
  const uid = normalizeUserId(payload.userId)
  const key = settingsLayoutsStorageKey(uid)
  const data: PersistedSettingsLayoutsV1 = {
    version: STORAGE_VERSION,
    userId: uid,
    lastUpdatedAt: new Date().toISOString(),
    pages: payload.pages ?? {},
  }
  localStorage.setItem(key, JSON.stringify(data))
}

export function clearSettingsLayouts(userId: unknown): void {
  const uid = normalizeUserId(userId)
  localStorage.removeItem(settingsLayoutsStorageKey(uid))
}

/** Apply the same post-load fixes as localStorage (e.g. agents legacy fingerprint) to a server payload. */
export function normalizePersistedFromRemote(
  userId: unknown,
  raw: PersistedSettingsLayoutsV1,
): PersistedSettingsLayoutsV1 {
  const uid = normalizeUserId(userId)
  const pages = { ...(raw.pages ?? {}) }
  const agentsPage = pages.agents
  if (agentsPage && isLegacyAgentsDefaultFingerprint(agentsPage.cards)) {
    const hiddenById = new Map(agentsPage.cards.map((c) => [c.id, c.hidden]))
    pages.agents = {
      ...agentsPage,
      cards: AGENTS_LAYOUT_DEFAULT_CARDS.map((c) => ({
        ...c,
        hidden: Boolean(hiddenById.get(c.id)),
      })),
    }
  }
  return {
    version: 1,
    userId: uid,
    lastUpdatedAt: raw.lastUpdatedAt || new Date().toISOString(),
    pages,
  }
}

