<script setup lang="ts">
import { iTask } from '../../../types/taskTypes'
import { computed, onMounted } from 'vue'
import { useLayoutStore } from '@/stores/layout'
import { useBoardLoading } from '@/composables/useBoardLoading'
import { useTasksStore } from '@/stores/tasks'
import { uiLog } from '@/utils/logger'
import { useRouter, useRoute } from 'vue-router'

const props = defineProps({
  task: {
    type: Object as () => iTask,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const layoutStore = useLayoutStore()
const { isBoardLoading } = useBoardLoading()
const tasksStore = useTasksStore()
const router = useRouter()
const route = useRoute()

onMounted(() => {
  uiLog.debug('Mounted', { taskId: props.task.id })
})

const childCount = computed(() => {
  return (props.task as any).childCount || props.task.children?.length || 0
})

const hasSubBoard = computed(() => {
  const isContainer = (props.task as any).isContainer
  const planAccepted = (props.task as any).planAccepted
  const count = childCount.value
  uiLog.debug('hasSubBoard check', { taskId: props.task.id, isContainer, planAccepted, childCount: count })
  return isContainer && planAccepted && count > 0
})

const hasPlanPending = computed(() => {
  return (props.task as any).isContainer && !(props.task as any).planAccepted && childCount.value === 0
})

const hasDraftChildren = computed(() => {
  const isContainer = (props.task as any).isContainer
  const planAccepted = (props.task as any).planAccepted
  const count = childCount.value
  return isContainer && !planAccepted && count > 0
})

function navigateToSubBoard() {
  // Get projectId from route params (parent route uses :id)
  const projectId = Number(route.params.id)
  const parentId = props.task.id
  uiLog.debug('navigateToSubBoard', { projectId, parentId, routeParams: route.params })
  if (projectId && parentId) {
    router.push({ name: 'SubBoard', params: { id: projectId, parentId } })
  }
}

const MAX_CHARS = computed(() => Math.floor(56 * layoutStore.boardScale));

function plainTextFromRichHtml(raw: string | null | undefined): string {
  const html = String(raw || '');
  if (!html) return '';
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
  }
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

const truncatedDescription = computed(() => {
  const desc = plainTextFromRichHtml(props.task.description);
  if (!desc) return '';
  if (desc.length <= MAX_CHARS.value) return desc;
  let result = '';
  for (const word of desc.split(' ')) {
    if ((result + (result ? ' ' : '') + word).length > MAX_CHARS.value) break;
    result += (result ? ' ' : '') + word;
  }
  return result + '...';
});

const isTruncated = computed(() => {
  const desc = plainTextFromRichHtml(props.task.description);
  return desc.length > MAX_CHARS.value;
});

function openTaskDialog() {
  if (isBoardLoading.value) {
    // Show a loading spinner or toast instead of opening the dialog
    layoutStore.openDialog({
      title: 'Loading...',
      component: 'LoadingSpinnerDialog',
      size: 'sm',
      hideHeader: true,
    })
    return
  }
  uiLog.debug('openTaskDialog', { tasksStoreItems: tasksStore.items, task: props.task })
  layoutStore.openDialog({
    title: props.task.name,
    component: 'TaskDialog',
    item: props.task,
    hideHeader: true,
    size: '5xl',
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    openTaskDialog();
    e.preventDefault();
  }
}
</script>

<template>
  <div
    class="card w-full h-[138px] min-w-0 bg-base-100/60 shadow-xl cursor-pointer select-none transition-[width,opacity,transform] duration-200 ease-in-out hover:scale-105 hover:-rotate-1"
    :class="{ 'opacity-50 pointer-events-none': disabled, 'border-2': (task as any).planAccepted }"
    :style="(task as any).planAccepted && (task as any).subBoardOutlineColor ? { borderColor: (task as any).subBoardOutlineColor } : { borderColor: '' }"
    @dblclick="openTaskDialog"
    tabindex="0"
    @keydown="onKeydown"
  >
    <div class="card-body p-4 flex flex-col gap-2 min-h-0 flex-1">
      <span
        class="card-title font-bold text-base truncate mb-1"
        :title="task.name"
      >
        {{ task.name }}
        <span v-if="(task as any).isContainer" class="badge badge-xs badge-outline ml-1">⧉</span>
      </span>
      <!-- Container badge with child count or plan pending -->
      <div v-if="hasSubBoard || hasPlanPending || hasDraftChildren" class="mt-auto">
        <span
          v-if="hasSubBoard"
          class="badge badge-sm badge-primary cursor-pointer hover:badge-secondary"
          :title="'View ' + childCount + ' sub-tasks'"
          @click.stop="navigateToSubBoard"
        >
          📁 {{ childCount }} sub-tasks
        </span>
        <span
          v-else-if="hasDraftChildren"
          class="badge badge-sm badge-info cursor-pointer hover:badge-secondary"
          :title="'View ' + childCount + ' draft sub-tasks'"
          @click.stop="navigateToSubBoard"
        >
          📝 {{ childCount }} draft sub-tasks
        </span>
        <span v-else-if="hasPlanPending" class="badge badge-sm badge-warning">
          📝 Plan pending
        </span>
      </div>
      <span
        class="mt-1 block overflow-hidden text-ellipsis whitespace-normal break-words text-base-content/80 description-clamp"
        :title="isTruncated ? plainTextFromRichHtml(task.description) : ''"
        tabindex="0"
        :aria-label="isTruncated ? plainTextFromRichHtml(task.description) : undefined"
      >
        {{ truncatedDescription }}
      </span>
    </div>
    <div class="card-actions flex flex-row justify-between items-center px-4 pb-3 pt-0">
      <span class="badge badge-outline text-xs font-mono">{{ task.identifier }}</span>
      <span v-if="task.assignee" class="avatar w-6 h-6">
        <img :src="task.assignee.avatarUrl" alt="assignee" class="rounded-full w-6 h-6 object-cover" />
      </span>
      <span v-else class="avatar w-6 h-6">
        <img src="../../../assets/images/defaultUser.png" alt="" class="rounded-full w-6 h-6 object-cover" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.description-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
