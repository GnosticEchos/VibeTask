<script setup lang="ts">
import { useLayoutStore } from '../../../../stores/layout'
import { useTasksStore } from '@/stores/tasks'
import { useColumnsStore } from '../../../../stores/columns'
import { useMembersStore } from '../../../../stores/members'
import type { iTask } from '../../../../types/taskTypes'
import { computed, onMounted, watch, ref, onBeforeUnmount, reactive } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useProjectStore } from '@/stores/project'
import { useRoute, useRouter } from 'vue-router'
import { planAcceptanceApi } from '@/api/v1/planAcceptanceApi'
import { useTaskDocLinkMutations, useTaskDocLinks } from '@/composables/useTaskDocLinks'
import { uiLog } from '@/utils/logger'
import { applyRelationFieldsToProjectColumns } from '@/utils/websocketTaskProjectColumns'
import {
  RELATION_UI_OPTIONS,
  normalizeRelationModeForApi,
  relationModeToUiLabel,
  relationUiLabelToApiMode,
} from '@/utils/taskRelationMode'
import type { iColumn } from '@/types/columnTypes'
import DialogTemplate from '../DialogTemplate.vue'
import { getDisplayName } from '../../../../utils/functions'
import api from '@/api/v1/indexApi'
import { documentsApi } from '@/api/v1/documentsApi'
import type { ProjectDocument } from '@/types/documentTypes'
import TaskActivityPanel from './task/TaskActivityPanel.vue'
import TaskCoreFields from './task/TaskCoreFields.vue'
import TaskDialogHeader from './task/TaskDialogHeader.vue'
import TaskLinkedDocumentsPanel from './task/TaskLinkedDocumentsPanel.vue'
import TaskRelationField from './task/TaskRelationField.vue'

// --- PROPS AND MERGED TASK (must come first) ---
const props = defineProps<{ open: boolean; task: iTask }>()

// Type alias for task with optional id/projectId (handles prop + store merge)
type TaskWithIds = iTask & { id?: number; projectId?: number }

const tasksStore = useTasksStore()
const mergedTask = computed<iTask | null>(() => {
  const base: Partial<iTask> = props.task && typeof props.task === 'object' ? props.task : {};
  const details: Partial<iTask> = tasksStore.item && typeof tasksStore.item === 'object' ? tasksStore.item : {};
  if (!('id' in base) && !('id' in details)) return null;
  return {
    ...(base as iTask),
    ...(details as iTask),
    comments: details.comments ?? base.comments ?? [],
    history: details.history ?? base.history ?? [],
    assignee: details.assignee ?? base.assignee ?? null,
    createdBy: details.createdBy ?? base.createdBy ?? null,
    relatedTask: details.relatedTask ?? base.relatedTask ?? null,
    docLinks: details.docLinks ?? base.docLinks ?? [],
    children: details.children ?? base.children ?? [],
  } as iTask;
});

// --- REST OF SCRIPT SETUP ---
const layoutStore = useLayoutStore()
const queryClient = useQueryClient()
const projectStore = useProjectStore()
const route = useRoute()
const router = useRouter()

const dialogItem = computed(() => layoutStore.dialog.item as iTask & { redirectedFromId?: number })

const modalTitleRef = ref<HTMLElement | null>(null)
let lastActiveElement: Element | null = null

onMounted(() => {
  lastActiveElement = document.activeElement instanceof Element ? document.activeElement : null
  setTimeout(() => {
    if (modalTitleRef.value) {
      modalTitleRef.value.focus()
    }
  }, 0)
  document.addEventListener('keydown', handleKeydown)
  uiLog.debug('onMounted', { dialogItem: dialogItem.value, propsTask: props.task, tasksStoreItems: tasksStore.items, mergedTask: mergedTask.value })
  // Extra logging for stale data detection
  if (props.task && tasksStore.item && props.task.id === tasksStore.item.id) {
    const propStr = JSON.stringify(props.task)
    const storeStr = JSON.stringify(tasksStore.item)
    if (propStr !== storeStr) {
      uiLog.debug('StaleDataCheck: Task prop and store item differ (expected after refetch)')
    }
  }
})

