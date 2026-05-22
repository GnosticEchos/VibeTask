<script setup lang="ts">
import DialogTemplate from '../../dialog/DialogTemplate.vue'
import usePermittedUser from '../../../../composables/usePermittedUser'
import { useColumnsStore } from '../../../../stores/columns'
import { useMembersStore } from '../../../../stores/members'
import { useTasksStore } from '@/stores/tasks'
import { useProjectStore } from '@/stores/project'
import { useQueryClient } from '@tanstack/vue-query'
import { storeToRefs } from 'pinia'
import { trimText } from '../../../../utils/functions'
import rules from '../../../../utils/validators'
import { Form, useForm } from 'vee-validate'
import { computed, ref, Ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import BaseToast from '../../../base/BaseToast.vue'
import { uiLog } from '@/utils/logger'
import { onMounted, ref as vueRef } from 'vue'
import { getDisplayName } from '../../../../utils/functions'
import { dependencyRelationTypeOptions, relationUiLabelToApiMode } from '@/utils/taskRelationMode'
import { useLayoutStore } from '@/stores/layout'

const props = defineProps<{
  task?: { createWorkspace?: boolean; openWorkspaceAfter?: boolean }
}>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const layoutStore = useLayoutStore()
const { errors } = useForm()

const name: Ref<string> = ref('')
const description: Ref<string> = ref('')
const projectColumnId: Ref<number | null> = ref(null)
const assigneeId: Ref<number | null> = ref(null)
const relationMode: Ref<string> = ref('')
const relationId: Ref<number | null> = ref(null)
const workspaceParentId: Ref<number | null> = ref(null)

const columnsStore = useColumnsStore()
const membersStore = useMembersStore()
const tasksStore = useTasksStore()
const projectStore = useProjectStore()
const queryClient = useQueryClient()
const { checkIsEditor } = usePermittedUser()
const { items: columns } = storeToRefs(columnsStore)
const { items: membersRaw } = storeToRefs(membersStore)
const { items: tasksRaw, loadingItem } = storeToRefs(tasksStore)

const columnsSorted = computed(() => {
  return columns.value?.sort((a, b) => a.order - b.order)
})

const relationOptions = computed(() => dependencyRelationTypeOptions())

const isWorkspaceContainer: Ref<boolean> = ref(false)

const activeWorkspaceParentId = computed(() => {
  const fromRoute = route.query?.workspace
  if (fromRoute) return Number(fromRoute)
  return null
})

const workspaceOptions = computed(() =>
  (tasksRaw.value || [])
    .filter((task) => (task as { isContainer?: boolean }).isContainer)
    .map((task) => ({
      id: task.id,
      label: `${task.identifier}: ${trimText(task.name, 40)}`,
    })),
)

const showWorkspaceMembership = computed(() => !isWorkspaceContainer.value && activeWorkspaceParentId.value == null)

const dialogTitle = computed(() =>
  props.task?.createWorkspace || isWorkspaceContainer.value ? t('project.newWorkspace') : t('project.addNewTask'),
)

// 2. Assignee dropdown: ensure fullName fallback
const members = computed(() => {
  const raw = membersRaw.value || [];
  uiLog.debug('membersRaw', { raw });
  const processed = raw
    .filter((member) => checkIsEditor(member.role))
    .map(member => ({
      ...member,
      displayName: getDisplayName(member)
    }));
  uiLog.debug('computed members', { processed });
  return processed;
})

const loading = computed(() => {
  return loadingItem.value
})

const tasks = computed(() => {
  return tasksRaw.value
    ?.sort((a, b) => a.id - b.id)
    ?.map((task) => {
      const assiggnee = task.assignee?.fullName
        ? ` - ${task.assignee?.fullName || ''}`
        : ''
      const name = trimText(task.name, 20)
      return {
        label: `${task.identifier}: ${name} ${assiggnee}`,
        id: task.id,
      }
    })
})

// Watch for changes in relationId and relationMode to ensure they're in sync
watch(relationId, (newValue) => {
  if (!newValue && relationMode.value) {
    relationMode.value = ''
  }
})

watch(relationMode, (newValue) => {
  if (!newValue && relationId.value) {
    relationId.value = null
  }
})

const formIsValid = computed(() => {
  // Basic validation - name must be present and have minimum length
  const nameIsValid = name.value && name.value.length >= 5 && name.value.length <= 60
  
  // Relation validation - if either relationId or relationMode is set, both must be set
  const relationIsValid =
    (!relationId.value && !relationMode.value) ||
    (relationId.value && relationMode.value)

  return nameIsValid && relationIsValid && Object.keys(errors.value).length === 0
})

/** After a successful create, block another POST until the user edits the form (avoids duplicate tasks). */
type AddTaskFormSnapshot = {
  name: string
  description: string
  projectColumnId: number | null
  assigneeId: number | null
  relationMode: string
  relationId: number | null
}

const submitBlockedUntilEdits = ref(false)
const formSnapshotAfterSubmit = ref<AddTaskFormSnapshot | null>(null)

function captureAddTaskFormSnapshot(): AddTaskFormSnapshot {
  return {
    name: name.value,
    description: description.value,
    projectColumnId: projectColumnId.value,
    assigneeId: assigneeId.value,
    relationMode: relationMode.value,
    relationId: relationId.value,
  }
}

const hasEditsSinceLastSubmit = computed(() => {
  if (!submitBlockedUntilEdits.value || !formSnapshotAfterSubmit.value) return true
  const s = formSnapshotAfterSubmit.value
  return (
    name.value !== s.name ||
    description.value !== s.description ||
    projectColumnId.value !== s.projectColumnId ||
    assigneeId.value !== s.assigneeId ||
    relationMode.value !== s.relationMode ||
    relationId.value !== s.relationId
  )
})

const canSubmitNewTask = computed(
  () => formIsValid.value && hasEditsSinceLastSubmit.value && !loading.value,
)

// Local toast state
const toastMessage = vueRef('')
const toastType = vueRef<'info' | 'success' | 'warning' | 'error'>('info')
const toastVisible = vueRef(false)

function showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
  setTimeout(() => { toastVisible.value = false }, 3500)
}

