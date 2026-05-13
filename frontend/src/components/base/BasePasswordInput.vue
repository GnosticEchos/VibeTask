<script setup lang="ts">
import rules from '@/utils/validators'
import { useField } from 'vee-validate'
import { computed, useAttrs, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits(['update:modelValue', 'change', 'input', 'blur'])

const props = defineProps({
  modelValue: {
    type: String,
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
  placeholder: String,
  disabled: Boolean,
  autocomplete: String,
  maxLength: Number,
})

const attrs = useAttrs()

const { t } = useI18n()

const showPassword = ref(false)

const passwordRules = computed(() => {
  if (Array.isArray(props.rules)) {
    return props.rules;
  }
  // Default rules if props.rules is a string or empty
  return [
    (value: string) => rules.required(value, t('login.password')),
    rules.password,
  ];
})

const { value, errorMessage } = useField(props.name, validateField)

function validateField(value: any) {
  const errorMessages: string[] = [];
  passwordRules.value.forEach((rule: any) => {
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
</script>

<template>
  <!-- All classes checked for DaisyUI compliance -->
  <div>
    <label v-if="label" :for="props.name" class="block mb-1 text-base-content">{{ label }}</label>
    <input
      v-model="value"
      :id="props.name"
      :type="showPassword ? 'text' : 'password'"
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
    />
    <button type="button" class="btn btn-ghost btn-xs ml-2" @click="showPassword = !showPassword">
      {{ showPassword ? 'Hide' : 'Show' }}
    </button>
    <div v-if="errorMessage" class="text-error text-xs mt-1">{{ errorMessage }}</div>
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
