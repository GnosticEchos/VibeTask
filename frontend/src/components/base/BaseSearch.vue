<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps({
  modelValue: String,
  label: String,
  loading: Boolean,
  disabled: Boolean,
})

const query = ref<string>('')

onMounted(() => {
  if (props.modelValue) {
    query.value = props.modelValue
  }
})
</script>

<template>
  <!-- All classes checked for DaisyUI compliance -->
  <div>
    <input
      v-model="query"
      :placeholder="label"
      :class="[
        'input input-bordered w-full',
        'text-base-content',
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      ]"
      :disabled="disabled"
      @input="$emit('update:modelValue', query)"
    />
  </div>
</template>
