<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  UserCircleIcon,
  CpuChipIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  SwatchIcon,
} from '@heroicons/vue/24/outline'
import { useSettingsPermissions } from '@/composables/useSettingsPermissions'

type NavItem = {
  id: 'account' | 'agents' | 'project' | 'admin' | 'themeBuilder'
  to: { name: string }
  labelKey: string
  icon: any
  hidden?: boolean
}

const route = useRoute()
const { canUseAdmin } = useSettingsPermissions()

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    {
      id: 'account',
      to: { name: 'SettingsAccount' },
      labelKey: 'settingsHub.nav.account',
      icon: UserCircleIcon,
    },
    {
      id: 'agents',
      to: { name: 'SettingsAgents' },
      labelKey: 'settingsHub.nav.agents',
      icon: CpuChipIcon,
    },
    {
      id: 'project',
      to: { name: 'SettingsProject' },
      labelKey: 'settingsHub.nav.project',
      icon: Cog6ToothIcon,
    },
    {
      id: 'admin',
      to: { name: 'SettingsAdmin' },
      labelKey: 'settingsHub.nav.admin',
      icon: ShieldCheckIcon,
      hidden: !canUseAdmin.value,
    },
    {
      id: 'themeBuilder',
      to: { name: 'SettingsThemeBuilder' },
      labelKey: 'settingsHub.nav.themeBuilder',
      icon: SwatchIcon,
    },
  ]
  return items.filter((item) => !item.hidden)
})

const activeName = computed(() => String(route.name || ''))
</script>

<template>
  <aside class="w-72 shrink-0 self-stretch rounded-2xl border border-base-300/70 bg-base-100/70 p-3 backdrop-blur-lg min-h-[calc(100vh-6rem)]">
    <h2 class="px-2 pb-3 pt-1 text-sm font-semibold text-base-content/70">
      {{ $t('settingsHub.nav.title') }}
    </h2>

    <nav class="menu menu-md gap-1 rounded-box p-0" aria-label="Settings sections">
      <li v-for="item in navItems" :key="item.id">
        <router-link
          :to="item.to"
          class="group flex items-center gap-2 px-3 py-2"
          :class="{
            'bg-primary/15 text-primary font-semibold border-r-4 border-primary': activeName === item.to.name,
          }"
        >
          <component :is="item.icon" class="h-5 w-5 shrink-0" />
          <span class="truncate text-sm">{{ $t(item.labelKey) }}</span>
        </router-link>
      </li>
    </nav>
  </aside>
</template>

