<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import type { SettingsCardMode } from '@/composables/useSettingsPermissions'
import api from '@/api/v1/indexApi'
import { useLayoutStore } from '@/stores/layout'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    mode?: SettingsCardMode
  }>(),
  {
    mode: 'read-only',
  },
)

const { t } = useI18n()
const layoutStore = useLayoutStore()

const sessions = ref<Array<{
  id: string
  createdAt: string
  lastSeenAt: string
  ip: string | null
  userAgent: string | null
  isCurrent: boolean
}>>([])
const sessionsLoading = ref(false)
const revokingSessionId = ref<string | null>(null)
const revokingOthers = ref(false)
const MAX_RENDERED_SESSIONS = 50
const visibleSessions = computed(() => sessions.value.slice(0, MAX_RENDERED_SESSIONS))

const editable = computed(() => props.mode === 'editable')

function formatSessionDate(raw: string): string {
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return raw
  return dt.toLocaleString()
}

async function loadSessions() {
  if (!editable.value) return
  try {
    sessionsLoading.value = true
    const response = await api.getCurrentUserSessions()
    sessions.value = response.sessions
  } catch (err: any) {
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      t('settingsHub.account.security.sessionsLoadError')
    layoutStore.openToast({ type: 'error', message })
  } finally {
    sessionsLoading.value = false
  }
}

async function revokeSession(sessionId: string) {
  if (!editable.value) return
  try {
    revokingSessionId.value = sessionId
    await api.revokeCurrentUserSession(sessionId)
    layoutStore.openToast({
      type: 'success',
      message: t('settingsHub.account.security.sessionRevoked'),
    })
    await loadSessions()
  } catch (err: any) {
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      t('settingsHub.account.security.sessionRevokeError')
    layoutStore.openToast({ type: 'error', message })
  } finally {
    revokingSessionId.value = null
  }
}

async function revokeOtherSessions() {
  if (!editable.value) return
  try {
    revokingOthers.value = true
    await api.revokeOtherCurrentUserSessions()
    layoutStore.openToast({
      type: 'success',
      message: t('settingsHub.account.security.otherSessionsRevoked'),
    })
    await loadSessions()
  } catch (err: any) {
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      t('settingsHub.account.security.sessionRevokeError')
    layoutStore.openToast({ type: 'error', message })
  } finally {
    revokingOthers.value = false
  }
}

onMounted(() => {
  void loadSessions()
})
</script>

<template>
  <SettingsCard
    :title="$t('settingsHub.account.sessions.title')"
    :subtitle="$t('settingsHub.account.sessions.subtitle')"
    :mode="props.mode"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex gap-2">
        <button type="button" class="btn btn-ghost btn-xs" :disabled="sessionsLoading" @click="loadSessions">
          {{ $t('settingsHub.account.security.refreshSessions') }}
        </button>
        <button
          type="button"
          class="btn btn-outline btn-xs"
          :disabled="!editable || revokingOthers || sessionsLoading"
          @click="revokeOtherSessions"
        >
          {{
            revokingOthers ? $t('settingsHub.account.security.revoking') : $t('settingsHub.account.security.revokeOthers')
          }}
        </button>
      </div>
    </div>

    <div v-if="sessionsLoading" class="mt-2 text-xs text-base-content/70">
      {{ $t('settingsHub.account.security.loadingSessions') }}
    </div>
    <div v-else-if="sessions.length === 0" class="mt-2 text-xs text-base-content/70">
      {{ $t('settingsHub.account.security.noSessions') }}
    </div>
    <div v-else class="mt-2 flex flex-col gap-2">
      <div
        v-for="session in visibleSessions"
        :key="session.id"
        class="rounded-lg border border-base-300/60 bg-base-200/30 p-2"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs font-medium">
            {{ session.isCurrent ? $t('settingsHub.account.security.currentSession') : $t('settingsHub.account.security.otherSession') }}
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :disabled="!editable || revokingSessionId === session.id || session.isCurrent"
            @click="revokeSession(session.id)"
          >
            {{
              revokingSessionId === session.id
                ? $t('settingsHub.account.security.revoking')
                : $t('settingsHub.account.security.revoke')
            }}
          </button>
        </div>
        <div class="mt-1 text-xs text-base-content/70">{{ session.userAgent || '-' }}</div>
        <div class="text-xs text-base-content/60">{{ session.ip || '-' }}</div>
        <div class="text-xs text-base-content/60">{{ formatSessionDate(session.lastSeenAt) }}</div>
      </div>
      <div v-if="sessions.length > MAX_RENDERED_SESSIONS" class="text-xs text-base-content/60">
        {{ $t('settingsHub.account.security.sessionsTruncated') }}
      </div>
    </div>
  </SettingsCard>
</template>
