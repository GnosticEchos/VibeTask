<script setup lang="ts">
import { ref, /* watch, */ onMounted, onUnmounted } from 'vue'
import ProjectHierarchy from '../components/dashboard/explore/ProjectHierarchy.vue'
import { useProjectsSummaryQuery, type ProjectsSummaryScope } from '@/composables/useProjectsSummaryQuery'
import { useSearch } from '@/composables/useSearch'
import { useLayoutStore } from '@/stores/layout'
import SearchInput from '@/components/search/SearchInput.vue'
import SearchResultsOverlay from '@/components/search/SearchResultsOverlay.vue'
import { uiLog } from '@/utils/logger'
import type { iTask } from '@/types/taskTypes'

const summaryScope = ref<ProjectsSummaryScope>('main')
const { data: projects, isLoading, isError } = useProjectsSummaryQuery(summaryScope)
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
  <div class="bg-gradient-to-br from-primary to-secondary to-80% text-base-content min-h-screen w-full">
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

    <div v-if="isLoading" class="flex justify-center mt-8" aria-busy="true">
      <div class="flex gap-4">
        <div v-for="n in 3" :key="n" class="skeleton rounded w-32 h-40"></div>
      </div>
    </div>
    
    <div v-else-if="isError" class="alert alert-error shadow-lg mt-8 mx-4">
      <div>
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>Error loading projects. Please try again later.</span>
      </div>
    </div>
    
    <div v-else-if="projects && projects.length" class="flex flex-wrap">
      <ProjectHierarchy :projects="projects" :scope="summaryScope" />
    </div>
    
    <div v-else class="alert alert-info shadow-lg mt-8 mx-4">
      <div>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current flex-shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span>No projects found. Create a new project to get started.</span>
      </div>
    </div>
  </div>
</template>

