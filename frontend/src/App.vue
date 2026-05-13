<script setup lang="ts">
import { onMounted, watch, computed } from 'vue';
import { useLayoutStore } from '@/stores/layout';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/auth';
import Dialog from './components/layout/dialog/Dialog.vue';
import TopBar from './components/layout/topbar/TopBar.vue';
import BaseToast from './components/base/BaseToast.vue';

const layoutStore = useLayoutStore();
const themeStore = useThemeStore();
const authStore = useAuthStore();

const toastMessage = computed(() => layoutStore.toast.message);
const toastType = computed(() => layoutStore.toast.type);
const toastDuration = computed(() => layoutStore.toast.duration);
const isToastActive = computed(() => layoutStore.toast.isActive);

onMounted(() => {
  themeStore.applyTheme();
});

watch(() => themeStore.themeName, (newTheme) => {
  document.documentElement.setAttribute('data-theme', newTheme);
});

watch(() => authStore.isAuthorized(), (newVal) => {
  if (!newVal) {
    layoutStore.setLayoutDefaultState();
  }
});
</script>

<template>
  <a href="#main-content" class="skip-link sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-primary focus:text-white focus:rounded focus:p-2 z-50">Skip to main content</a>
  <div class="app-container bg-base-100 text-base-content min-h-screen flex flex-col w-full pt-0" :data-theme="themeStore.themeName">
    <TopBar />
    <Dialog />
    <BaseToast 
      v-if="isToastActive"
      :message="toastMessage"
      :type="toastType"
      :duration="toastDuration"
    />
    <!-- Modal removed. For DaisyUI modal best practices, see https://daisyui.com/components/modal/ -->
    <router-view class="flex-1 mt-14" v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>


