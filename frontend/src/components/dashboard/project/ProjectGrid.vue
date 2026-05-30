<template>
  <div class="w-full min-h-screen bg-gradient-to-br from-primary to-secondary to-80%">
    <div v-if="isLoading" class="flex justify-center items-center p-8">
      <span class="loading loading-spinner loading-lg text-primary" />
    </div>
    <template v-else>
      <div class="px-4 py-2">
        <SearchInput
          v-model="search.searchQuery.value"
          :show-help="true"
          @search="search.search"
          @clear="search.clearSearch"
        />
      </div>

      <SearchResultsOverlay
        :is-open="search.isOverlayOpen.value"
        :tasks="search.results.value"
        :total="search.total.value"
        :page="search.currentPage.value"
        :limit="search.limit.value"
        :is-loading="search.isLoading.value"
        :project-name="projectStore.project?.name"
        @close="search.closeOverlay"
        @page-change="search.goToPage"
        @open-task="openTaskFromSearch"
      />

      <TaskWall
        v-if="isWallMode"
        :tasks="wallTasks"
        :wall-mode="wallMode"
        :is-loading="wallLoading"
        @updated="() => { backlogStore.fetchBacklogTasks(projectId); archiveStore.fetchArchivedTasks(projectId) }"
      />

      <div v-else class="card bg-base-100/60 shadow-xl border border-base-200 p-4 flex flex-col min-h-0 mx-4 mb-4 mt-2">
        <div class="card-body flex flex-col min-h-0 p-4">
          <h2 class="card-title mb-4 flex-none">{{ $t('views.project_grid') }}</h2>
          <div class="flex-1 min-h-0 overflow-auto">
          <div class="table table-zebra w-full bg-base-100" tabindex="0" role="grid" :aria-label="$t('views.project_grid')">
            <!-- Table header -->
            <div class="table-header-group">
              <div class="table-row bg-base-300 border-b border-base-300">
                <div class="table-cell w-8"></div>
                <div v-for="column in columns" :key="column.accessorKey" :style="column.style" class="table-cell align-middle">
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs h-auto min-h-0 px-1 py-1 gap-1 font-bold normal-case text-base-content hover:bg-base-200/80 inline-flex items-center"
                    :aria-sort="ariaSortFor(column.accessorKey)"
                    :aria-label="sortAriaLabel(column)"
                    @click="onSortColumn(column.accessorKey)"
                  >
                    {{ column.header }}
                    <ChevronUpIcon
                      v-if="sortKey === column.accessorKey && sortDir === 'asc'"
                      class="w-4 h-4 shrink-0"
                      aria-hidden="true"
                    />
                    <ChevronDownIcon
                      v-else-if="sortKey === column.accessorKey && sortDir === 'desc'"
                      class="w-4 h-4 shrink-0"
                      aria-hidden="true"
                    />
                    <ArrowsUpDownIcon v-else class="w-3.5 h-3.5 shrink-0 opacity-40" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            <!-- Draggable table body -->
            <div class="table-row-group">
              <VueDraggable
                v-model="localTableData"
                tag="div"
                :animation="150"
                class="contents"
                @end="onDragEnd"
                :ghost-class="'opacity-50'"
                :chosen-class="'ring-primary'"
                :force-fallback="true"
                item-key="id"
                :aria-label="$t('views.project_grid')"
              >
                <div
                  v-for="(row, rowIndex) in localTableData"
                  :key="row.id"
                  :class="['table-row hover:bg-base-200 focus:bg-primary/20 cursor-pointer group', rowIndex % 2 === 1 ? 'bg-base-200' : '']"
                  tabindex="0"
                  role="row"
                  @dblclick="openTaskDialog(row)"
                  @keydown.enter.prevent="openTaskDialog(row)"
                  @keydown.space.prevent="openTaskDialog(row)"
                  :aria-label="String(row.identifier || row.title || row.id)"
                >
                  <div class="table-cell w-8 text-center align-middle">
                    <span class="cursor-move" :aria-label="$t('board.dragReorderGridRow')" :title="$t('board.dragReorderGridRow')">≡</span>
                  </div>
                  <div v-for="column in columns" :key="column.accessorKey" class="table-cell text-base-content" :style="column.style">
                    <span
                      v-if="column.accessorKey === 'title'"
                      class="truncate block max-w-[280px]"
                      :title="titleCellTitle(row.title)"
                    >
                      {{ row.title }}
                    </span>
                    <span
                      v-else-if="column.accessorKey === 'description'"
                      class="truncate block max-w-[280px]"
                      :title="descriptionTitleAttr(row.description)"
                    >
                      {{ descriptionPreview(row.description) }}
                    </span>
                    <span
                      v-else-if="column.accessorKey === 'status'"
                      class="inline-flex items-center gap-1 max-w-[200px] min-w-0"
                    >
                      <span class="truncate shrink min-w-0">{{ String(row.status || '') }}</span>
                      <span
                        v-if="typeof row.statusDescription === 'string' && row.statusDescription.length > 0"
                        class="tooltip tooltip-top shrink-0 text-base-content/70 hover:text-base-content"
                        :data-tip="row.statusDescription"
                        tabindex="0"
                        role="img"
                        :aria-label="$t('board.columnDescription')"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          class="inline-block w-3.5 h-3.5 stroke-current"
                          aria-hidden="true"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </span>
                    </span>
                    <span v-else>
                      {{ row[column.accessorKey] }}
                    </span>
                  </div>
                </div>
              </VueDraggable>
            </div>
          </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '@/stores/project'
