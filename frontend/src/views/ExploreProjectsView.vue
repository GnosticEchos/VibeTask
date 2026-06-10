<script setup lang="ts">
import { ref, /* watch, */ onMounted, onUnmounted, computed } from 'vue'
import ProjectHierarchy from '../components/dashboard/explore/ProjectHierarchy.vue'
import PlanningDraftsDrawer from '../components/dashboard/explore/PlanningDraftsDrawer.vue'
import { useProjectsSummaryQuery, type ProjectsSummaryScope } from '@/composables/useProjectsSummaryQuery'
import { useDraftProjectsQuery } from '@/composables/useDraftProjectsQuery'
import { useSearch } from '@/composables/useSearch'
import { useLayoutStore } from '@/stores/layout'
import SearchInput from '@/components/search/SearchInput.vue'
import SearchResultsOverlay from '@/components/search/SearchResultsOverlay.vue'
import { uiLog } from '@/utils/logger'
import type { iTask } from '@/types/taskTypes'

const summaryScope = ref<ProjectsSummaryScope>('main')
const { data: projects, isLoading, isError } = useProjectsSummaryQuery(summaryScope)
const { data: draftProjects } = useDraftProjectsQuery()
const draftsDrawerOpen = ref(false)
const draftCount = computed(() => draftProjects.value?.length ?? 0)
const layoutStore = useLayoutStore()

// Search composable for cross-project search (no projectId filter)
const search = useSearch()

// Open task dialog from search results
function openTaskFromSearch(task: iTask) {
  layoutStore.openDialog({
    title: task.name,
    component: 'TaskDialog',
    item: task,
    hideHeader: true,
    size: '5xl',
  })
}

onMounted(() => {
  uiLog.debug('Mounted', { projects: projects.value, isLoading: isLoading.value, isError: isError.value })
})

onUnmounted(() => {
  uiLog.debug('Unmounted')
})

// watch(projects, (newProjects) => {
//   console.log('[ExploreProjectsView] Projects data updated:', JSON.parse(JSON.stringify(newProjects)))
// }, { deep: true })

// watch(isLoading, (loading) => {
//   console.log('[ExploreProjectsView] isLoading watcher triggered:', loading)
// })

// watch(isError, (error) => {
//   console.log('[ExploreProjectsView] isError watcher triggered:', error)
// })
</script>

<template>
  <div class="flex min-h-screen w-full bg-gradient-to-br from-primary to-secondary to-80% text-base-content">
    <div class="min-w-0 flex-1">
      <!-- Search bar -->
      <div class="px-4 py-3">
        <SearchInput
          v-model="search.searchQuery.value"
          :show-help="true"
          @search="search.search"
          @clear="search.clearSearch"
        />
        <div class="mt-3 flex items-center gap-2">
          <span class="text-xs text-base-content/70">Explore scope:</span>
          <button
            type="button"
            class="btn btn-xs"
            :class="summaryScope === 'main' ? 'btn-primary' : 'btn-ghost'"
            @click="summaryScope = 'main'"
          >
            Main board
          </button>
          <button
            type="button"
            class="btn btn-xs"
            :class="summaryScope === 'all' ? 'btn-primary' : 'btn-ghost'"
            @click="summaryScope = 'all'"
          >
            All tasks
          </button>
          <button
            type="button"
            class="btn btn-xs ml-auto"
            :class="draftCount > 0 ? 'btn-warning' : 'btn-ghost'"
            @click="draftsDrawerOpen = !draftsDrawerOpen"
          >
            Drafts
            <span class="badge badge-xs">{{ draftCount }}</span>
          </button>
        </div>
      </div>

      <!-- Search results overlay -->
      <SearchResultsOverlay
        :is-open="search.isOverlayOpen.value"
        :tasks="search.results.value"
        :total="search.total.value"
        :page="search.currentPage.value"
        :limit="search.limit.value"
        :is-loading="search.isLoading.value"
        @close="search.closeOverlay"
        @page-change="search.goToPage"
        @open-task="openTaskFromSearch"
      />

      <div v-if="isLoading" class="mt-8 flex justify-center" aria-busy="true">
        <div class="flex gap-4">
          <div v-for="n in 3" :key="n" class="skeleton h-40 w-32 rounded"></div>
        </div>
      </div>

      <div v-else-if="isError" class="alert alert-error mx-4 mt-8 shadow-lg">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>Error loading projects. Please try again later.</span>
        </div>
      </div>

      <div v-else-if="projects && projects.length" class="flex flex-wrap">
        <ProjectHierarchy :projects="projects" :scope="summaryScope" />
      </div>

      <div v-else class="alert alert-info mx-4 mt-8 shadow-lg">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="h-6 w-6 shrink-0 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span>No projects found. Create a new project to get started.</span>
        </div>
      </div>
    </div>

    <PlanningDraftsDrawer v-model:open="draftsDrawerOpen" />
  </div>
</template>

