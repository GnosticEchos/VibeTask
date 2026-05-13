<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useProjectsQuery } from '@/composables/useProjectsQuery'
import { useLayoutStore } from '@/stores/layout'
// Heroicons
import { Cog8ToothIcon, ClipboardDocumentCheckIcon, ClipboardDocumentListIcon, SwatchIcon, SparklesIcon, AdjustmentsHorizontalIcon } from '@heroicons/vue/24/outline'
import AccountRobotIcon from '@/components/icons/AccountRobotIcon.vue'

const authStore = useAuthStore()
const { data: projects } = useProjectsQuery()
const layoutStore = useLayoutStore()

// State for submenu open/close
const openSubmenu = ref('') // '' | 'boards' | 'settings'
const settingsSubmenuOpen = ref(false)

function handleSubmenu(name: string) {
  openSubmenu.value = openSubmenu.value === name ? '' : name
}

function toggleSettingsSubmenu() {
  settingsSubmenuOpen.value = !settingsSubmenuOpen.value
}

function openThemeSelector() {
  layoutStore.openDialog({
    title: 'Theme Switcher',
    component: 'ThemeSwitcherDialog',
  })
}
</script>

<template>
  <div class="navbar bg-base-100 shadow-md border-b border-base-300 w-full fixed top-0 left-0 right-0 z-50 min-h-[3.5rem] h-14 py-2">
    <!-- Left: Hamburger + App Title/Logo -->
    <div class="navbar-start flex items-center gap-2">
      <div class="dropdown dropdown-bottom">
        <label tabindex="0" class="btn btn-ghost btn-circle p-1" aria-label="Open main menu">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </label>
        <ul tabindex="0" class="menu menu-sm dropdown-content mt-2 z-[1] p-2 shadow bg-base-100 rounded-box w-64">
          <!-- Projects -->
          <li>
            <router-link to="/dashboard/explore">
              <span class="inline-flex items-center gap-2">
                <ClipboardDocumentCheckIcon class="w-5 h-5" />
                Projects
              </span>
            </router-link>
          </li>
          <!-- Boards Submenu -->
          <li>
            <button class="menu-title inline-flex items-center gap-2 cursor-pointer w-full text-left" @click="handleSubmenu('boards')" :aria-expanded="openSubmenu === 'boards'">
              <ClipboardDocumentListIcon class="w-5 h-5" />
              Boards
              <span class="ml-auto">&#9654;</span>
            </button>
            <ul v-if="openSubmenu === 'boards'" class="menu menu-sm bg-base-100 rounded-box shadow w-56 ml-2 mt-1">
              <li v-for="project in projects" :key="project.id">
                <router-link :to="{ name: 'Board', params: { id: project.id } }">
                  <span class="inline-flex items-center gap-2">
                    <ClipboardDocumentListIcon class="w-4 h-4" />
                    {{ project.name }}
                  </span>
                </router-link>
              </li>
            </ul>
          </li>
          <!-- Settings Submenu -->
          <li>
            <div class="flex items-center justify-between">
              <router-link
                to="/dashboard/settings"
                class="flex items-center gap-2 w-full"
                @click.stop
                tabindex="0"
                aria-label="Go to Settings page"
              >
                <Cog8ToothIcon class="w-5 h-5" />
                <span>Settings</span>
              </router-link>
              <button
                class="btn btn-ghost btn-xs ml-2"
                @click.stop="toggleSettingsSubmenu"
                :aria-expanded="settingsSubmenuOpen"
                aria-label="Expand Settings submenu"
                tabindex="0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <ul v-if="settingsSubmenuOpen" class="menu menu-vertical ml-6">
              <li>
                <router-link :to="{ name: 'SettingsAccount' }">
                  <AccountRobotIcon class="w-5 h-5" /> Account
                </router-link>
              </li>
              <li>
                <button @click="openThemeSelector"><SwatchIcon class="w-5 h-5" /> Theme Selector</button>
              </li>
              <li>
                <router-link :to="{ name: 'SettingsThemeBuilder' }">
                  <SparklesIcon class="w-5 h-5" /> Theme Playground
                </router-link>
              </li>
              <li>
                <router-link :to="{ name: 'SettingsAdmin' }">
                  <AdjustmentsHorizontalIcon class="w-5 h-5" /> Administration
                </router-link>
              </li>
            </ul>
          </li>
          <!-- Logout -->
          <li>
            <button @click.prevent="authStore.logout()" class="w-full text-left">
              <span class="inline-flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7"/></svg>
                Logout
              </span>
            </button>
          </li>
        </ul>
      </div>
      <router-link to="/dashboard/explore" class="btn btn-ghost text-2xl font-bold text-primary normal-case p-1 leading-none">Vibe Tasks</router-link>
    </div>
    <div class="navbar-center flex-1 px-4"></div>
    <!-- Right: (empty for now) -->
    <div class="navbar-end"></div>
  </div>
</template>