import { useBacklogStore } from '@/stores/backlog'
import { useMembersStore } from '@/stores/members'
import { useTasksStore } from '@/stores/tasks'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import { ChevronDownIcon, ChevronUpIcon, ArrowsUpDownIcon } from '@heroicons/vue/24/outline'
import { formatDate, getDisplayName } from '@/utils/functions'
import { useLayoutStore } from '@/stores/layout'
import { useSearch } from '@/composables/useSearch'
import SearchInput from '@/components/search/SearchInput.vue'
import SearchResultsOverlay from '@/components/search/SearchResultsOverlay.vue'
import type { iTask } from '@/types/taskTypes'
import type { iColumn } from '@/types/columnTypes'
import api from '@/api/v1/indexApi'
import { validateId } from '@/utils/validation'
import { applyBoardTaskScope } from '@/utils/boardTaskScope'
import TaskWall from '@/components/dashboard/tasks/TaskWall.vue'
import type { ProjectBoardCountMode } from '@/types/projectBoardScope'
import { isWallCountMode } from '@/types/projectBoardScope'
import { useArchiveStore } from '@/stores/archive'

const props = withDefaults(defineProps<{
  taskCountMode?: ProjectBoardCountMode
}>(), {
  taskCountMode: 'main',
})

const route = useRoute()
const { t } = useI18n()
const projectStore = useProjectStore()
const backlogStore = useBacklogStore()
const archiveStore = useArchiveStore()
const membersStore = useMembersStore()
const tasksStore = useTasksStore()
const layoutStore = useLayoutStore()

const projectId = computed(() => validateId(route.params.id) ?? 0)

const { data: boardData, isLoading: boardLoading } = useQuery({
  queryKey: ['board', projectId],
  queryFn: () => api.getProjectBoard(Number(projectId.value)),
  enabled: computed(() => projectId.value > 0),
  refetchOnMount: 'always',
})

function isReviewColumn(col: iColumn): boolean {
  const name = String(col.name || '').toLowerCase()
  const type = String((col as { roleType?: string }).roleType || '').toUpperCase()
  return name.includes('agent review') || type === 'AGENT_REVIEW'
}

const scopedBoardColumns = computed(() => {
  const columns = (boardData.value?.columns || projectStore.project.columns || []) as iColumn[]
  const scoped =
    props.taskCountMode === 'all'
      ? applyBoardTaskScope(columns, null, { includeAllAssignedTasks: true })
      : applyBoardTaskScope(columns, null, { includeNestedReviewOnMain: true })
  return scoped.filter((col) => !isReviewColumn(col))
})

// Search composable for this project
const search = useSearch({ projectId: projectId.value })

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

const { items: backlogItems } = storeToRefs(backlogStore)
const { items: archiveItems, isLoading: archiveLoading } = storeToRefs(archiveStore)
const { items: membersRaw } = storeToRefs(membersStore)

const isWallMode = computed(() => isWallCountMode(props.taskCountMode))

