<script setup lang="ts">
import projectApi from '@/api/v1/projectApi'
import { useLayoutStore } from '@/stores/layout'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopbarTemplate from '../TopbarTemplate.vue'

const layoutStore = useLayoutStore()

const route = useRoute()
const router = useRouter()

// Workspace switcher
const projectId = computed(() => Number(route.params.id))
const workspacesDropdownOpen = ref(false)
const isLoadingWorkspaces = ref(false)

// Active workspaces including draft (plan not yet accepted) containers
const activeWorkspaces = ref<Array<{ id: number; name: string; identifier: string; subBoardOutlineColor: string | null; planAccepted: boolean }>>([])

// Fetch workspaces when dropdown opens
watch(workspacesDropdownOpen, async (isOpen) => {
  if (isOpen && projectId.value) {
    isLoadingWorkspaces.value = true
    try {
      const response = await projectApi.getActiveWorkspaces(projectId.value)
      activeWorkspaces.value = response.data || []
    } catch (err) {
      console.error('Failed to fetch workspaces:', err)
      activeWorkspaces.value = []
    } finally {
      isLoadingWorkspaces.value = false
    }
  }
})

function selectWorkspace(workspaceId: number) {
  router.push({ name: 'Board', params: { id: projectId.value }, query: { workspace: String(workspaceId) } })
  workspacesDropdownOpen.value = false
}

function backToMainBoard() {
  router.push({ name: 'Board', params: { id: projectId.value }, query: {} })
  workspacesDropdownOpen.value = false
}
</script>

<template>
  <TopbarTemplate>
    <template v-slot:right>
      <div class="flex items-center justify-end gap-3 whitespace-nowrap">
        <div class="dropdown dropdown-end">
          <button
            type="button"
            tabindex="0"
            class="btn btn-ghost btn-xs gap-1"
            @click="workspacesDropdownOpen = !workspacesDropdownOpen"
          >
            <span>{{ $t('project.workspaceMenu') }}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
          <ul v-if="workspacesDropdownOpen" tabindex="0" class="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 rounded-box w-64">
            <li v-if="$route.query.workspace">
              <button type="button" @click="backToMainBoard">Back to Main Board</button>
            </li>
            <li class="menu-title"><span>{{ $t('project.activeWorkspaces') }}</span></li>
            <li v-if="isLoadingWorkspaces">
              <span class="text-base-content/50 text-xs">Loading...</span>
            </li>
            <li v-else-if="activeWorkspaces.length === 0">
              <span class="text-base-content/50 text-xs">{{ $t('project.noActiveWorkspaces') }}</span>
            </li>
            <li v-for="ws in activeWorkspaces" :key="ws.id">
              <button type="button" class="text-left" @click="selectWorkspace(ws.id)">
                <span class="w-2 h-2 rounded-full inline-block mr-1" :style="{ backgroundColor: ws.subBoardOutlineColor || 'var(--color-primary)' }"></span>
                <span v-if="!ws.planAccepted" class="badge badge-xs badge-info mr-1">DRAFT</span>
                {{ ws.identifier }}: {{ ws.name }}
              </button>
            </li>
          </ul>
        </div>
        <span class="text-xs text-base-content/60">Card size</span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          :value="layoutStore.boardScale"
          class="range range-xs range-primary w-24"
          aria-label="Card size"
          @input="layoutStore.setBoardScale(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="text-xs font-medium text-primary min-w-[3ch]">{{ Math.round(layoutStore.boardScale * 100) }}%</span>
      </div>
    </template>
  </TopbarTemplate>
</template>
