<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsLayoutStore } from '@/stores/settingsLayout'
import SettingsHubSideNav from '@/components/settings/SettingsHubSideNav.vue'
import type { SettingsHubPageKey } from '@/types/settingsLayoutTypes'

const settingsLayoutStore = useSettingsLayoutStore()
const route = useRoute()

const currentPage = computed<SettingsHubPageKey | null>(() => {
  switch (route.name) {
    case 'SettingsAccount':
      return 'account'
    case 'SettingsAgents':
      return 'agents'
    case 'SettingsProject':
      return 'project'
    case 'SettingsAdmin':
      return 'admin'
    default:
      return null
  }
})

function normalizeCurrentPage() {
  if (!currentPage.value) return
  settingsLayoutStore.normalizePage(currentPage.value)
}
</script>

<template>
  <div class="min-h-[calc(100vh-3.5rem)] w-full bg-gradient-to-br from-primary to-secondary to-80%">
    <div class="mx-auto flex w-full max-w-[1500px] gap-5 px-4 py-5 sm:px-6 sm:py-7">
      <SettingsHubSideNav />

      <section class="flex-1 rounded-2xl border border-base-300/60 bg-base-100/80 p-6 shadow-sm backdrop-blur-md min-h-[calc(100vh-6rem)]">
        <header class="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold text-base-content">{{ $t('settingsHub.page.title') }}</h1>
            <p class="text-sm text-base-content/70">{{ $t('settingsHub.page.subtitle') }}</p>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="!settingsLayoutStore.isEditMode || !currentPage"
              @click="normalizeCurrentPage"
            >
              {{ $t('settingsHub.layout.normalize') }}
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="!settingsLayoutStore.isEditMode"
              @click="settingsLayoutStore.resetAll"
            >
              {{ $t('settingsHub.layout.resetAll') }}
            </button>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              @click="settingsLayoutStore.isEditMode = !settingsLayoutStore.isEditMode"
            >
              {{ settingsLayoutStore.isEditMode ? $t('settingsHub.layout.done') : $t('settingsHub.layout.edit') }}
            </button>
          </div>
        </header>

        <div class="pt-1 pb-6">
          <slot />
        </div>
      </section>
    </div>
  </div>
</template>

