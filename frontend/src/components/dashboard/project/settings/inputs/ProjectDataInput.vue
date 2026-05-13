<script setup lang="ts">
import usePermittedUser from '@/composables/usePermittedUser'
import rules from '@/utils/validators'
import { computed } from 'vue'

const { isAdmin } = usePermittedUser()

const props = defineProps({
  name: String,
  description: String,
  prefix: String,
  isEditing: {
    type: Boolean,
    default: false,
  },
})

const disabled = computed(() => {
  return props.isEditing ? !isAdmin.value : false
})

defineEmits(['update:name', 'update:description', 'update:prefix'])
</script>

<template>
  <div class="content flex flex-wrap gap-5 rpw-gap-2">
    <div class="flex flex-col" style="min-width: 265px">
      <span class="field-label">{{ $t('settings.projectData.name') }}</span>
      <BaseInput
        name="projectName"
        :value="name"
        :label="$t('tasks.name')"
        :placeholder="$t('settings.projectData.enterProjectName')"
        :disabled="disabled"
        medium
        :rules="[(value:string) => rules.required(value, $t('settings.projectData.name')),(value:string) => rules.minLength(value,3,$t('settings.projectData.name')), (value:string) => rules.maxLength(value,20,$t('settings.projectData.name'))]"
        @update:modelValue="$emit('update:name', $event)"
      />
    </div>
    <div class="flex flex-col flex-grow-1">
      <span class="field-label">{{
        $t('settings.projectData.description')
      }}</span>
      <BaseInput
        name="projectDescription"
        :value="description"
        :label="$t('settings.projectData.description')"
        :placeholder="$t('settings.projectData.enterProjectDescription')"
        :disabled="disabled"
        medium
        :rules="[(value:string) => rules.maxLength(value,100,$t('settings.projectData.description'))]"
        @update:modelValue="$emit('update:description', $event)"
      />
    </div>
  </div>
</template>
