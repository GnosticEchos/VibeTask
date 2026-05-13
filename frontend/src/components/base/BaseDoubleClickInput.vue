<script setup lang="ts">
import { Form } from 'vee-validate'
import { computed, nextTick, ref } from 'vue'

const emit = defineEmits([
  'setEditingState',
  'updateValue',
  'submitValue',
  'onEnterKeyup',
])

const props = defineProps({
  value: {
    type: String,
    default: null,
  },
  isEditing: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  rules: {
    type: Array,
    default: [],
  },
  valueKey: {
    type: String,
    default: '',
  },
  label: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  maxLength: {
    type: Number,
    default: 0,
  },
  // The component prop is no longer needed as we are using FwbInput directly
  // component: {
  //   type: Object as () => ComponentOptions,
  //   default: InputText,
  // },
  medium: {
    type: Boolean,
    default: false,
  },
  dense: {
    type: Boolean,
    default: false,
  },
  tooltipConfig: {
    type: Object,
    default: () => ({}),
  },
  customEnterKeyEvent: {
    type: Boolean,
    default: false,
  },
})

type inputRefType = {
  childRef: any
}

const baseInputRef = ref<inputRefType | null>(null)

const tempValue = ref<string>('')

const computedValue = computed<string>({
  get() {
    return tempValue.value || props.value
  },
  set(value: string) {
    onValueUpdate(value)
  },
})

const setEditing = () => {
  emit('setEditingState', { key: props.valueKey, value: true })
  nextTick(() => {
    const elementWrapper = baseInputRef.value?.childRef
    const input = elementWrapper.querySelector('input')

    if (input) {
      input.focus()
      input.click()
    }
  })
}

const onEnterKeyup = (errors: any) => {
  if (Object.keys(errors).length) return

  if (props.customEnterKeyEvent) {
    emit('onEnterKeyup')
  } else {
    emit('submitValue', props.valueKey)
  }
}

const onValueUpdate = (value: string) => {
  tempValue.value = value
  emit('updateValue', { key: props.valueKey, value })
}
</script>

<template>
  <!-- All classes checked for DaisyUI compliance -->
  <div
    class="w-full"
    :class="[!isEditing && !disabled ? 'hover:bg-base-200 cursor-pointer' : '', !dense ? 'p-2' : '']"
    @dblclick="setEditing"
    @keydown.esc.stop="$emit('setEditingState', { key: valueKey, value: false })"
  >
    <div v-if="!isEditing">
      <span
        v-if="!$slots.default"
        v-html="computedValue || `${placeholder}...`"
        :class="[medium ? 'text-base font-normal' : 'text-sm', !value ? 'text-base-content/70' : 'text-base-content', 'min-h-[15px]']"
      />
      <slot></slot>
    </div>
    <Form v-else v-slot="{ errors }" @submit="">
      <div @keyup.enter.exact="onEnterKeyup(errors)">
        <BaseInput
          ref="baseInputRef"
          v-model="computedValue"
          :name="valueKey"
          :label="label"
          :placeholder="placeholder"
          :rules="rules"
          :maxLength="1000"
        >
          <template #append>
            <div class="mt-1">
              <BaseButton
                @click="$emit('submitValue', valueKey)"
                icon="check"
                small
                :disabled="Object.keys(errors).length > 0 || disabled"
              />
              <BaseButton
                icon="times"
                class="ml-2"
                small
                @click="$emit('setEditingState', { key: valueKey, value: false })"
              />
            </div>
          </template>
        </BaseInput>
      </div>
    </Form>
  </div>
</template>

