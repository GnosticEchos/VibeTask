<template>
  <div class="theme-selector p-4 border rounded-lg shadow-md" v-bind="$attrs">
    <!-- DaisyUI Themes Section -->
    <div class="collapse collapse-arrow bg-base-200 mb-2">
      <input type="checkbox" class="peer" checked />
      <div class="collapse-title text-xl font-semibold">DaisyUI Themes</div>
      <div class="collapse-content">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          <button
            v-for="theme in daisyThemes"
            :key="theme"
            class="btn btn-outline w-full"
            @click="selectDaisyTheme(theme)"
          >
            {{ theme }}
          </button>
        </div>
      </div>
    </div>
    <!-- Tailwind Color Palettes Section -->
    <div class="collapse collapse-arrow bg-base-200 mb-2">
      <input type="checkbox" class="peer" />
      <div class="collapse-title text-xl font-semibold">Tailwind Color Palettes</div>
      <div class="collapse-content">
        <div class="h-96 overflow-y-auto overflow-x-auto w-full max-w-full border-0 shadow-none" style="border:none; box-shadow: none;">
          <div class="flex flex-col gap-0 p-0 m-0">
            <div v-for="(shades, colorName) in tailwindColors" :key="colorName" class="p-0 m-0">
              <h4 class="capitalize font-semibold p-0 m-0 leading-none" style="margin: 0; padding: 1px 0 0; line-height: 1; font-size: 1rem;">
                {{ colorName }}
              </h4>
              <div class="flex flex-nowrap gap-0 p-0 m-0 justify-start w-full min-w-0 flex-grow" style="min-height: 30px;">
                <div
                  v-for="(hex, shade) in shades"
                  :key="shade"
                  :style="{ backgroundColor: hex, width: '30px', height: '30px', borderLeft: '2px solid #d1d5db', borderRight: '2px solid #d1d5db', borderTop: 'none', borderBottom: 'none' }"
                  class="rounded-md cursor-pointer inline-block"
                  @click="selectPalette(colorName)"
                  :title="`${colorName}-${shade}: ${hex}`"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Random Theme Section -->
    <div class="collapse collapse-arrow bg-base-200 mb-2">
      <input type="checkbox" class="peer" />
      <div class="collapse-title text-xl font-semibold">Random Theme Generator</div>
      <div class="collapse-content">
        <!-- Seed Color Selection -->
        <div class="mb-4">
          <h4 class="font-semibold mb-2">Seed Colors (Optional)</h4>
          <div class="flex flex-wrap gap-2 mb-2">
            <div v-for="(_color, index) in seedColors" :key="index" class="flex items-center gap-1">
              <input 
                type="color" 
                v-model="seedColors[index]" 
                class="w-8 h-8 border rounded cursor-pointer"
              >
              <button @click="removeSeedColor(index)" class="btn btn-xs btn-circle btn-ghost">✕</button>
            </div>
            <button @click="addSeedColor" class="btn btn-sm btn-ghost">+ Add Color</button>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-accent btn-sm" @click="selectRandomTheme">Generate Random Theme</button>
            <button class="btn btn-secondary btn-sm" @click="selectInspiredTheme">Generate Inspired Theme</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useThemeStore } from '@/stores/themeStore';
import { mapPaletteToTheme, generateM3Theme } from './PaletteMapper.js';
import Color from 'color';

const themeStore = useThemeStore();
const emit = defineEmits(['theme-selected']);

// Seed colors for inspired theme generation
const seedColors = ref(['#4f46e5', '#14b8a6', '#f97316']);

const daisyThemes = [
  'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave',
  'retro', 'cyberpunk', 'valentine', 'halloween', 'garden', 'forest', 'aqua',
  'lofi', 'pastel', 'fantasy', 'wireframe', 'black', 'luxury', 'dracula',
  'cmyk', 'autumn', 'business', 'acid', 'lemonade', 'night', 'coffee', 'winter',
  'dim', 'nord', 'sunset', 'caramellatte', 'abyss', 'silk'
];

