<script setup lang="ts">
// TODO: Replace with DaisyUI Spinner
// window.alert('TODO: Replace with DaisyUI Spinner')
import useResizableTable from '../../../composables/useResizableTable'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '../../../stores/project'
import { storeToRefs } from 'pinia'
import { iTask } from '../../../types/taskTypes'
import { formatDate, getDisplayName } from '../../../utils/functions'
import { computed, ref, watch, onMounted, watchEffect } from 'vue'
import { useProjectQuery } from '@/composables/useProjectQuery'
import 'data-grid-vue/style'
import { Field, DataType, FilterOperator, type Column, type FieldValueGetter } from 'data-grid-vue'
import { useBacklogStore } from '../../../stores/backlog'
import { storeToRefs as storeToRefsBacklog } from 'pinia'
import { useMembersStore } from '@/stores/members'
import { storeToRefs as storeToRefsMembers } from 'pinia'
import { useTasksStore } from '@/stores/tasks'
const membersStore = useMembersStore()
const { items: membersRaw } = storeToRefsMembers(membersStore)
const backlogStore = useBacklogStore()
const { items: backlogStoreItems, isLoading: backlogLoading } = storeToRefsBacklog(backlogStore)

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
useResizableTable()
const tasksStore = useTasksStore()
const { items } = storeToRefs(tasksStore)

const projectId = computed(() => projectStore.selectedProjectId ?? 0)
const { data: projectData, isLoading: projectLoading } = useProjectQuery(projectId.value)


// Flatten all tasks from all columns in the board API response
const columnTasks = computed(() => {
  if (!projectData.value || !projectData.value.columns) return []
  return projectData.value.columns.flatMap(col => col.tasks || [])
})

// Find unassociated tasks in the board API response
const boardBacklogTasks = computed(() => {
  return columnTasks.value.filter((task: iTask) => task.projectColumnId === null)
})

const backlogError = ref('')
const localLoading = ref(true)

// Single source for backlog fetch: use BacklogStore when board API has no unassigned tasks
watch(
  [projectData, projectId],
  async ([data, id]) => {
    if (!data || !id || typeof id !== 'number' || id === 0) return
    if (boardBacklogTasks.value.length === 0) {
      try {
        await backlogStore.fetchBacklogTasks(id)
      } catch {
        backlogError.value = 'Failed to load backlog tasks.'
      }
    }
  },
  { immediate: true }
)

const backlogTasks = computed(() => {
  return boardBacklogTasks.value.length > 0 ? boardBacklogTasks.value : (backlogStoreItems.value || [])
})

function openTaskDialog(payload: { data?: unknown; row?: unknown } | unknown) {
  console.log('[openTaskDialog] payload:', payload)
  const p = payload as { data?: unknown; row?: unknown }
  const task = (p?.data ?? p?.row ?? payload) as { id?: number; name?: string } | undefined
  if (task?.id) {
    layoutStore.openDialog({
      title: task.name ?? 'Task',
      component: 'TaskDialog',
      item: task,
      hideHeader: true,
      size: '900px',
    });
  } else {
    console.warn('No valid task found in payload:', payload);
  }
}

function onTaskRowKeydown(e: KeyboardEvent, payload: { data?: unknown; row?: unknown } | unknown) {
  console.log('[onTaskRowKeydown] event:', e, 'payload:', payload);
  if (e.key === 'Enter' || e.key === ' ') {
    openTaskDialog(payload);
    e.preventDefault();
  }
}

// TODO: Add actions (e.g., assign column) that update the task and remove it from backlog

// On mount, initialize tasksStore.items with backlogTasks if not already present

// No need to fetchBacklogTasks here; it's preloaded in Board.vue

// Computed plainMembers array
const plainMembers = computed(() => {
  const arr = (membersRaw.value || []).map(m => ({ ...m, displayName: getDisplayName(m) }))
  console.log('[plainMembers] Hydrated:', arr)
  return arr
})

