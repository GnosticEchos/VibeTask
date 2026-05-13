<template>
  <!-- All classes checked for DaisyUI compliance -->
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      'btn',
      variantClass,
      sizeClass,
      shapeClass,
      disabled ? 'btn-disabled' : '',
      loading ? 'btn-loading' : '',
      customClass
    ]"
    v-bind="$attrs"
    :aria-label="ariaLabel || label"
  >
    <span v-if="loading" class="loading loading-spinner"></span>
    <span v-else-if="icon && iconPosition === 'left'" class="mr-2">
      <i :class="icon"></i>
    </span>
    <span v-if="label">{{ label }}</span>
    <span v-else-if="$slots.default">
      <slot />
    </span>
    <span v-if="icon && iconPosition === 'right'" class="ml-2">
      <i :class="icon"></i>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
// TODO: Import your icon set, e.g., Heroicons or Material Symbols

const props = defineProps({
  label: String,
  icon: String, // Icon name (e.g. plus, user) for icon component
  iconPosition: { type: String, default: 'left' }, // or 'right'
  type: { type: String as () => 'button' | 'submit' | 'reset', default: 'button' },
  variant: { type: String, default: 'primary' }, // 'primary', 'secondary', 'accent', 'ghost', 'outline', 'link', etc.
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  small: { type: Boolean, default: false },
  large: { type: Boolean, default: false },
  shape: { type: String, default: '' }, // 'btn-circle', 'btn-square'
  customClass: { type: String, default: '' },
  ariaLabel: { type: String, default: '' }
})

const sizeClass = computed(() => {
  if (props.small) return 'btn-sm'
  if (props.large) return 'btn-lg'
  return ''
})

const variantClass = computed(() => {
  switch (props.variant) {
    case 'secondary':
      return 'btn-secondary'
    case 'accent':
      return 'btn-accent'
    case 'info':
      return 'btn-info'
    case 'success':
      return 'btn-success'
    case 'warning':
      return 'btn-warning'
    case 'error':
      return 'btn-error'
    case 'ghost':
      return 'btn-ghost'
    case 'outline':
      return 'btn-outline'
    case 'link':
      return 'btn-link'
    default:
      return 'btn-primary'
  }
})

const shapeClass = computed(() => {
  switch (props.shape) {
    case 'circle':
      return 'btn-circle'
    case 'square':
      return 'btn-square'
    default:
      return ''
  }
})
</script>
