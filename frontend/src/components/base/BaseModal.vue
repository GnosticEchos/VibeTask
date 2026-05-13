<script setup lang="ts">
import { ref, watchEffect } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  title?: string;
}>();

const emit = defineEmits(['update:modelValue']);

const dialog = ref<HTMLDialogElement | null>(null);

watchEffect(() => {
  const modal = dialog.value;
  if (modal) {
    if (props.modelValue && !modal.open) {
      modal.showModal();
    } else if (!props.modelValue && modal.open) {
      modal.close();
    }
  }
});

const closeModal = () => {
  emit('update:modelValue', false);
};

// Handles the 'close' event from the dialog, which can be triggered by the ESC key
// or by the form submission if we were to add a <form method="dialog">.
const onDialogClose = () => {
  emit('update:modelValue', false);
};
</script>

<template>
  <dialog 
    ref="dialog" 
    class="modal modal-bottom sm:modal-middle"
    @close="onDialogClose"
  >
    <div class="modal-box rounded-xl bg-base-100">
      <div class="flex justify-between items-center">
        <h3 v-if="title" class="font-bold text-lg">{{ title }}</h3>
        <button
          class="btn btn-sm btn-circle btn-ghost"
          @click="closeModal"
        >
          ✕
        </button>
      </div>
      <div v-if="title" class="divider mt-2 mb-4"></div>
      
      <slot />

      <div class="modal-action">
        <slot name="actions" />
      </div>
    </div>
    <div class="modal-backdrop">
      <button @click="closeModal">close</button>
    </div>
  </dialog>
</template> 