// On mount, ensure members are loaded
onMounted(() => {
  if (!plainMembers.value.length) {
    console.log('[ProjectBacklog] Fetching members from API...')
    membersStore.getItems()
  }
})

// Members readiness
const membersReady = computed(() => {
  const ready = Array.isArray(plainMembers.value) && plainMembers.value.length > 0 && plainMembers.value.every(m => m && (m.name || m.fullName || m.displayName))
  if (ready) {
    console.log('[Members Debug] Members are ready:', plainMembers.value.map(m => m.displayName))
  }
  return ready
})

// Combined loading state
const isLoading = computed(() => projectLoading.value || backlogLoading.value || !membersReady.value)

watch(
  backlogTasks,
  (newTasks) => {
    console.log('[Backlog Watcher] backlogTasks:', newTasks)
    console.log('[Backlog Watcher] backlogTasks types:', newTasks.map(t => typeof t))
    if (Array.isArray(newTasks) && newTasks.length > 0) {
      // Only update if store is empty or data is different
      if (
        items.value.length === 0 ||
        items.value.length !== newTasks.length ||
        items.value.some((t, i) => t.id !== newTasks[i].id)
      ) {
        items.value.splice(0, items.value.length, ...newTasks)
        console.log('[Backlog Watcher] Updated items.value:', items.value)
        console.log('[Backlog Watcher] Updated items.value types:', items.value.map(t => typeof t))
      }
    }
  },
  { immediate: true }
)

watch(() => backlogStore.items.length, (len) => {
  if (len > 0) localLoading.value = false;
});

// Utility to get assignee name from plainMembers array
function getAssigneeName(task: any) {
  if (task.assignee && typeof task.assignee === 'object' && task.assignee.id) {
    const member = plainMembers.value.find((m: any) => Number(m.userId ?? m.id) === Number(task.assignee.id))
    if (member) {
      console.log('[Assignee Debug] Found member:', member.displayName, 'for assignee id:', task.assignee.id)
      return member.displayName || member.name || member.fullName || 'Unassigned'
    } else {
      console.log('[Assignee Debug] No member found for assignee id:', task.assignee.id, task)
      const assigneeName = getDisplayName(task.assignee)
      return assigneeName !== 'Unknown' ? assigneeName : 'Unassigned'
    }
  }
  console.log('[Assignee Debug] No assignee or missing id:', task.assignee, task)
  return 'Unassigned'
}

// Flatten assigned tasks from all columns
const assignedTasks = computed(() =>
  (projectStore.project.columns || []).flatMap(col =>
    (col.tasks || []).map(task => ({
      ...task,
      status: col.name,
      assignee: getAssigneeName(task),
      createdAtRaw: task.createdAt || '', // ISO string for sorting/filtering
      createdAtDisplay: task.createdAt ? formatDate(task.createdAt) : '',
    }))
  )
)

// Backlog/unassigned tasks from backlog store
const unassignedTasks = computed(() =>
  (backlogStore.items || []).map(task => ({
    ...task,
    status: 'Backlog',
    assignee: getAssigneeName(task),
    createdAtRaw: task.createdAt || '', // ISO string for sorting/filtering
    createdAtDisplay: task.createdAt ? formatDate(task.createdAt) : '',
  }))
)

// Join both for the grid
const allGridTasks = computed(() => {
  const all = [
    ...unassignedTasks.value,
    ...assignedTasks.value,
  ].map(task => ({
    ...task,
    // Ensure title is present (fallback to name if needed)
    title: task.title || task.name || '',
    // Use createdAtRaw for sorting/filtering
    createdAt: task.createdAtRaw || '',
    createdAtDisplay: task.createdAtDisplay || '',
    description: task.description || '',
    // identifier, status, assignee already mapped
  }))
  console.log('[Grid Debug] allGridTasks count:', all.length);
  return all;
})

