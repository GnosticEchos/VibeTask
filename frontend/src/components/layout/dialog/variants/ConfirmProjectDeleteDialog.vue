<script setup lang="ts">
import DialogTemplate from '../../dialog/DialogTemplate.vue'
import router from '../../../../router'
import { useLayoutStore } from '../../../../stores/layout'
import { useProjectStore } from '../../../../stores/project'
import { useProjectMutations } from '@/composables/useProjectMutations'
import rules from '../../../../utils/validators'
import { useForm } from 'vee-validate'
import { computed, ref, Ref } from 'vue'

const { errors } = useForm()

const projectStore = useProjectStore()
const layoutStore = useLayoutStore()
const { deleteProject: deleteProjectMutation, isDeletingProject } = useProjectMutations()

const loading = computed(() => isDeletingProject.value)

const project = computed(() => projectStore.project)

const formIsValid = computed(() => {
  return Object.keys(errors.value).length === 0 && projectNameValue.value.length
})

const projectNameValue: Ref<string> = ref('')

const deleteProject = async () => {
  const id = projectStore.project?.id
  if (id == null) return
  try {
    layoutStore.closeDialog()
    await deleteProjectMutation(id)
    layoutStore.openToast({ message: 'Project deleted.', type: 'success' })
    router.push({ name: 'Explore' })
  } catch {
    layoutStore.openToast({ message: 'Failed to delete project. Please try again.', type: 'error' })
  }
}
</script>

<template>
  <form @submit.prevent="deleteProject" class="flex flex-col gap-2">
    <DialogTemplate :loading="loading">
      <template #content>
        <div class="px-4">
          <div class="mb-3">
            <span class="mr-1"
              >{{ $t('settings.dangerZone.enterProjectName') }}:
            </span>
            <span class="font-medium text-teal-500">"{{ project?.name }}"</span>
          </div>
          <div class="w-full">
            <BaseInput
              v-model="projectNameValue"
              name="projectNameField"
              :disabled="loading"
              :placeholder="$t('settings.dangerZone.projectName')"
              :floatLabel="false"
              :rules="[()=>rules.isExact(projectNameValue, project?.name as string)]"
            />
            <!-- TODO: Replace with DaisyUI Alert -->
            <div class="alert alert-warning">{{ $t('settings.dangerZone.description') }}</div>
          </div>
        </div>
      </template>
      <template #actions>
        <BaseButton
          type="submit"
          :label="$t('settings.dangerZone.deleteProject')"
          icon="check"
          :disabled="!formIsValid"
        />
      </template>
    </DialogTemplate>
  </form>
</template>
