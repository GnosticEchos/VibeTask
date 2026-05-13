<template>
  <div class="flex flex-col">
    <div class="flex items-center gap-0.5 min-w-0 flex-wrap sm:flex-nowrap">
      <input
        :id="props.roleName"
        type="color"
        :value="props.hexColor"
        @input="handleInput"
        class="rounded-md border border-base-300 cursor-pointer shrink-0"
        style="width: 26px; height: 26px; min-width: 26px; min-height: 26px; max-width: 26px; max-height: 26px; padding: 0"
      />
      <input
        type="text"
        :value="props.hexColor"
        @input="handleInput"
        class="min-w-0 w-full max-w-[5.25rem] sm:max-w-[5.75rem] px-1 py-0.5 border border-base-300 rounded-md bg-base-100 text-xs font-mono text-base-content"
        :title="`Use this value for ${props.label} role: ${props.hexColor}`"
        spellcheck="false"
      />
      <div
        class="w-5 h-5 rounded border border-base-300 shrink-0"
        :style="{ backgroundColor: props.hexColor }"
        :title="`Preview of ${props.label} color: ${props.hexColor}`"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  label: {
    type: String,
    required: true,
  },
  hexColor: {
    type: String,
    required: true,
  },
  roleName: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['update:hexColor']);

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (target && 'value' in target) {
    emit('update:hexColor', target.value);
  }
}
</script>

<style scoped>
/* No specific styles needed for now, Tailwind handles most of it */
</style>