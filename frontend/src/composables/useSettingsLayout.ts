import { computed } from 'vue'
import type { SettingsHubPageKey, SettingsLayoutPage, SettingsLayoutCardPlacement } from '@/types/settingsLayoutTypes'
import { useSettingsLayoutStore } from '@/stores/settingsLayout'
import { AGENTS_LAYOUT_DEFAULT_CARDS, isLegacyAgentsDefaultFingerprint } from '@/utils/settingsLayoutNormalize'

const DEFAULT_GRID_COLUMNS = 12

function defaultPageLayout(page: SettingsHubPageKey): SettingsLayoutPage {
  const base: SettingsLayoutPage = {
    grid: { columns: DEFAULT_GRID_COLUMNS },
    cards: [],
  }

  const card = (id: string, x: number, y: number, w: number, h: number): SettingsLayoutCardPlacement => ({
    id,
    x,
    y,
    w,
    h,
  })

  if (page === 'account') {
    base.cards = [
      card('account.profile', 0, 0, 6, 5),
      card('account.security', 6, 0, 6, 6),
      card('account.sessions', 6, 6, 6, 7),
      card('account.preferences', 0, 5, 6, 7),
    ]
  } else if (page === 'agents') {
    base.cards = AGENTS_LAYOUT_DEFAULT_CARDS.map((c) => ({ ...c }))
  } else if (page === 'project') {
    base.cards = [
      card('project.context', 0, 0, 8, 3),
      card('project.general', 0, 3, 5, 5),
      card('project.invite', 5, 3, 5, 5),
      card('project.members', 0, 8, 8, 5),
      card('project.danger', 0, 13, 8, 4),
      card('project.columns', 0, 17, 12, 4),
    ]
  } else if (page === 'admin') {
    base.cards = [
      card('admin.users', 0, 0, 8, 7),
      card('admin.summary', 8, 0, 4, 3),
      card('admin.systemHealth', 8, 3, 4, 4),
      card('admin.rateLimits', 0, 7, 7, 8),
      card('admin.platformAgents', 7, 7, 5, 8),
      card('admin.planningSkills', 0, 15, 12, 7),
      card('admin.roadmapSecurity', 0, 22, 4, 5),
      card('admin.roadmapCompliance', 4, 22, 4, 5),
      card('admin.roadmapPlatform', 8, 22, 4, 5),
    ]
  } else if (page === 'themeBuilder') {
    base.cards = [card('theme.builder', 0, 0, 10, 10)]
  }

  return base
}

export function useSettingsLayout(page: SettingsHubPageKey) {
  const store = useSettingsLayoutStore()

  const layout = computed<SettingsLayoutPage>(() => {
    const defaults = defaultPageLayout(page)
    const stored = store.pages?.[page]
    if (!stored) return defaults

    // Backward-compatible layout migration:
    // keep user placements for known cards, add any new default cards introduced later.
    const storedById = new Map(stored.cards.map((c) => [c.id, c]))
    let mergedDefaultCards = defaults.cards.map((defaultCard) => storedById.get(defaultCard.id) ?? defaultCard)
    const mergedCardIds = new Set(mergedDefaultCards.map((c) => c.id))
    const extraStoredCards = stored.cards.filter((c) => !mergedCardIds.has(c.id))

    if (page === 'agents' && isLegacyAgentsDefaultFingerprint(stored.cards)) {
      mergedDefaultCards = AGENTS_LAYOUT_DEFAULT_CARDS.map((defaultCard) => {
        const prev = storedById.get(defaultCard.id)
        return { ...defaultCard, hidden: prev?.hidden }
      })
    }

    return {
      ...stored,
      cards: [...mergedDefaultCards, ...extraStoredCards],
    }
  })

  function setLayout(next: SettingsLayoutPage) {
    store.setPageLayout(page, next)
  }

  function resetPage() {
    setLayout(defaultPageLayout(page))
  }

  return {
    isEditMode: store.isEditMode,
    layout,
    setLayout,
    resetPage,
  }
}

