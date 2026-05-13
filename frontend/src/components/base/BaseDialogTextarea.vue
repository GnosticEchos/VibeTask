<script setup lang="ts">
import { computed, onMounted, Ref, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits(['update:modelValue'])

const props = defineProps({
  label: {
    type: String,
    default: '',
  },
  header: {
    type: String,
    default: '',
  },
  modelValue: {
    type: String,
    default: '',
  },
})

const visible: Ref<boolean> = ref(false)
const inputValue: Ref<string> = ref('')

const resetInputValue = () => {
  inputValue.value = props.modelValue
}

onMounted(() => {
  resetInputValue()
})

const buttonLabel = computed(() => {
  return props.label || t('actions.open')
})

const openDialog = () => {
  resetInputValue()
  visible.value = true
}

const confirm = () => {
  emit('update:modelValue', inputValue.value)
  inputValue.value = ''
  visible.value = false
}
</script>

<template>
  <!-- All classes checked for DaisyUI compliance -->
  <div :key="visible.toString()">
    <slot name="trigger" :openDialog="openDialog" />
    <BaseButton
      v-if="!$slots.trigger"
      @click="openDialog"
      :label="buttonLabel"
    />
    <!-- TODO: Replace with DaisyUI Modal/Textarea -->
    <div v-if="visible">
      <div class="modal">
        <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
          {{ header }}
        </h3>
        <div class="px-4 pt-2 pb-4">
          <textarea v-model="inputValue" class="w-full" />
          <div class="flex mt-4 justify-end">
            <BaseButton @click="confirm" :label="$t('actions.confirm')" icon="check" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