function addSeedColor() {
  seedColors.value.push('#ffffff');
}

function removeSeedColor(index: number) {
  seedColors.value.splice(index, 1);
}

function selectDaisyTheme(theme: string) {
  // Get the theme's color values from DaisyUI (simulate for now)
  // In a real app, fetch or import the theme's palette
  const palette = (themeStore as any).getDaisyPalette?.(theme);
  if (palette) {
    emit('theme-selected', { name: `Custom from ${theme}`, palette: { ...palette } });
  }
}

function selectPalette(colorName: string) {
  // Get the palette object for the colorName
  const palette = (themeStore as any).getTailwindPalette?.(colorName);
  if (palette) {
    const mapped = mapPaletteToTheme(palette);
    emit('theme-selected', { name: `Custom from ${colorName}`, palette: mapped });
  }
}

function selectRandomTheme() {
  // Generate a random DaisyUI-compatible theme
  const roles = [
    'primary', 'primary-content', 'secondary', 'secondary-content', 'accent', 'accent-content',
    'neutral', 'neutral-content', 'base-100', 'base-200', 'base-300', 'base-content',
    'info', 'info-content', 'success', 'success-content', 'warning', 'warning-content',
    'error', 'error-content',
  ];
  const palette: Record<string, string> = {};
  roles.forEach(role => {
    palette[role] = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  });
  emit('theme-selected', { name: 'Random Custom Theme', palette });
}

function selectInspiredTheme() {
  // Generate a theme inspired by seed colors
  const roles = [
    'primary', 'primary-content', 'secondary', 'secondary-content', 'accent', 'accent-content',
    'neutral', 'neutral-content', 'base-100', 'base-200', 'base-300', 'base-content',
    'info', 'info-content', 'success', 'success-content', 'warning', 'warning-content',
    'error', 'error-content',
  ];
  
  const palette: Record<string, string> = {};
  
  // If we have seed colors, use them to influence the generation
  if (seedColors.value.length > 0) {
    // Use the first seed color as the primary color
    const primaryColor = seedColors.value[0];
    const m3Light = generateM3Theme(primaryColor, 'light');
    const m3Dark = generateM3Theme(primaryColor, 'dark');
    
    // Mix the M3 themes with some randomness
    roles.forEach(role => {
      const m3LightR = m3Light as Record<string, string>
    const m3DarkR = m3Dark as Record<string, string>
    if (Math.random() > 0.5 && m3LightR[role]) {
        palette[role] = m3LightR[role]
      } else if (Math.random() > 0.5 && m3DarkR[role]) {
        palette[role] = m3DarkR[role]
      } else {
        const seedIndex = Math.floor(Math.random() * seedColors.value.length)
        const baseColor = seedColors.value[seedIndex]
        
        // Slightly modify the seed color for variety
        try {
          const colorObj = Color(baseColor);
          const hsl = colorObj.hsl().object();
          const hueShift = (Math.random() * 60) - 30; // Shift hue by ±30 degrees
          const newHue = (hsl.h + hueShift) % 360;
          const newSat = Math.min(100, Math.max(0, hsl.s + (Math.random() * 20) - 10)); // Adjust saturation
          const newLight = Math.min(100, Math.max(0, hsl.l + (Math.random() * 20) - 10)); // Adjust lightness
          
          palette[role] = Color.hsl(newHue, newSat, newLight).hex();
        } catch {
          // Fallback to completely random color
          palette[role] = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        }
      }
    });
  } else {
    // No seed colors, generate completely random theme
    roles.forEach(role => {
      palette[role] = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    });
  }
  
  emit('theme-selected', { name: 'Inspired Custom Theme', palette });
}

const tailwindColors = (themeStore as any).tailwindColors as Record<string, Record<string, string>>;
</script>

<style scoped>
/* Add component-specific styles here if necessary */
</style>