onBeforeUnmount(() => {
  if (lastActiveElement && typeof (lastActiveElement as HTMLElement).focus === 'function') {
    (lastActiveElement as HTMLElement).focus()
  }
  document.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(e: KeyboardEvent) {
  // Trap focus
  if (e.key === 'Tab') {
    const focusableEls = Array.from(document.querySelectorAll('.kanban-modal [tabindex], .kanban-modal button, .kanban-modal input, .kanban-modal select, .kanban-modal textarea, .kanban-modal a')).filter((el): el is HTMLElement => (el instanceof HTMLElement) && el.offsetParent !== null)
    const firstEl = focusableEls[0]
    const lastEl = focusableEls[focusableEls.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
  }
  // Escape closes modal
  if (e.key === 'Escape') {
    onClose()
  }
}

onMounted(async () => {
  await tasksStore.getItem(dialogItem.value.id)
  uiLog.debug('onMounted: tasksStore.item and props.task', { tasksStoreItem: tasksStore.item, propsTask: props.task })
})

watch(
  () => dialogItem?.value?.id,
  async () => {
    if (dialogItem?.value?.id) {
      await tasksStore.getItem(dialogItem.value.id)
      uiLog.debug('watcher dialogItem.id', { dialogItemId: dialogItem.value.id, tasksStoreItem: tasksStore.item })
    }
  },
)

watch(() => props.task, (newTask) => {
  if (newTask && tasksStore.item && newTask.id === tasksStore.item.id) {
    const propStr = JSON.stringify(newTask)
    const storeStr = JSON.stringify(tasksStore.item)
    if (propStr !== storeStr) {
      uiLog.warn('StaleDataCheck: Task prop and store item differ on prop change', { prop: newTask, store: tasksStore.item })
    } else {
      uiLog.debug('StaleDataCheck: Task prop and store item match on prop change')
    }
  }
})

const emit = defineEmits(['close', 'save'])
function onClose() {
  uiLog.debug('onClose called')
  emit('close')
}

// Local refs for editable fields (typed for iTask)
const localName = ref<string>('')
const localDescription = ref<string>('')
const localProjectColumnId = ref<number | ''>('')
const localAssigneeId = ref<string>('')
// Add missing refs for relation type and related task
const localRelationType = ref('')
const localRelatedTaskId = ref('')
/** Relation fields loaded with the task; PATCH only when user changes them (avoids clearing on unrelated saves). */
const relationBaseline = ref<{ taskId: number | null; mode: string | null; id: number | null }>({
  taskId: null,
  mode: null,
  id: null,
})
const isSaving = ref(false)
const saveError = ref('')

const saveTaskProjectId = computed(() => {
  const mergedProjectId = mergedTask.value && 'projectId' in mergedTask.value ? Number((mergedTask.value as TaskWithIds).projectId) : NaN
  const storeProjectId = Number(projectStore.project?.id)
  const routeProjectId = Number(route.params.id)
  return [mergedProjectId, storeProjectId, routeProjectId].find(Number.isFinite)
})

const relationOptions = [...RELATION_UI_OPTIONS]
const relatedTasks = computed(() =>
  (tasksStore.items || []).filter(t => t.id !== mergedTask.value?.id).map(t => ({
    ...t,
    displayLabel: `${t.identifier}: ${t.name}`
  }))
)

// Watch mergedTask and update local refs when it changes
watch(mergedTask, (task) => {
  uiLog.debug('mergedTask watcher', { task })
  if (task) {
    localName.value = task.name || ''
    localDescription.value = task.description || ''
    localProjectColumnId.value = typeof task.projectColumnId === 'number' ? task.projectColumnId : ''
    if ((task as any).assigneeApiKeyId) {
      localAssigneeId.value = `agent:${(task as any).assigneeApiKeyId}`
    } else {
      localAssigneeId.value = task.assignee && typeof task.assignee.id === 'number' ? `user:${task.assignee.id}` : ''
    }
    // While save is in flight, keep local relation picks and baseline — optimistic
    // store updates must not wipe the PATCH payload or column badge patch.
    if (!isSaving.value) {
      const taskAny = task as { relationId?: number | string | null; relationMode?: string | null; relatedTask?: { id: number; relationMode?: string } | null }
      const relationId = taskAny.relationId ?? taskAny.relatedTask?.id ?? null
      const relationMode = taskAny.relationMode ?? taskAny.relatedTask?.relationMode ?? null
      localRelatedTaskId.value = relationId != null ? String(relationId) : ''
      localRelationType.value = relationModeToUiLabel(relationMode)
      relationBaseline.value = {
        taskId: task.id ?? null,
        mode: normalizeRelationModeForApi(relationMode),
        id: relationId != null ? Number(relationId) : null,
      }
    }
  }
}, { immediate: true })

function currentRelationValues(): { relationIdVal: number | null; relationModeVal: string | null } {
  const relationIdVal =
    localRelatedTaskId.value !== '' && localRelatedTaskId.value != null ? Number(localRelatedTaskId.value) : null
  const relationModeVal = relationUiLabelToApiMode(localRelationType.value)
  return { relationIdVal, relationModeVal }
}

function relationPatchIfChanged(): { relationMode?: string | null; relationId?: number | null } {
  const { relationIdVal, relationModeVal } = currentRelationValues()
  const taskId = mergedTask.value?.id ?? null
  const base = relationBaseline.value
  if (taskId == null) return {}
  if (base.taskId !== taskId) {
    return { relationMode: relationModeVal, relationId: relationIdVal }
  }
  if (relationModeVal === base.mode && relationIdVal === base.id) return {}
  return { relationMode: relationModeVal, relationId: relationIdVal }
}

function buildRelatedTaskSummary(
  relationIdVal: number | null,
  relationModeVal: string | null,
): iTask['relatedTask'] {
  if (relationIdVal == null || !relationModeVal) return null
  const related = (tasksStore.items || []).find((t) => t.id === relationIdVal)
  if (!related) return null
  return {
    id: related.id,
    identifier: related.identifier,
    name: related.name,
    relationMode: relationModeVal,
  }
}

// Save task logic is used in template, so keep as function but ensure assignee is always ISimplifiedUser
// @ts-ignore
async function saveTask(): Promise<void> {
  if (isSaving.value) return
  isSaving.value = true
  saveError.value = ''
  const prevTask = JSON.parse(JSON.stringify(tasksStore.item))
  const { relationIdVal, relationModeVal } = currentRelationValues()
  const relationPatch = relationPatchIfChanged()
  uiLog.debug('saveTask called', {
    localName: localName.value,
    localDescription: localDescription.value,
    localAssigneeId: localAssigneeId.value,
    localProjectColumnId: localProjectColumnId.value,
    relationPatch,
  })
  try {
    const assigneeKind = localAssigneeId.value.startsWith('agent:') ? 'agent' : localAssigneeId.value.startsWith('user:') ? 'user' : 'none'
    const assigneeValue = localAssigneeId.value.includes(':') ? localAssigneeId.value.split(':')[1] : ''
    const optimisticTask: iTask = {
      ...tasksStore.item,
      name: localName.value,
      description: localDescription.value,
      assignee: assigneeKind === 'user'
        ? { id: Number(assigneeValue), avatarUrl: '' }
        : { id: 0, avatarUrl: '' },
      assigneeApiKeyId: assigneeKind === 'agent' ? assigneeValue : null,
      projectColumnId: localProjectColumnId.value === '' ? 0 : Number(localProjectColumnId.value),
    }
    tasksStore.item = optimisticTask
    const payload: Record<string, unknown> = {
      name: localName.value,
      description: localDescription.value,
      projectColumnId: localProjectColumnId.value === '' ? undefined : Number(localProjectColumnId.value),
      projectId: mergedTask.value && 'projectId' in mergedTask.value ? (mergedTask.value as TaskWithIds).projectId : undefined,
      ...relationPatch,
      ...(assigneeKind === 'user' && { assigneeId: Number(assigneeValue) }),
      ...(assigneeKind === 'agent' && { assigneeApiKeyId: assigneeValue, assigneeId: null }),
      ...(assigneeKind === 'none' && { assigneeId: null, assigneeApiKeyId: null }),
    }
    if (mergedTask.value && 'id' in mergedTask.value) {
      const savedTaskId = (mergedTask.value as TaskWithIds).id as number
      await tasksStore.updateItem(savedTaskId, payload)
      if (Object.keys(relationPatch).length > 0 && saveTaskProjectId.value) {
        const columns = Array.isArray(projectStore.project.columns)
          ? (projectStore.project.columns as iColumn[])
          : []
        if (columns.length) {
          projectStore.project.columns = applyRelationFieldsToProjectColumns(columns, savedTaskId, {
            relationMode: relationModeVal,
            relationId: relationIdVal,
            relatedTask: buildRelatedTaskSummary(relationIdVal, relationModeVal),
          })
        }
        relationBaseline.value = {
          taskId: savedTaskId,
          mode: relationModeVal,
          id: relationIdVal,
        }
      }
      uiLog.debug('saveTask updateItem finished', { tasksStoreItem: tasksStore.item })
      if (typeof tasksStore.fetchItem === 'function') {
        const updatedTask = await tasksStore.fetchItem((mergedTask.value as TaskWithIds).id as number)
        tasksStore.item = updatedTask
        uiLog.debug('saveTask fetchItem finished', { updatedTask })
        // Ensure robust reactivity in ProjectGrid and other consumers by updating the array
        // See parent_child_data_sync.md and storeConstructor.ts for rationale
        if (typeof tasksStore.replaceItemInArray === 'function') {
          tasksStore.replaceItemInArray(updatedTask)
        }
      }
      if (saveTaskProjectId.value) {
        const pid = saveTaskProjectId.value
        await queryClient.invalidateQueries({ queryKey: ['board', pid] })
        await queryClient.invalidateQueries({ queryKey: ['project', pid] })
        await queryClient.invalidateQueries({ queryKey: ['subboard', pid] })
        uiLog.debug('saveTask invalidated board/project/subboard queries', { projectId: pid })
      }
    }
  } catch (err) {
    tasksStore.item = prevTask
    saveError.value = 'Failed to save task. Changes were rolled back.'
    uiLog.error('saveTask error', { error: err, projectId: saveTaskProjectId.value })
    if (saveTaskProjectId.value) {
      const pid = saveTaskProjectId.value
      await queryClient.invalidateQueries({ queryKey: ['board', pid] })
      await queryClient.invalidateQueries({ queryKey: ['project', pid] })
      await queryClient.invalidateQueries({ queryKey: ['subboard', pid] })
      uiLog.debug('saveTask error - invalidated board/project/subboard queries', { projectId: pid })
    }
  } finally {
    isSaving.value = false
  }
}

// @ts-ignore
const columnsStore = useColumnsStore()
// @ts-ignore
const membersStore = useMembersStore()
const delegateAssignees = ref<Array<{ apiKeyId: string; name: string; permissionLevel: string }>>([])

const taskProjectId = computed(() => Number(route.params.id) || (mergedTask.value as any)?.projectId || (dialogItem.value as any)?.projectId || 0)
const columnOptions = computed(() => {
  const storeColumns = columnsStore.items || []
  if (storeColumns.length) return storeColumns
  return projectStore.project?.columns || []
})

const assigneeOptions = computed(() => {
  const users = (membersStore.items || []).map((member: any) => {
    const userId = Number(member.userId ?? member.id)
    return {
      value: `user:${userId}`,
      label: member.fullName || member.name || `User ${userId}`,
    }
  })
  const delegates = delegateAssignees.value.map((delegate) => ({
    value: `agent:${delegate.apiKeyId}`,
    label: `${delegate.name} (Delegate)`,
  }))
  return [...users, ...delegates]
})

watch(taskProjectId, async (projectId) => {
  if (!projectId) return
  try {
    const response = await api.getProjectDelegates(projectId)
    delegateAssignees.value = Array.isArray(response?.data) ? response.data : []
  } catch (error) {
    uiLog.error('Failed to fetch project delegates', { error, projectId })
    delegateAssignees.value = []
  }
}, { immediate: true })

watch(taskProjectId, async (projectId) => {
  if (!projectId || columnOptions.value.length || columnsStore.loadingItems) return
  try {
    await columnsStore.getItems()
  } catch (error) {
    uiLog.error('Failed to fetch columns for task dialog', { error, projectId })
  }
}, { immediate: true })

/** Backend returns comments with userId only; resolve author from user/createdBy or project members. */
function getCommentAuthorDisplayName(comment: { user?: { id?: number; fullName?: string; name?: string; surname?: string }; createdBy?: { id?: number; fullName?: string; name?: string; surname?: string }; userId?: number }): string {
  const fromUser = getDisplayName(comment.user || comment.createdBy)
  if (fromUser !== 'Unknown') return fromUser
  const uid = comment.userId ?? comment.user?.id ?? comment.createdBy?.id
  if (uid == null) return 'Unknown'
  const members = (membersStore.items || []) as { id: number; fullName?: string; name?: string; surname?: string }[]
  const member = members.find((m) => m.id === uid)
  return getDisplayName(member)
}

const fieldsValueState = reactive({
  comment: ''
})

const isAddingComment = ref(false)
const addCommentError = ref('')

async function addTaskComment() {
  if (!fieldsValueState.comment) return;
  isAddingComment.value = true;
  addCommentError.value = '';
  const tempId = 'temp-' + Date.now();
  // Use type assertion to satisfy iComment, and add required fields with dummy values for optimistic UI
  const optimisticComment = {
    id: null as unknown as number, // Will be replaced by backend
    tempId,
    content: fieldsValueState.comment,
    user: { id: 0, fullName: 'You', avatarUrl: '' },
    createdBy: { id: 0, fullName: 'You', avatarUrl: '' },
    createdAt: new Date().toISOString(),
    taskId: tasksStore.item?.id ?? 0,
    optimistic: true,
  } as import('@/types/taskTypes').iComment;
  if (tasksStore.item && Array.isArray(tasksStore.item.comments)) {
    tasksStore.item.comments.push(optimisticComment);
  } else if (tasksStore.item) {
    tasksStore.item.comments = [optimisticComment];
  }
  uiLog.debug('addTaskComment optimistic comment added', { optimisticComment })
  fieldsValueState.comment = '';
  try {
    const response = await tasksStore.addComment(tasksStore.item.id, optimisticComment.content);
    const idx = tasksStore.item.comments.findIndex((c: import('@/types/taskTypes').iComment) => c.tempId === tempId);
    if (idx !== -1) {
      // Normalize so display always has user (backend may return createdBy only)
      // Backend returns only userId; attach member for display when user/createdBy missing
      const resp = response as { userId?: number; user?: unknown; createdBy?: unknown }
      const uid = resp.userId
      const members = (membersStore.items || []) as { id: number; fullName?: string; name?: string; surname?: string }[]
      const member = uid != null ? members.find((m) => m.id === uid) : undefined
      const respObj = response && typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {}
      const normalized = {
        ...respObj,
        user: resp.user ?? resp.createdBy ?? member ?? optimisticComment.user,
        createdBy: resp.createdBy ?? member ?? optimisticComment.createdBy,
        optimistic: false,
      };
      tasksStore.item.comments[idx] = normalized as import('@/types/taskTypes').iComment;
    }
    uiLog.debug('addTaskComment API response', { response })
    await tasksStore.getItem(tasksStore.item.id);
    uiLog.debug('addTaskComment refetched task')
  } catch (err) {
    const idx = tasksStore.item.comments.findIndex((c: import('@/types/taskTypes').iComment) => c.tempId === tempId);
    if (idx !== -1) {
      tasksStore.item.comments.splice(idx, 1);
    }
    addCommentError.value = 'Failed to add comment. Please try again.';
    uiLog.error('addTaskComment error', { error: err })
  } finally {
    isAddingComment.value = false;
  }
}

const isError = ref(false)
const errorMessage = ref('')
// @ts-ignore
function onRetry() {
  // Implement retry logic or leave as stub
  isError.value = false
  errorMessage.value = ''
}

const refreshing = ref(false)
const refreshError = ref('')

function refreshTask() {
  if (!dialogItem.value?.id) return
  refreshing.value = true
  refreshError.value = ''
  uiLog.debug('Refreshing task from backend', { dialogItemId: dialogItem.value.id })
  tasksStore.getItem(dialogItem.value.id)
    .then(() => {
      uiLog.debug('Refreshed task from backend', { tasksStoreItem: tasksStore.item })
      localName.value = tasksStore.item.name
      localDescription.value = tasksStore.item.description ?? ''
      if ((tasksStore.item as any).assigneeApiKeyId) {
        localAssigneeId.value = `agent:${(tasksStore.item as any).assigneeApiKeyId}`
      } else {
        localAssigneeId.value = tasksStore.item.assignee?.id ? `user:${tasksStore.item.assignee.id}` : ''
      }
      localProjectColumnId.value = tasksStore.item.projectColumnId ?? ''
      // Update relation fields after refresh
      const taskAny = tasksStore.item as { relationId?: number | string | null; relationMode?: string | null; relatedTask?: { id: number; relationMode?: string } | null }
      const relationId = taskAny.relationId ?? taskAny.relatedTask?.id ?? null
      const relationMode = taskAny.relationMode ?? taskAny.relatedTask?.relationMode ?? null
      localRelatedTaskId.value = relationId != null ? String(relationId) : ''
      localRelationType.value = relationModeToUiLabel(relationMode)
    })
    .catch(err => {
      refreshError.value = 'Failed to refresh from server.'
      uiLog.error('Refresh error', { error: err })
    })
    .finally(() => {
      refreshing.value = false
    })
}

// --- Linked Documents & Accept Plan ---
const projectId = computed(() => Number(route.params.id) || (mergedTask.value as any)?.projectId)
const taskId = computed(() => mergedTask.value?.id)

const docLinksTaskId = computed(() => taskId.value ?? 0)
const { data: docLinksData } = useTaskDocLinks(projectId, docLinksTaskId)
const {
  createLink,
  deleteLink,
  createLoading: addingDocumentLink,
} = useTaskDocLinkMutations(projectId, docLinksTaskId)

const availableDocuments = ref<ProjectDocument[]>([])
const selectedDocumentId = ref<number | ''>('')
const loadingDocuments = ref(false)
const removingDocumentLinkId = ref<number | null>(null)

// Merge docLinks into mergedTask for display
const taskWithDocLinks = computed(() => {
  if (!mergedTask.value) return null
  const links = docLinksData.value?.data ?? mergedTask.value.docLinks ?? []
  return {
    ...mergedTask.value,
    docLinks: links,
  } as typeof mergedTask.value & { docLinks: typeof links }
})

const activeDocLinks = computed(() => taskWithDocLinks.value?.docLinks || [])

async function loadAvailableDocuments() {
  if (!projectId.value || loadingDocuments.value || availableDocuments.value.length) return
  loadingDocuments.value = true
  try {
    const response = await documentsApi.getDocuments(projectId.value, { limit: 100 })
    const docs = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []
    availableDocuments.value = docs
  } catch (error) {
    uiLog.error('Failed to load project documents for task dialog', { error, projectId: projectId.value })
  } finally {
    loadingDocuments.value = false
  }
}

async function addDocumentLink() {
  if (!projectId.value || !taskId.value || !selectedDocumentId.value) return
  try {
    await createLink({ documentId: Number(selectedDocumentId.value) })
    selectedDocumentId.value = ''
    await queryClient.invalidateQueries({ queryKey: ['task-doc-links', projectId.value, taskId.value] })
    await tasksStore.getItem(taskId.value)
  } catch (error) {
    uiLog.error('Failed to link document to task', { error, projectId: projectId.value, taskId: taskId.value })
  }
}

async function unlinkDocument(linkId: number) {
  if (!projectId.value || !taskId.value) return
  removingDocumentLinkId.value = linkId
  try {
    await deleteLink(linkId)
    await queryClient.invalidateQueries({ queryKey: ['task-doc-links', projectId.value, taskId.value] })
    await tasksStore.getItem(taskId.value)
  } catch (error) {
    uiLog.error('Failed to unlink document from task', { error, projectId: projectId.value, taskId: taskId.value, linkId })
  } finally {
    removingDocumentLinkId.value = null
  }
}

function manageDocuments() {
  if (!projectId.value) return
  router.push({ name: 'ProjectDocs', params: { id: String(projectId.value) } })
  onClose()
}

const acceptingPlan = ref(false)
const acceptPlanError = ref('')

const userRole = computed(() => projectStore.project?.role || 'Viewer')
const isMaintainerOrAbove = computed(() => ['Owner', 'Maintainer'].includes(userRole.value))

const showAcceptPlanButton = computed(() => {
  if (!mergedTask.value || !isMaintainerOrAbove.value) return false
  // Show if task has an IMPLEMENTATION_PLAN link and plan not yet accepted
  const hasPlanLink = (taskWithDocLinks.value?.docLinks || []).some((l: any) => l.role === 'IMPLEMENTATION_PLAN')
  return hasPlanLink && !mergedTask.value.planAccepted
})

const showSubBoardButton = computed(() => {
  if (!mergedTask.value) return false
  // Show for any container task with children (both accepted and draft)
  return !!mergedTask.value.isContainer && subBoardChildCount.value > 0
})

const isDraftSubBoard = computed(() => {
  if (!mergedTask.value) return false
  return !!mergedTask.value.isContainer && !mergedTask.value.planAccepted && subBoardChildCount.value > 0
})

const subBoardChildCount = computed(() => {
  return mergedTask.value?.childCount || mergedTask.value?.children?.length || 0
})

function viewSubBoard() {
  router.push({
    name: 'SubBoard',
    params: {
      id: String(projectId.value),
      parentId: String(taskId.value),
    },
  })
  onClose()
}

function openLinkedDoc(docId: number) {
  router.push({ name: 'ProjectDocs', params: { id: String(projectId.value) }, query: { doc: String(docId) } })
  onClose()
}

async function handleAcceptPlan() {
  if (!projectId.value || !taskId.value) return
  acceptingPlan.value = true
  acceptPlanError.value = ''
  try {
    await planAcceptanceApi.acceptPlan(projectId.value, taskId.value)
    await queryClient.invalidateQueries({ queryKey: ['board', projectId.value] })
    await tasksStore.getItem(taskId.value)
    layoutStore.openToast({ message: 'Plan accepted and sub-tasks created', type: 'success' })
  } catch (err: any) {
    acceptPlanError.value = err.response?.data?.error || 'Failed to accept plan'
    uiLog.error('Accept plan error', { error: err })
  } finally {
    acceptingPlan.value = false
  }
}

</script>

<template>
  <DialogTemplate :open="open" @close="onClose">
    <template #header>
      <TaskDialogHeader
        v-if="mergedTask"
        :task="mergedTask"
        :refreshing="refreshing"
        @refresh="refreshTask"
      />
      <div v-else class="skeleton mb-2 h-8 w-1/2" aria-busy="true" aria-live="polite" />
    </template>

    <div class="kanban-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div v-if="!columnOptions.length && mergedTask" class="alert alert-warning mb-4" aria-live="assertive">
        {{ $t('taskDialog.columnsMissing') }}
      </div>

      <div v-if="mergedTask" class="space-y-4" aria-label="Task details">
        <TaskCoreFields
          :name="localName"
          :description="localDescription"
          :project-column-id="localProjectColumnId"
          :assignee-id="localAssigneeId"
          :column-options="columnOptions"
          :assignee-options="assigneeOptions"
          @update:name="localName = $event"
          @update:description="localDescription = $event"
          @update:project-column-id="localProjectColumnId = $event"
          @update:assignee-id="localAssigneeId = $event"
        />

        <TaskRelationField
          :relation-type="localRelationType"
          :related-task-id="localRelatedTaskId"
          :relation-options="relationOptions"
          :related-tasks="relatedTasks"
          @update:relation-type="localRelationType = $event"
          @update:related-task-id="localRelatedTaskId = $event"
        />

        <TaskLinkedDocumentsPanel
          :links="activeDocLinks"
          :available-documents="availableDocuments"
          :selected-document-id="selectedDocumentId"
          :loading-documents="loadingDocuments"
          :adding-link="addingDocumentLink"
          :removing-link-id="removingDocumentLinkId"
          @open-doc="openLinkedDoc"
          @unlink-doc="unlinkDocument"
          @load-documents="loadAvailableDocuments"
          @add-link="addDocumentLink"
          @manage-docs="manageDocuments"
          @update:selected-document-id="selectedDocumentId = $event"
        />

        <div v-if="showSubBoardButton || showAcceptPlanButton" class="rounded-box border border-base-300 bg-base-100 p-4">
          <div class="flex flex-wrap gap-2">
            <button
              v-if="showSubBoardButton"
              type="button"
              class="btn btn-sm"
              :class="isDraftSubBoard ? 'btn-info' : 'btn-secondary'"
              @click="viewSubBoard"
            >
              {{ isDraftSubBoard ? $t('taskDialog.viewDraftSubBoard', { count: subBoardChildCount }) : $t('taskDialog.viewSubBoard', { count: subBoardChildCount }) }}
            </button>

            <button
              v-if="showAcceptPlanButton"
              type="button"
              class="btn btn-success btn-sm"
              :disabled="acceptingPlan"
              @click="handleAcceptPlan"
            >
              <span v-if="acceptingPlan" class="loading loading-spinner loading-xs" />
              <span v-else>{{ $t('taskDialog.acceptPlan') }}</span>
            </button>
          </div>
          <p v-if="acceptPlanError" class="mt-2 text-xs text-error">{{ acceptPlanError }}</p>
        </div>

        <TaskActivityPanel
          :comments="mergedTask.comments || []"
          :history="mergedTask.history || []"
          :comment-text="fieldsValueState.comment"
          :adding-comment="isAddingComment"
          :add-comment-error="addCommentError"
          :get-comment-author-display-name="getCommentAuthorDisplayName"
          @update:comment-text="fieldsValueState.comment = $event"
          @add-comment="addTaskComment"
        />
      </div>

      <div v-else class="p-8 text-center text-base-content/60" aria-busy="true" aria-live="polite">
        {{ $t('taskDialog.loadingDetails') }}
      </div>

      <div v-if="isError" class="alert alert-error my-4 flex flex-col items-center gap-4" aria-live="assertive">
        <span>{{ errorMessage || $t('taskDialog.loadFailed') }}</span>
        <button class="btn btn-ghost btn-sm" type="button" @click="onRetry">{{ $t('taskDialog.retry') }}</button>
      </div>
      <div v-if="saveError" class="alert alert-error mt-2" aria-live="assertive">{{ saveError }}</div>
    </div>

    <template #actions>
      <div class="flex w-full items-center justify-between gap-3">
        <span class="text-sm text-base-content/70">{{ $t('tasks.createdDate') }}: {{ mergedTask?.createdAt || '-' }}</span>
        <div class="flex gap-2">
          <button class="btn btn-primary" type="button" :disabled="isSaving" @click="saveTask">
            <span v-if="isSaving" class="loading loading-spinner loading-xs" />
            <span v-else>{{ $t('settings.columns.save') }}</span>
          </button>
          <button class="btn" type="button" @click="onClose">{{ $t('actions.close') }}</button>
        </div>
      </div>
    </template>
  </DialogTemplate>
</template>
