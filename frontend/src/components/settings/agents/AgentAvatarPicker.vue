<script setup lang="ts">
import { AGENT_AVATAR_OPTIONS } from '@/utils/agentAvatars'

withDefaults(
  defineProps<{
    modelValue?: string | null
    disabled?: boolean
    allowNone?: boolean
  }>(),
  { allowNone: true },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>()

function select(slug: string | undefined) {
  emit('update:modelValue', slug)
}
</script>

<template>
  <div class="form-control">
    <label class="label py-1">
      <span class="label-text">{{ $t('settingsApp.agents.agentAvatar') }}</span>
    </label>
    <p class="text-xs text-base-content/60 mb-2">{{ $t('settingsApp.agents.agentAvatarHint') }}</p>
    <div class="flex flex-wrap gap-2" role="group" :aria-label="$t('settingsApp.agents.agentAvatar')">
      <button
        v-if="allowNone"
        type="button"
        class="btn btn-sm min-h-9 h-9 px-3"
        :class="!modelValue ? 'btn-primary' : 'btn-ghost border border-base-300/60'"
        :disabled="disabled"
        :aria-pressed="!modelValue"
        @click="select(undefined)"
      >
        {{ $t('settingsApp.agents.agentAvatarNone') }}
      </button>
      <button
        v-for="opt in AGENT_AVATAR_OPTIONS"
        :key="opt.slug"
        type="button"
        class="btn btn-sm btn-square h-11 w-11 min-h-11 p-1 border border-base-300/50"
        :class="
          modelValue === opt.slug
            ? 'btn-primary ring-2 ring-primary ring-offset-2 ring-offset-base-100'
            : 'btn-ghost'
        "
        :disabled="disabled"
        :aria-pressed="modelValue === opt.slug"
        :title="opt.slug"
        @click="select(opt.slug)"
      >
        <img :src="opt.url" class="w-8 h-8 object-contain" alt="" />
      </button>
    </div>
  </div>
</template>
