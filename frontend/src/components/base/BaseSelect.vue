<script setup lang="ts">
import { computed } from 'vue'
import { useField } from 'vee-validate'

const emit = defineEmits(['update:modelValue', 'change', 'onErrorChange', 'cleared'])

const props = defineProps({
  modelValue: [String, Number],
  name: {
    type: String,
    required: true,
  },
  rules: {
    type: Array,
    default: [],
  },
  items: {
    type: Array,
    default: [],
  },
  label: {
    type: String,
    default: '',
  },
  optionsLabel: {
    type: String,
    default: 'name',
  },
  optionsValue: {
    type: String,
    default: 'id',
  },
  placeholder: {
    type: String,
    default: '',
  },
  showClear: {
    type: Boolean,
    default: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const { errorMessage } = useField(props.name, validateField)

function validateField(value: any) {
  const errorMessages: string[] = []

  props.rules.forEach((rule: any) => {
    const result = rule(value)
    if (result !== true) {
      errorMessages.push(result)
    }
  })

  if (errorMessages.length) {
    return errorMessages[0]
  }

  return true
}

const options = computed(() => {
  return props.items.map((item: any) => ({
    label: item[props.optionsLabel],
    value: item[props.optionsValue],
  }))
})

const localValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})
</script>

<template>
  <!-- All classes checked for DaisyUI compliance -->
  <div>
    <label v-if="label" :for="props.name" class="block mb-1 text-base-content">{{ label }}</label>
    <select
      v-model="localValue"
      :id="props.name"
      :name="props.name"
      :disabled="disabled"
      :class="[
        'select select-bordered w-full',
        errorMessage ? 'select-error' : 'select-primary',
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      ]"
      v-bind="$attrs"
      @change="$emit('change', $event)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <div v-if="errorMessage" class="text-error text-xs mt-1">{{ errorMessage }}</div>
  </div>
</template>