const wallTasks = computed(() => {
  if (props.taskCountMode === 'backlog') return backlogItems.value as iTask[]
  if (props.taskCountMode === 'archive') return archiveItems.value as iTask[]
  return []
})

const wallLoading = computed(() => {
  if (props.taskCountMode === 'backlog') return backlogStore.isLoading
  if (props.taskCountMode === 'archive') return archiveLoading.value
  return false
})

const wallMode = computed(() =>
  props.taskCountMode === 'backlog' || props.taskCountMode === 'archive'
    ? props.taskCountMode
    : 'backlog',
)

const isLoading = computed(() => {
  if (isWallMode.value) return wallLoading.value || !membersRaw.value.length
  return (
    projectStore.loading ||
    backlogStore.isLoading ||
    boardLoading.value ||
    !membersRaw.value.length
  )
})

const plainMembers = computed(() => (membersRaw.value || []).map(m => ({ ...m, displayName: getDisplayName(m) })))

function getAssigneeName(task: any) {
  if (task.assignee && typeof task.assignee === 'object' && task.assignee.id) {
    const member = plainMembers.value.find((m: any) => Number(m.userId ?? m.id) === Number(task.assignee.id))
    if (member) return member.displayName || member.name || member.fullName || 'Unassigned'
    const assigneeName = getDisplayName(task.assignee)
    return assigneeName !== 'Unknown' ? assigneeName : 'Unassigned'
  }
  return 'Unassigned'
}

function plainTextFromRichHtml(raw: string | undefined): string {
  const html = String(raw || '')
  if (!html) return ''
  if (typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.innerHTML = html
    return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim()
  }
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

const DESC_PREVIEW_LEN = 72
const DESC_TITLE_MAX = 2000

function descriptionPreview(raw: string | undefined): string {
  const text = plainTextFromRichHtml(raw)
  if (text.length <= DESC_PREVIEW_LEN) return text
  return `${text.slice(0, DESC_PREVIEW_LEN)}…`
}

function descriptionTitleAttr(raw: string | undefined): string {
  const text = plainTextFromRichHtml(raw)
  if (text.length <= DESC_TITLE_MAX) return text
  return `${text.slice(0, DESC_TITLE_MAX)}…`
}

function titleCellTitle(title: string | undefined): string {
  const s = String(title || '')
  return plainTextFromRichHtml(s) || s
}

type GridSortColumn = 'identifier' | 'title' | 'description' | 'status' | 'assignee' | 'createdAtDisplay'

interface GridRow {
  id: number
  identifier?: string
  title?: string
  description?: string
  status?: string
  statusDescription?: string
  assignee?: string
  projectColumnId?: number | ''
  createdAt?: string
  createdAtDisplay?: string
  [key: string]: unknown
}

const assignedTasks = computed(() =>
  scopedBoardColumns.value.flatMap((col) =>
    (col.tasks || []).map((task) => ({
      identifier: task.identifier ?? '',
      title: (task as { title?: string; name?: string }).title || (task as { name?: string }).name || '',
      description: task.description || '',
      status: col.name || '',
      statusDescription: col.description || '',
      assignee: getAssigneeName(task),
      createdAt: task.createdAt || '',
      createdAtDisplay: task.createdAt ? formatDate(task.createdAt) : '',
      id: task.id,
      projectId: projectStore.project.id,
      projectColumnId: task.projectColumnId,
    })),
  ),
)

const unassignedTasks = computed(() =>
  (backlogItems.value || []).map(task => ({
    identifier: task.identifier ?? '',
    title: task.title || task.name || '',
    description: task.description || '',
    status: 'Backlog',
    statusDescription: '',
    assignee: getAssigneeName(task),
    createdAt: task.createdAt || '',
    createdAtDisplay: task.createdAt ? formatDate(task.createdAt) : '',
    id: task.id,
    projectId: projectStore.project.id,
    projectColumnId: task.projectColumnId ?? '',
  }))
)

const tableData = computed(() => [
  ...unassignedTasks.value,
  ...assignedTasks.value,
])

function deepCloneRows(rows: GridRow[]) {
  return (rows || []).map((row: GridRow) => ({ ...row }))
}

const localTableData = ref<GridRow[]>([])

const sortKey = ref<GridSortColumn | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')

function compareRows(a: GridRow, b: GridRow, key: GridSortColumn, dir: number): number {
  if (key === 'description') {
    const da = plainTextFromRichHtml(a.description)
    const db = plainTextFromRichHtml(b.description)
    return dir * da.localeCompare(db, undefined, { sensitivity: 'base' })
  }
  if (key === 'createdAtDisplay') {
    const ta = String(a.createdAt || '')
    const tb = String(b.createdAt || '')
    return dir * ta.localeCompare(tb)
  }
  if (key === 'identifier') {
    return dir * String(a.identifier || '').localeCompare(String(b.identifier || ''), undefined, { numeric: true, sensitivity: 'base' })
  }
  const va = String(a[key] ?? '')
  const vb = String(b[key] ?? '')
  return dir * va.localeCompare(vb, undefined, { sensitivity: 'base' })
}

function onSortColumn(key: GridSortColumn) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
  const k = sortKey.value!
  const dir = sortDir.value === 'asc' ? 1 : -1
  localTableData.value = [...localTableData.value].sort((a, b) => compareRows(a, b, k, dir))
}

