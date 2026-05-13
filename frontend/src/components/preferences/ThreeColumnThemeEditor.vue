<template>
  <div
    class="theme-editor p-3 sm:p-4 rounded-2xl border border-base-300/60 bg-base-100/30 backdrop-blur-sm h-full w-full min-w-0 max-w-full shadow-sm"
  >
    <div
      class="grid gap-x-2 gap-y-1 items-center text-center font-bold mb-2 text-xs sm:text-sm [grid-template-columns:minmax(4.5rem,6.5rem)_repeat(3,minmax(0,1fr))]"
    >
      <div class="text-left pl-0.5">Role</div>
      <div>Light</div>
      <div>Dark</div>
      <div class="flex flex-col items-center gap-0.5">
        <span>Random</span>
        <button type="button" class="btn btn-xs btn-accent shrink-0" @click="spinRandom">Spin</button>
      </div>
    </div>
    <div class="theme-editor-scroll space-y-1.5 overflow-x-auto overflow-y-auto">
      <template v-for="role in daisyRoles" :key="role.name">
        <div
          class="grid gap-x-2 items-center min-w-0 [grid-template-columns:minmax(4.5rem,6.5rem)_repeat(3,minmax(0,1fr))]"
        >
          <div class="text-left capitalize py-0.5 font-semibold text-xs leading-tight break-words">
            <span class="tooltip" :data-tip="role.desc">{{ role.name }}</span>
          </div>
          <ColorRoleEditor
            :label="role.name"
            :hex-color="mappedLight[role.name]"
            :role-name="role.name + '-light'"
            @update:hexColor="(newHex) => updatePalette('light', role.name, newHex)"
          />
          <ColorRoleEditor
            :label="role.name"
            :hex-color="mappedDark[role.name]"
            :role-name="role.name + '-dark'"
            @update:hexColor="(newHex) => updatePalette('dark', role.name, newHex)"
          />
          <ColorRoleEditor
            :label="role.name"
            :hex-color="mappedRandom[role.name]"
            :role-name="role.name + '-random'"
            @update:hexColor="(newHex) => updatePalette('random', role.name, newHex)"
            :title="hexToOklch(mappedRandom[role.name])"
          />
        </div>
      </template>
    </div>
    <div class="mt-4 grid grid-cols-1 gap-2 min-[520px]:grid-cols-2 min-[900px]:grid-cols-4 min-[900px]:gap-3">
      <div class="hidden min-[900px]:block" aria-hidden="true" />
      <span
        class="tooltip block min-w-0"
        :data-tip="isPaletteInCollection('light') ? t('settingsHub.themePlayground.collectionAlreadyLight') : ''"
      >
        <button
          type="button"
          class="btn btn-primary btn-sm w-full min-h-11 whitespace-normal h-auto py-2 px-2 leading-snug text-center text-xs sm:text-sm"
          :disabled="isPaletteInCollection('light')"
          @click="addLightToThemeCollection"
        >
          {{ t('settingsHub.themePlayground.addToCollection') }}
        </button>
      </span>
      <span
        class="tooltip block min-w-0"
        :data-tip="isPaletteInCollection('dark') ? t('settingsHub.themePlayground.collectionAlreadyDark') : ''"
      >
        <button
          type="button"
          class="btn btn-primary btn-sm w-full min-h-11 whitespace-normal h-auto py-2 px-2 leading-snug text-center text-xs sm:text-sm"
          :disabled="isPaletteInCollection('dark')"
          @click="addDarkToThemeCollection"
        >
          {{ t('settingsHub.themePlayground.addToCollection') }}
        </button>
      </span>
      <span class="tooltip block min-w-0" :data-tip="t('settingsHub.themePlayground.addRandomCollectionTip')">
        <button
          type="button"
          class="btn btn-primary btn-sm w-full min-h-11 whitespace-normal h-auto py-2 px-2 leading-snug text-center text-xs sm:text-sm"
          :disabled="isPaletteInCollection('random')"
          @click="addRandomToThemeCollection"
        >
          {{ t('settingsHub.themePlayground.addToCollection') }}
        </button>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, getCurrentInstance } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { usePlaygroundStore } from '@/stores/playgroundStore';
import { useThemeStore } from '@/stores/themeStore';
import ColorRoleEditor from './ColorRoleEditor.vue';
import Color from 'color';

const { t } = useI18n();

const playgroundStore = usePlaygroundStore();
const themeStore = useThemeStore();
const { lightPalette, darkPalette, randomPalette } = storeToRefs(playgroundStore);
const { customPalettes } = storeToRefs(themeStore);

// Reference to the parent component
const parentComponent = ref<any>(null);

