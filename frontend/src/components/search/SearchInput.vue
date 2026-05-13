<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  showHelp?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'search', value: string): void
  (e: 'clear'): void
}>()

const { t } = useI18n()

const inputRef = ref<HTMLInputElement | null>(null)
const showHelpTooltip = ref(false)

const inputValue = computed({
  get: () => props.modelValue ?? '',
  set: (value: string) => emit('update:modelValue', value),
})

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && inputValue.value.trim()) {
    emit('search', inputValue.value)
  }
  if (event.key === 'Escape') {
    emit('clear')
  }
}

function handleClear() {
  emit('update:modelValue', '')
  emit('clear')
}

function focus() {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="relative w-full">
    <div class="relative">
      <input
        ref="inputRef"
        type="text"
        :value="inputValue"
        @input="handleInput"
        @keydown="handleKeydown"
        :placeholder="placeholder || t('search.placeholder')"
        class="input input-bordered w-full pr-24"
        aria-label="Search tasks"
      />
      <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
        <button
          v-if="showHelp"
          type="button"
          class="btn btn-ghost btn-xs shrink-0"
          :title="t('search.helpTooltip')"
          @click="showHelpTooltip = !showHelpTooltip"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <button
          v-if="inputValue"
          type="button"
          class="btn btn-ghost btn-xs shrink-0"
          @click="handleClear"
          :title="t('search.clear')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Help tooltip -->
    <div
      v-if="showHelp && showHelpTooltip"
      class="absolute z-50 top-full left-0 right-0 mt-2 p-4 bg-base-200 rounded-lg shadow-lg border border-base-300"
    >
      <h4 class="font-semibold text-sm mb-2">{{ t('search.syntaxHelp') }}</h4>
      <div class="text-xs space-y-1 text-base-content/80">
        <p><code class="bg-base-300 px-1 rounded">field:value</code> - Search specific field</p>
        <p class="mt-2">{{ t('search.examples') }}:</p>
        <ul class="list-disc list-inside mt-1 space-y-1">
          <li><code>Description: Feature X</code></li>
          <li><code>Assignee: Bob</code></li>
          <li><code>priority:high status:done</code></li>
          <li><code>due:>2024-01-01</code></li>
          <li><code>due:2024-01-01..2024-01-31</code></li>
        </ul>
        <p class="mt-2 text-base-content/60">{{ t('search.availableFields') }}:</p>
        <p class="text-base-content/60">title, description, assignee, creator, comments, status, priority, due, tags, column</p>
      </div>
    </div>
  </div>
</template>
