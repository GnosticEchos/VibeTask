<script setup lang="ts">
import { stripHTML } from '@/utils/functions'
import { useField } from 'vee-validate'
import { computed, onMounted, watch, useAttrs } from 'vue'
// import { FwbInput } from 'flowbite-vue' // Removed

const emit = defineEmits(['update:modelValue', 'onErrorChange', 'change', 'input', 'blur'])

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  name: {
    type: String,
    required: true,
  },
  rules: {
    type: [String, Array],
    default: '',
  },
  label: String,
  iconRight: {
    type: String,
    default: '',
  },
  autocomplete: {
    type: String,
    default: 'off',
  },
  placeholder: {
    type: String,
    default: '',
  },
  maxLength: {
    type: Number,
    default: 0,
  },
  hideDetails: {
    type: Boolean,
    default: false,
  },
  emitErrors: {
    type: Boolean,
    default: false,
  },
  validateOnCreate: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const attrs = useAttrs()

const {
  value: useFieldValue,
  errorMessage,
  errors,
} = useField(props.name, validateField, {
  initialValue: props.modelValue,
})

watch(
  () => props.modelValue,
  (next) => {
    if (next !== useFieldValue.value) {
      useFieldValue.value = next
    }
  },
  { immediate: true },
)

watch(useFieldValue, (newValue) => {
  emit('update:modelValue', newValue)
})

onMounted(() => {
  if (props.validateOnCreate && props.emitErrors && !useFieldValue.value) {
    emit('onErrorChange', { key: props.name, value: '' })
  }

  if (props.emitErrors) {
    setupWatcher()
  }
})

const setupWatcher = () => {
  watch(
    () => errors.value,
    () => {
      emit('onErrorChange', { key: props.name, value: errors.value[0] })
    },
  )
}

function validateField(value: any) {
  if (typeof props.rules === 'string') {
    // Let VeeValidate handle string-based rules
    return true;
  }
  const errorMessages: string[] = [];
  props.rules.forEach((rule: any) => {
    const result = rule(value);
    if (result !== true) {
      errorMessages.push(result);
    }
  });
  if (errorMessages.length) {
    return errorMessages[0];
  }
  return true;
}

const fieldText = computed(() => String(useFieldValue.value ?? ''))

const valueLeftLength = computed<number>(() => {
  return Math.max(props.maxLength - stripHTML(fieldText.value).length, 0)
})
</script>

<template>
  <!-- All classes checked for DaisyUI compliance -->
  <div>
    <label v-if="label" :for="props.name" class="block mb-1 text-base-content">{{ label }}</label>
    <input
      v-model="useFieldValue"
      :id="props.name"
      :placeholder="placeholder"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :maxlength="maxLength || undefined"
      :name="props.name"
      :class="[
        'input input-bordered w-full outline-none focus:outline-none focus:ring-0 focus:shadow-none shadow-none',
        errorMessage ? 'input-error' : 'input-primary',
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      ]"
      v-bind="attrs"
      @input="$emit('input', $event)"
      @change="$emit('change', $event)"
      @blur="$emit('blur', $event)"
    />
    <div v-if="!hideDetails" class="flex mb-2 mt-1" style="height: 15px">
      <slot name="append" />
      <small
        v-if="!$slots.append && maxLength"
        :class="{ 'text-error': errorMessage && maxLength - fieldText.length < 0 }"
      >{{ $t('tasks.left', { number: valueLeftLength }) }}</small>
    </div>
    <div v-if="errorMessage && !hideDetails" class="text-error text-xs mt-1">{{ errorMessage }}</div>
  </div>
</template>

<style scoped>
input {
  outline: none;
  box-shadow: none;
}

input:focus {
  outline: none;
  box-shadow: none;
}
</style>
