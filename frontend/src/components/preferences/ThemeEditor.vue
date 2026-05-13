<template>
  <div class="theme-editor p-4 rounded-lg shadow-md h-full" style="border:none;">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Theme Selector -->
      <div>
        <h3 class="font-bold mb-2">DaisyUI Themes</h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="theme in daisyThemes"
            :key="theme.name"
            class="btn btn-sm"
            @click="selectTheme(theme)"
          >
            {{ theme.name }}
            <span class="ml-1 badge" :class="theme.colorScheme === 'dark' ? 'badge-neutral' : 'badge-accent'">
              {{ theme.colorScheme }}
            </span>
          </button>
        </div>
        
        <!-- M3 Theme Generator -->
        <div class="mt-4">
          <h3 class="font-bold mb-2">M3 Theme Generator</h3>
          <div class="flex items-center gap-2">
            <input 
              type="color" 
              v-model="sourceColor" 
              class="w-10 h-10 border rounded cursor-pointer"
            >
            <span class="text-sm">Source Color: {{ sourceColor }}</span>
            <button class="btn btn-sm btn-primary" @click="generateM3Themes">Generate</button>
          </div>
        </div>
      </div>
      
      <!-- Theme Editor -->
      <div v-if="selectedTheme">
        <div class="flex gap-4">
          <!-- Original Theme Column -->
          <div>
            <div class="tooltip" :data-tip="'Original: ' + selectedTheme.colorScheme + ' theme'">
              <h4 class="font-semibold mb-2">Original ({{ selectedTheme.colorScheme }})</h4>
            </div>
            <table class="table table-zebra w-full bg-base-100">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(value, key) in getRoleMap(selectedTheme.theme)" :key="key">
                  <td>{{ key }}</td>
                  <td>
                    <span :style="{ background: value, display: 'inline-block', width: '2rem', height: '1rem', borderRadius: '0.25rem', border: '1px solid #ccc' }"></span>
                    <span class="ml-2">{{ value }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Inverted Theme Column -->
          <div>
            <div class="tooltip" :data-tip="'Auto-generated: ' + (selectedTheme.colorScheme === 'dark' ? 'light' : 'dark') + ' theme'">
              <h4 class="font-semibold mb-2">Auto-fill ({{ selectedTheme.colorScheme === 'dark' ? 'light' : 'dark' }})</h4>
            </div>
            <table class="table table-zebra w-full bg-base-100">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(value, key) in getRoleMap(getPairedTheme(selectedTheme.theme, selectedTheme.colorScheme))" :key="key">
                  <td>{{ key }}</td>
                  <td>
                    <span :style="{ background: value, display: 'inline-block', width: '2rem', height: '1rem', borderRadius: '0.25rem', border: '1px solid #ccc' }"></span>
                    <span class="ml-2">{{ value }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- M3 Generated Themes Preview -->
      <div v-if="sourceColor">
        <h4 class="font-semibold mb-2">M3 Generated Themes</h4>
        <div class="flex gap-4">
          <div>
            <h5 class="font-medium mb-1">Light Theme</h5>
            <table class="table table-zebra w-full bg-base-100">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(value, key) in generateM3LightTheme()" :key="key">
                  <td>{{ key }}</td>
                  <td>
                    <span :style="{ background: value, display: 'inline-block', width: '2rem', height: '1rem', borderRadius: '0.25rem', border: '1px solid #ccc' }"></span>
                    <span class="ml-2">{{ value }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h5 class="font-medium mb-1">Dark Theme</h5>
            <table class="table table-zebra w-full bg-base-100">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(value, key) in generateM3DarkTheme()" :key="key">
                  <td>{{ key }}</td>
                  <td>
                    <span :style="{ background: value, display: 'inline-block', width: '2rem', height: '1rem', borderRadius: '0.25rem', border: '1px solid #ccc' }"></span>
                    <span class="ml-2">{{ value }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
   <button class="btn btn-primary mt-4 w-full" @click="applyTheme">Apply Theme</button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useThemeStore } from '@/stores/themeStore';
import {
  getAllDaisyThemes,
  daisyThemeToRoleMap,
  generateM3Theme,
  semanticPairFromDark,
  semanticPairFromLight,
} from './PaletteMapper.js';
import type { DaisyPalette } from '@/stores/themeStore';

// Define the expected theme type
interface DaisyTheme {
  name: string;
  colorScheme: string;
  theme: Record<string, string>;
}

const themeStore = useThemeStore();

const daisyThemes: DaisyTheme[] = getAllDaisyThemes();
const selectedTheme = ref<DaisyTheme | null>(null);
const sourceColor = ref('#4f46e5'); // Default source color

// Utility to generate an empty palette with all required keys
const emptyPalette: Record<string, string> = {
  'primary': '', 'primary-content': '',
  'secondary': '', 'secondary-content': '',
  'accent': '', 'accent-content': '',
  'neutral': '', 'neutral-content': '',
  'base-100': '', 'base-200': '', 'base-300': '', 'base-content': '',
  'info': '', 'info-content': '',
  'success': '', 'success-content': '',
  'warning': '', 'warning-content': '',
  'error': '', 'error-content': ''
};

function selectTheme(theme: DaisyTheme) {
  selectedTheme.value = theme;
}

function getPairedTheme(theme: Record<string, string>, colorScheme: string): Record<string, string> {
  const mapped = { ...emptyPalette, ...daisyThemeToRoleMap(theme as Record<string, string>) }
  if (colorScheme === 'light') {
    return { ...emptyPalette, ...semanticPairFromLight(mapped) }
  }
  return { ...emptyPalette, ...semanticPairFromDark(mapped) }
}

// Generate M3 theme from source color
function generateM3LightTheme() {
  return generateM3Theme(sourceColor.value, 'light');
}

function generateM3DarkTheme() {
  return generateM3Theme(sourceColor.value, 'dark');
}

function getRoleMap(themeObj: Record<string, string>): Record<string, string> {
  // Type guard: if themeObj is empty, return a default palette to satisfy TS
  if (!themeObj || Object.keys(themeObj).length === 0) {
    return { ...emptyPalette };
  }
  // Always merge with emptyPalette to guarantee all keys
  return { ...emptyPalette, ...daisyThemeToRoleMap(themeObj as Record<string, string>) };
}

const palette = ref<DaisyPalette>({ ...themeStore.palette } as Record<string, string>);

watch(
  () => themeStore.palette,
  (newPalette: Record<string, string>) => {
    const emptyPalette: Record<string, string> = {
      'primary': '', 'primary-content': '',
      'secondary': '', 'secondary-content': '',
      'accent': '', 'accent-content': '',
      'neutral': '', 'neutral-content': '',
      'base-100': '', 'base-200': '', 'base-300': '', 'base-content': '',
      'info': '', 'info-content': '',
      'success': '', 'success-content': '',
      'warning': '', 'warning-content': '',
      'error': '', 'error-content': ''
    };
    palette.value = { ...(newPalette && Object.keys(newPalette).length > 0 ? newPalette : emptyPalette) } as Record<string, string>;
  },
  { immediate: true, deep: true }
);

const applyTheme = () => {
  themeStore.setPalette(palette.value);
};

function generateM3Themes() {
  // This function could be expanded to actually apply the generated themes
  // For now, it just triggers the generation which is shown in the preview
  console.log('Generating M3 themes from color:', sourceColor.value);
}
</script>

<style scoped>
.theme-editor-scroll {
  max-height: 520px;
  overflow-y: auto;
}
</style>