// TODO: Replace with global notification system when ready

// Ensure data is loaded before showing dialog
const loadingDropdowns = vueRef(false)
async function ensureDropdownData() {
  loadingDropdowns.value = true
  const promises = []
  if (!columns.value || columns.value.length === 0) promises.push(columnsStore.getItems())
  if (!membersRaw.value || membersRaw.value.length === 0) promises.push(membersStore.getItems())
  if (!tasksRaw.value || tasksRaw.value.length === 0) promises.push(tasksStore.getItems())
  await Promise.all(promises)
  loadingDropdowns.value = false
}

onMounted(() => {
  ensureDropdownData()
  if (props.task?.createWorkspace) {
    isWorkspaceContainer.value = true
  }
  if (activeWorkspaceParentId.value != null) {
    workspaceParentId.value = activeWorkspaceParentId.value
  }
})

const addTask = async () => {
  if (!formIsValid.value || loadingItem.value) return
  if (submitBlockedUntilEdits.value && !hasEditsSinceLastSubmit.value) return
  const params: Record<string, unknown> = {
    name: name.value,
    description: description.value,
    projectColumnId: projectColumnId.value,
    assigneeId: assigneeId.value,
    ...(isWorkspaceContainer.value ? { isContainer: true } : {}),
  }
  if (workspaceParentId.value != null) {
    params.parentId = workspaceParentId.value
  } else if (activeWorkspaceParentId.value != null) {
    params.parentId = activeWorkspaceParentId.value
  }
  if (relationId.value != null && relationMode.value) {
    const rid = Number(relationId.value)
    if (!Number.isNaN(rid)) {
      params.relationId = rid
      const apiMode = relationUiLabelToApiMode(relationMode.value)
      if (apiMode) params.relationMode = apiMode
    }
  }
  try {
    const created = await tasksStore.createItem(params)
    const projectId = projectStore.selectedProjectId ?? projectStore.project?.id
    if (projectId != null) {
      await queryClient.invalidateQueries({ queryKey: ['board', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    }
    const createdId = (created as { id?: number })?.id
    if (props.task?.openWorkspaceAfter && createdId && projectId != null) {
      layoutStore.closeDialog()
      await router.push({
        name: 'Board',
        params: { id: String(projectId) },
        query: { workspace: String(createdId) },
      })
    }
    showToast(
      isWorkspaceContainer.value ? t('project.workspaceCreated') : 'Task created successfully!',
      'success',
    )
    submitBlockedUntilEdits.value = true
    formSnapshotAfterSubmit.value = captureAddTaskFormSnapshot()
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: Record<string, unknown>; status?: number } }
    const res = axiosError.response?.data as Record<string, unknown> | undefined
    const details = res?.details as Array<{ field?: string; message?: string }> | undefined
    const msg = res
      ? (typeof res.message === 'string' ? res.message : Array.isArray(details) && details[0]?.message ? details[0].message : typeof res.error === 'string' ? res.error : Array.isArray(res.errors) ? String(res.errors[0]) : null)
      : null
    showToast(msg || t('tasks.createError'), 'error')
    if (import.meta.env?.DEV) {
      uiLog.error('Task create error', { error, response: axiosError.response?.data })
    }
  }
}

// Handle field clearing
const handleFieldCleared = (fieldName: string) => {
  if (fieldName === 'relationMode') {
    relationId.value = null
  } else if (fieldName === 'relationId') {
    relationMode.value = ''
  }
}
</script>

<template>
  <Form v-slot="{ /* resetField */ }">
    <form @submit.prevent="addTask" class="flex flex-col gap-6">
      <DialogTemplate :loading="loading"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'add-task-dialog-title'"
      >
        <template #header>
          <span id="add-task-dialog-title" class="text-lg font-bold">{{ dialogTitle }}</span>
        </template>
        <div class="flex flex-col gap-6 px-4 pt-4">
          <!-- Title row -->
          <div class="flex flex-col items-start gap-1 w-full">
            <label for="taskTitle" class="text-base font-semibold">Title</label>
            <BaseInput
              id="taskTitle"
              v-model="name"
              name="taskName"
              :label="null"
              :placeholder="$t('tasks.enterName')"
              :floatLabel="false"
              :disabled="loading"
              :rules="[(value:string) => rules.required(value,'Title'), (value:string) => rules.minLength(value, 5, 'Title'), (value:string) => rules.maxLength(value, 60, 'Title')]"
              class="w-full"
            />
          </div>
          <!-- Description row -->
          <div class="flex flex-col gap-2 w-full">
            <label for="taskDescription" class="text-base font-semibold">Description</label>
            <textarea
              id="taskDescription"
              v-model="description"
              name="taskDescription"
              :placeholder="$t('tasks.enterDescription')"
              :maxlength="1000"
              :disabled="loading"
              class="textarea textarea-bordered w-full min-h-[160px] h-32"
            ></textarea>
          </div>
          <!-- Status and Assignee row -->
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <label for="projectColumnId" class="text-base font-semibold">Status</label>
                <BaseSelect
                id="projectColumnId"
                  v-model="projectColumnId"
                  name="projectColumnId"
                  :items="columnsSorted"
                  :label="null"
                  optionsValue="id"
                  optionsLabel="name"
                  :disabled="loading || loadingDropdowns || !columnsSorted?.length"
                  :placeholder="$t('tasks.setStatus')"
                class="w-full"
                />
              </div>
            <div class="flex flex-col gap-2">
              <label for="assigneeId" class="text-base font-semibold">Assignee</label>
                <BaseSelect
                id="assigneeId"
                  v-model="assigneeId"
                  name="assigneeId"
                  :items="members"
                  :label="null"
                  optionsValue="id"
                  optionsLabel="displayName"
                  :disabled="loading || loadingDropdowns || !members?.length"
                  :placeholder="$t('tasks.assignTask')"
                class="w-full"
                />
              </div>
            </div>
          <label
            v-if="!activeWorkspaceParentId"
            class="label cursor-pointer justify-start gap-2 mt-2"
          >
            <input
              v-model="isWorkspaceContainer"
              type="checkbox"
              class="checkbox checkbox-primary checkbox-sm"
              :disabled="loading || !!props.task?.createWorkspace"
            />
            <span class="label-text">{{ $t('project.createAsWorkspace') }}</span>
          </label>
          <div v-if="showWorkspaceMembership" class="flex flex-col gap-2 mt-2">
            <label class="text-base font-semibold">{{ $t('taskDialog.workspaceMembership') }}</label>
            <BaseSelect
              v-model="workspaceParentId"
              name="workspaceParentId"
              :items="workspaceOptions"
              optionsValue="id"
              optionsLabel="label"
              :disabled="loading || loadingDropdowns || !workspaceOptions.length"
              :placeholder="$t('taskDialog.workspaceNone')"
              class="w-full"
            />
          </div>
          <!-- Relation row -->
          <div class="flex flex-col gap-2 mt-2">
            <label class="text-base font-semibold">{{ $t('taskDialog.taskLink') }} ({{ $t('tasks.optionalRelation') }})</label>
              <div class="flex gap-2">
              <div class="flex flex-col w-1/3">
                  <BaseSelect
                    v-model="relationMode"
                    name="relationMode"
                    :items="relationOptions"
                    optionsLabel="label"
                    optionsValue="value"
                    :placeholder="$t('tasks.type')"
                    :hide-dropdown-icon="true"
                    :disabled="loading || loadingDropdowns"
                    :rules="[(value:string) => relationId ? rules.required(value,$t('tasks.relation')) : true]"
                    @cleared="handleFieldCleared('relationMode')"
                  class="w-full"
                  aria-label="Relation type"
                  />
                </div>
              <div class="flex flex-col flex-1">
                  <BaseSelect
                    v-model="relationId"
                    name="relationId"
                    :items="tasks"
                    optionsValue="id"
                    optionsLabel="label"
                    :disabled="loading || loadingDropdowns || !tasks?.length"
                    :placeholder="
                      $t('tasks.selectXtask', {
                        type: relationMode ? relationMode.toLowerCase() : '',
                      })
                    "
                    :rules="[(value:string) => relationMode ? rules.required(value,$t('tasks.relatedTask')) : true]"
                    @cleared="handleFieldCleared('relationId')"
                  class="w-full"
                  aria-label="Related task"
                  />
              </div>
            </div>
          </div>
        </div>
        <template #actions>
          <div class="flex w-full justify-between gap-2">
            <BaseButton
              type="button"
              label="Cancel"
              icon="close"
              class="btn-ghost"
              @click="$emit('close')"
            />
          <BaseButton
            type="submit"
            :label="$t('tasks.add')"
            icon="check"
            :disabled="!canSubmitNewTask"
          />
          </div>
        </template>
      </DialogTemplate>
    </form>
    <BaseToast
      v-if="toastVisible"
      :message="toastMessage"
      :type="toastType"
      :duration="3500"
      @close="toastVisible = false"
      style="position: fixed; top: 2rem; right: 2rem; z-index: 9999;"
    />
  </Form>
</template>