// FieldValueGetter for Created Date
const createdAtValueGetter: FieldValueGetter = (row: Record<string, unknown>) => {
  if (!row || row.createdAt == null) return ''
  const raw = row.createdAt
  const date = new Date(typeof raw === 'string' || typeof raw === 'number' ? raw : String(raw))
  if (isNaN(date.getTime())) return String(raw)
  // Format as yyyy-MM-dd HH:mm
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

// Define DataGrid columns with correct types and filter options
const gridColumns = ref<Column[]>([
  {
    field: new Field('id'),
    title: 'ID',
    dataType: DataType.number,
    sortable: true,
    filterable: false,
    isKey: true,
    width: '80px',
  },
  {
    field: new Field('identifier'),
    title: 'Task',
    dataType: DataType.alphanumeric,
    sortable: false,
    filterable: true,
    filterOptions: {
      operators: [FilterOperator.contains],
    },
    width: '110px',
  },
  {
    field: new Field('title'),
    title: 'Title',
    dataType: DataType.alphanumeric,
    sortable: true,
    filterable: true,
    filterOptions: {
      operators: [FilterOperator.contains],
    },
    width: '250px',
  },
  {
    field: new Field('description'),
    title: 'Description',
    dataType: DataType.alphanumeric,
    sortable: true,
    filterable: true,
    filterOptions: {
      operators: [FilterOperator.contains],
    },
    width: '300px',
  },
  {
    field: new Field('status'),
    title: 'Status',
    dataType: DataType.alphanumeric,
    sortable: true,
    filterable: true,
    filterOptions: {
      operators: [FilterOperator.contains],
    },
    width: '120px',
  },
  {
    field: new Field('assignee'),
    title: 'Assignee',
    dataType: DataType.alphanumeric,
    sortable: true,
    filterable: true,
    filterOptions: {
      operators: [FilterOperator.contains],
    },
    width: '140px',
  },
  {
    field: new Field('createdAt', createdAtValueGetter),
    title: 'Created Date',
    dataType: DataType.date,
    sortable: true,
    filterable: false,
    width: '140px',
  },
])

// Remove showFilters ref and button
watchEffect(() => {
  if (!isLoading.value) {
    console.log('[Grid Debug] Rendering grid with members:', plainMembers.value.map(m => m.displayName));
  }
  console.log('[Debug] projectStore.project.members:', projectStore.project.members);
  console.log('[Debug] assignedTasks:', assignedTasks.value.length, assignedTasks.value);
  console.log('[Debug] unassignedTasks:', unassignedTasks.value.length, unassignedTasks.value);
  console.log('[Debug] allGridTasks:', allGridTasks.value.length, allGridTasks.value);
});

// Add a reactive key to force grid refresh after sort
const gridKey = ref(0)
function onGridSort() {
  // Workaround: force grid to re-render to fix filtering after sorting
  gridKey.value++
}
</script>

<template>
  <div class="w-full h-full flex flex-col flex-grow min-w-0 overflow-x-auto p-4">
    <div v-if="backlogError" class="alert alert-error shadow-lg mb-4">
      <span>{{ backlogError }}</span>
    </div>
    <div v-if="isLoading" class="flex justify-center items-center h-full">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
    <div v-else-if="!allGridTasks.length" class="text-center text-gray-500 py-4">
      No backlog tasks found.
    </div>
    <dgv-data-grid
      :key="gridKey"
      v-model:columns="gridColumns"
      :data="allGridTasks"
      rowKey="id"
      rowMode="true"
      rowSelectionMode="single"
      dragDropMode="row"
      :showColumnSelection="true"
      :allowColumnReorder="true"
      :sort-options="{ sortable: true, multiColumn: false }"
      @rowClick="openTaskDialog"
      @rowDblClick="openTaskDialog"
      @rowKeydown="onTaskRowKeydown"
      @sort="onGridSort"
      class="bg-base-100 text-base-content rounded-box shadow-lg"
    >
    </dgv-data-grid>
  </div>
</template>