const daisyRoles = [
  { name: 'primary', desc: 'Main brand color for primary actions' },
  { name: 'primary-content', desc: 'Text/icon color on primary' },
  { name: 'secondary', desc: 'Secondary brand color' },
  { name: 'secondary-content', desc: 'Text/icon color on secondary' },
  { name: 'accent', desc: 'Accent color for highlights' },
  { name: 'accent-content', desc: 'Text/icon color on accent' },
  { name: 'neutral', desc: 'Neutral color for backgrounds' },
  { name: 'neutral-content', desc: 'Text/icon color on neutral' },
  { name: 'base-100', desc: 'Main background color' },
  { name: 'base-200', desc: 'Secondary background color' },
  { name: 'base-300', desc: 'Tertiary background color' },
  { name: 'base-content', desc: 'Default text color' },
  { name: 'info', desc: 'Info state color' },
  { name: 'info-content', desc: 'Text/icon color on info' },
  { name: 'success', desc: 'Success state color' },
  { name: 'success-content', desc: 'Text/icon color on success' },
  { name: 'warning', desc: 'Warning state color' },
  { name: 'warning-content', desc: 'Text/icon color on warning' },
  { name: 'error', desc: 'Error state color' },
  { name: 'error-content', desc: 'Text/icon color on error' },
];

const mappedLight = computed(() => lightPalette.value);
const mappedDark = computed(() => darkPalette.value);
const mappedRandom = computed(() => randomPalette.value);

function updatePalette(mode: 'light' | 'dark' | 'random', role: string, newHex: string) {
  if (mode === 'light') {
    lightPalette.value = { ...lightPalette.value, [role]: newHex };
  } else if (mode === 'dark') {
    darkPalette.value = { ...darkPalette.value, [role]: newHex };
  } else {
    randomPalette.value = { ...randomPalette.value, [role]: newHex };
  }
}

function spinRandom() {
  // Call the enhanced random theme generation from the parent component
  if (parentComponent.value && typeof parentComponent.value.generateRandomTheme === 'function') {
    parentComponent.value.generateRandomTheme();
  } else {
    // Fallback to simple random generation
    const roles = daisyRoles.map(r => r.name);
    const palette: Record<string, string> = {};
    roles.forEach(role => {
      palette[role] = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    });
    randomPalette.value = palette;
  }
}

// Ensure proper contrast for content colors
function ensureContrast(bgColor: string, contentColor: string): string {
  try {
    const bg = Color(bgColor);
    const content = Color(contentColor);
    const contrast = bg.contrast(content);
    
    // If contrast is sufficient, return the content color
    if (contrast >= 4.5) {
      return contentColor;
    }
    
    // Otherwise, return black or white based on which has better contrast
    const black = Color('#000000');
    const white = Color('#ffffff');
    const blackContrast = bg.contrast(black);
    const whiteContrast = bg.contrast(white);
    
    return blackContrast > whiteContrast ? '#000000' : '#ffffff';
  } catch (error) {
    console.error('Error ensuring contrast:', error);
    return '#ffffff'; // Fallback
  }
}

function palettesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  if (!a || !b) return false;
  const keys = Object.keys(a);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function isPaletteInCollection(mode: 'light' | 'dark' | 'random') {
  const palette = mode === 'light' ? lightPalette.value : mode === 'dark' ? darkPalette.value : randomPalette.value;
  const stored = customPalettes.value[mode];
  if (!stored) return false;
  return palettesEqual(palette, stored);
}

function addLightToThemeCollection() {
  // Ensure proper contrast before saving
  const paletteWithContrast = { ...lightPalette.value };
  for (const role in paletteWithContrast) {
    if (role.endsWith('-content')) {
      const baseRole = role.replace('-content', '');
      const bgColor = paletteWithContrast[baseRole];
      if (bgColor) {
        paletteWithContrast[role] = ensureContrast(bgColor, paletteWithContrast[role]);
      }
    }
  }
  themeStore.setCustomPalette('customlight', paletteWithContrast);
}

function addDarkToThemeCollection() {
  // Ensure proper contrast before saving
  const paletteWithContrast = { ...darkPalette.value };
  for (const role in paletteWithContrast) {
    if (role.endsWith('-content')) {
      const baseRole = role.replace('-content', '');
      const bgColor = paletteWithContrast[baseRole];
      if (bgColor) {
        paletteWithContrast[role] = ensureContrast(bgColor, paletteWithContrast[role]);
      }
    }
  }
  themeStore.setCustomPalette('customdark', paletteWithContrast);
}

function addRandomToThemeCollection() {
  // Ensure proper contrast before saving
  const paletteWithContrast = { ...randomPalette.value };
  for (const role in paletteWithContrast) {
    if (role.endsWith('-content')) {
      const baseRole = role.replace('-content', '');
      const bgColor = paletteWithContrast[baseRole];
      if (bgColor) {
        paletteWithContrast[role] = ensureContrast(bgColor, paletteWithContrast[role]);
      }
    }
  }
  themeStore.setCustomPalette('random', paletteWithContrast);
}

function hexToOklch(hex: string): string {
  try {
    return Color(hex).lch().string();
  } catch {
    return hex;
  }
}

// Set up reference to parent component
onMounted(() => {
  // Try to find the parent component that contains the generateRandomTheme function
  let parent = getCurrentInstance()?.parent;
  while (parent) {
    if (parent.exposed && typeof parent.exposed.generateRandomTheme === 'function') {
      parentComponent.value = parent.exposed;
      break;
    }
    parent = parent.parent;
  }
});
</script>

<style scoped>
.theme-editor-scroll {
  max-height: min(52vh, 480px);
}
</style> 