function ariaSortFor(key: GridSortColumn): 'none' | 'ascending' | 'descending' {
  if (sortKey.value !== key) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

type GridColumnDef = { accessorKey: GridSortColumn; header: string; style: string }

const columns = computed((): GridColumnDef[] => [
  {
    accessorKey: 'identifier',
    header: t('tasks.task'),
    style: 'width: 110px; min-width: 110px; max-width: 110px;',
  },
  {
    accessorKey: 'title',
    header: t('tasks.name'),
    style: 'width: 250px; min-width: 150px; max-width: 250px;',
  },
  {
    accessorKey: 'description',
    header: t('tasks.description'),
    style: 'width: 300px; min-width: 150px; max-width: 300px;',
  },
  {
    accessorKey: 'status',
    header: t('tasks.status'),
    style: 'width: 120px; min-width: 100px; max-width: 120px;',
  },
  {
    accessorKey: 'assignee',
    header: t('tasks.assignee'),
    style: 'width: 140px; min-width: 100px; max-width: 140px;',
  },
  {
    accessorKey: 'createdAtDisplay',
    header: t('backlog.createdAt'),
    style: 'width: 140px; min-width: 100px; max-width: 140px;',
  },
])

function sortAriaLabel(column: GridColumnDef): string {
  const order =
    sortKey.value === column.accessorKey
      ? sortDir.value === 'asc'
        ? t('board.sortAscending')
        : t('board.sortDescending')
      : ''
  const base = t('board.sortColumn', { column: column.header })
  return order ? `${base} (${order})` : base
}

watch(tableData, (newData) => {
  sortKey.value = null
  sortDir.value = 'asc'
  localTableData.value = deepCloneRows(newData as GridRow[])
}, { immediate: true })

function openTaskDialog(task: any) {
  if (task && task.id) {
    layoutStore.openDialog({
      title: task.title || task.name,
      component: 'TaskDialog',
      item: task,
      hideHeader: true,
      size: '900px',
    })
  }
}

function onDragEnd(_evt: unknown) {
  tasksStore.updateBacklogOrder([...localTableData.value] as unknown as import('@/types/taskTypes').iTask[])
}

onMounted(() => {
  if (!plainMembers.value.length) {
    membersStore.getItems()
  }
  if (projectId.value) {
    backlogStore.fetchBacklogTasks(projectId.value)
    archiveStore.fetchArchivedTasks(projectId.value)
  }
})

watch(
  () => projectId.value,
  (newId) => {
    if (newId) {
      backlogStore.fetchBacklogTasks(newId)
      archiveStore.fetchArchivedTasks(newId)
    }
  },
)

watch(
  () => props.taskCountMode,
  (mode) => {
    if (!projectId.value) return
    if (mode === 'backlog') backlogStore.fetchBacklogTasks(projectId.value)
    if (mode === 'archive') archiveStore.fetchArchivedTasks(projectId.value)
  },
)
</script>

<style scoped>
.material-icons {
  font-family: 'Material Icons', sans-serif;
  font-style: normal;
  font-weight: normal;
  font-size: 20px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}
</style>
