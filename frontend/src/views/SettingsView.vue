<template>
  <div class="w-full h-full min-h-screen">
    <div v-if="showLegacyTabs" class="bg-base-200">
      <div role="tablist" class="tabs tabs-border max-w-7xl mx-auto px-4 sticky top-0 z-40 mt-0 pt-0" aria-label="Settings sections">
        <button
          role="tab"
          class="tab"
          :class="{ 'tab-active': activeTab === 'account' }"
          :aria-selected="activeTab === 'account'"
          @click="setTab('account')"
        >{{ $t('settingsHub.tabs.account') }}</button>
        <button
          role="tab"
          class="tab"
          :class="{ 'tab-active': activeTab === 'theme' }"
          :aria-selected="activeTab === 'theme'"
          @click="setTab('theme')"
        >{{ $t('settingsHub.tabs.theme') }}</button>
        <button
          v-if="canManageAgents"
          role="tab"
          class="tab"
          :class="{ 'tab-active': activeTab === 'agents' }"
          :aria-selected="activeTab === 'agents'"
          @click="setTab('agents')"
        >{{ $t('settingsHub.tabs.agents') }}</button>
        <button
          role="tab"
          class="tab"
          :class="{ 'tab-active': activeTab === 'workspace' }"
          :aria-selected="activeTab === 'workspace'"
          @click="setTab('workspace')"
        >{{ $t('settingsHub.tabs.workspace') }}</button>
        <button
          v-if="canUseAdmin"
          role="tab"
          class="tab"
          :class="{ 'tab-active': activeTab === 'admin' }"
          :aria-selected="activeTab === 'admin'"
          @click="setTab('admin')"
        >{{ $t('settingsHub.tabs.admin') }}</button>
      </div>
    </div>

    <div v-if="showLegacyTabs" class="bg-gradient-to-br from-primary to-secondary to-80% min-h-[calc(100vh-4rem)]">
      <div class="mx-auto w-full max-w-7xl p-4 sm:p-6">
        <AccountSection v-if="activeTab === 'account'" />
        <ThemeCard
          v-if="activeTab === 'theme'"
          :title="$t('settingsHub.theme.title')"
          :subtitle="$t('settingsHub.theme.subtitle')"
        />
        <AgentsSection v-if="activeTab === 'agents' && canManageAgents" />
        <WorkspaceSection v-if="activeTab === 'workspace'" />
        <AdminSection v-if="activeTab === 'admin' && canUseAdmin" />
      </div>
    </div>

    <SettingsHubLayout v-else>
      <router-view />
    </SettingsHubLayout>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettingsPermissions } from '@/composables/useSettingsPermissions'
import AccountSection from '@/components/settings/sections/AccountSection.vue'
import AgentsSection from '@/components/settings/sections/AgentsSection.vue'
import AdminSection from '@/components/settings/sections/AdminSection.vue'
import WorkspaceSection from '@/components/settings/sections/WorkspaceSection.vue'
import ThemeCard from '@/components/settings/cards/ThemeCard.vue'
import SettingsHubLayout from '@/components/settings/SettingsHubLayout.vue'

const route = useRoute()
const router = useRouter()
useI18n()

const { canManageAgents, canUseAdmin } = useSettingsPermissions()

const validTabs = ['account', 'theme', 'agents', 'workspace', 'admin']
const activeTab = ref('account')
const showLegacyTabs = computed(() => typeof route.query.tab === 'string' && route.query.tab.trim().length > 0)
const availableTabs = computed(() => {
  return validTabs.filter((tab) => {
    if (tab === 'agents') return canManageAgents.value
    if (tab === 'admin') return canUseAdmin.value
    return true
  })
})

function setTab(tab: string) {
  if (availableTabs.value.includes(tab)) {
    activeTab.value = tab
    router.replace({ query: { ...route.query, tab } })
  }
}

function setTabFromRoute() {
  const tab = route.query.tab
  if (typeof tab === 'string' && availableTabs.value.includes(tab)) {
    activeTab.value = tab
  } else {
    activeTab.value = 'account'
  }
}

watch(
  () => route.query.tab,
  (tab) => {
    if (tab === 'playground') {
      router.replace({ name: 'SettingsThemeBuilder' })
    }
  },
  { immediate: true },
)

onMounted(setTabFromRoute)
watch(() => route.query.tab, setTabFromRoute)

watch(
  () => route.fullPath,
  () => {
    if (showLegacyTabs.value) return
    if (route.name === 'Settings') {
      router.replace({ name: 'SettingsAccount' })
    }
  },
  { immediate: true },
)
</script>
