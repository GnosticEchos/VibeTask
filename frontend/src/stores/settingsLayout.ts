import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PersistedSettingsLayoutsV1, SettingsHubPageKey, SettingsLayoutPage } from '@/types/settingsLayoutTypes'
import {
  loadSettingsLayouts,
  saveSettingsLayouts,
  clearSettingsLayouts,
  normalizePersistedFromRemote,
} from '@/utils/settingsLayoutStorage'
import { normalizeCards } from '@/utils/settingsLayoutNormalize'
import authApi from '@/api/v1/authApi'

export const useSettingsLayoutStore = defineStore('settingsLayout', () => {
  const isEditMode = ref(false)

  const userId = ref('anonymous')
  const persisted = ref<PersistedSettingsLayoutsV1 | null>(null)

  let pullPromise: Promise<void> | null = null
  let pushTimer: ReturnType<typeof setTimeout> | null = null

  function schedulePushToServer() {
    if (userId.value === 'anonymous') return
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(async () => {
      pushTimer = null
      const current = persisted.value
      if (!current) return
      try {
        const body = normalizePersistedFromRemote(userId.value, current)
        await authApi.putSettingsLayout(body)
      } catch {
        /* offline — will retry on next layout change */
      }
    }, 800)
  }

  async function pullRemoteLayout() {
    if (userId.value === 'anonymous') return
    if (pullPromise) return pullPromise
    pullPromise = (async () => {
      try {
        const { layout: remoteRaw } = await authApi.getSettingsLayout()
        const local = persisted.value ?? loadSettingsLayouts(userId.value)

        if (!remoteRaw) {
          if (local && Object.keys(local.pages ?? {}).length > 0) {
            const body = normalizePersistedFromRemote(userId.value, {
              ...local,
              lastUpdatedAt: new Date().toISOString(),
            })
            await authApi.putSettingsLayout(body)
          }
          return
        }

        const remote = normalizePersistedFromRemote(userId.value, remoteRaw as PersistedSettingsLayoutsV1)

        if (!local?.lastUpdatedAt) {
          persisted.value = remote
          saveSettingsLayouts(remote)
          return
        }

        const tLocal = Date.parse(local.lastUpdatedAt)
        const tRemote = Date.parse(remote.lastUpdatedAt)
        if (!Number.isFinite(tRemote) || tRemote >= tLocal) {
          persisted.value = remote
          saveSettingsLayouts(remote)
        } else {
          const body = normalizePersistedFromRemote(userId.value, {
            ...local,
            lastUpdatedAt: new Date().toISOString(),
          })
          await authApi.putSettingsLayout(body)
        }
      } catch {
        /* network / 401 */
      } finally {
        pullPromise = null
      }
    })()
    return pullPromise
  }

  function setUserId(nextUserId: string) {
    userId.value = nextUserId || 'anonymous'
    persisted.value = loadSettingsLayouts(userId.value)
    void pullRemoteLayout()
  }

  const pages = computed(() => persisted.value?.pages ?? {})

  function normalizePageLayout(layout: SettingsLayoutPage): SettingsLayoutPage {
    const columns = Math.max(1, layout.grid.columns)
    return {
      ...layout,
      cards: normalizeCards(layout.cards, columns),
    }
  }

  function setPageLayout(page: SettingsHubPageKey, layout: SettingsLayoutPage) {
    const next: PersistedSettingsLayoutsV1 = persisted.value ?? {
      version: 1,
      userId: userId.value,
      lastUpdatedAt: new Date().toISOString(),
      pages: {},
    }
    next.pages = { ...(next.pages ?? {}), [page]: layout }
    next.lastUpdatedAt = new Date().toISOString()
    persisted.value = next
    saveSettingsLayouts(next)
    schedulePushToServer()
  }

  /**
   * Apply layout from WebSocket `settings-layout:updated` (other tab/device).
   * `null` = server cleared layout (DELETE); object = full payload with lastUpdatedAt.
   */
  function applyRemoteWsLayoutPayload(raw: unknown | null) {
    if (userId.value === 'anonymous') return
    if (raw === null) {
      clearSettingsLayouts(userId.value)
      persisted.value = null
      return
    }
    if (raw === undefined || typeof raw !== 'object') return
    try {
      const remote = normalizePersistedFromRemote(userId.value, raw as PersistedSettingsLayoutsV1)
      const local = persisted.value ?? loadSettingsLayouts(userId.value)
      if (!local?.lastUpdatedAt) {
        persisted.value = remote
        saveSettingsLayouts(remote)
        return
      }
      const tLocal = Date.parse(local.lastUpdatedAt)
      const tRemote = Date.parse(remote.lastUpdatedAt)
      if (Number.isFinite(tRemote) && tRemote >= tLocal) {
        persisted.value = remote
        saveSettingsLayouts(remote)
      }
    } catch {
      /* malformed */
    }
  }

  async function resetAll() {
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
    }
    if (userId.value !== 'anonymous') {
      try {
        await authApi.deleteSettingsLayout()
      } catch {
        /* still clear local */
      }
    }
    clearSettingsLayouts(userId.value)
    persisted.value = null
  }

  function normalizePage(page: SettingsHubPageKey) {
    const current = pages.value?.[page]
    if (!current) return
    setPageLayout(page, normalizePageLayout(current))
  }

  return {
    isEditMode,
    setUserId,
    pages,
    setPageLayout,
    normalizePage,
    resetAll,
    pullRemoteLayout,
    applyRemoteWsLayoutPayload,
  }
})
