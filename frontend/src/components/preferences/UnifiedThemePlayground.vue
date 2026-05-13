<template>
  <div class="theme-playground-container p-4 min-w-0">
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] gap-6 mb-6 items-start">
      <div class="theme-selector-section min-w-0">
        <h2 class="text-xl font-bold mb-4">{{ t('settingsHub.themePlayground.selectionTitle') }}</h2>
        <div class="flex gap-2 mb-4 items-end">
          <button class="btn" :class="{ 'btn-primary': showSection === 'daisy' }" @click="showSection = 'daisy'">
            {{ t('settingsHub.themePlayground.daisyTab') }}
          </button>
          <button class="btn" :class="{ 'btn-primary': showSection === 'tailwind' }" @click="showSection = 'tailwind'">
            {{ t('settingsHub.themePlayground.tailwindTab') }}
          </button>
        </div>
        <div class="h-[400px] overflow-y-auto border rounded-lg bg-base-200 p-2">
          <div v-if="showSection === 'daisy'">
            <ul class="grid grid-cols-2 md:grid-cols-3 gap-2">
              <li v-for="(theme, idx) in allDaisyThemes" :key="theme.name">
                <span
                  :class="[
                    'tooltip',
                    idx % 4 === 0 ? 'tooltip-right' : idx < 4 ? 'tooltip-bottom' : '',
                  ]"
                  :data-tip="t('settingsHub.themePlayground.daisyTooltip', { scheme: theme.colorScheme })"
                >
                  <button
                    class="w-full text-left px-3 py-2 rounded hover:bg-base-200 focus:bg-base-300 transition"
                    @click="selectDaisyTheme(theme.name)"
                  >
                    {{ theme.name }}
                  </button>
                </span>
              </li>
            </ul>
          </div>
          <div v-if="showSection === 'tailwind'">
            <div class="flex flex-col gap-0 p-0 m-0">
              <div v-for="(shades, colorName) in tailwindColors" :key="colorName" class="p-0 m-0">
                <h4 class="capitalize font-semibold p-0 m-0 leading-none" style="margin: 0; padding: 1px 0 0; line-height: 1; font-size: 1rem">
                  {{ colorName }}
                </h4>
                <div class="flex flex-nowrap gap-0 p-0 m-0 justify-start w-full min-w-0 flex-grow" style="min-height: 30px">
                  <div
                    v-for="(hex, shade) in shades"
                    :key="shade"
                    :style="{
                      backgroundColor: hex,
                      width: '44px',
                      height: '30px',
                      borderLeft: '2px solid #d1d5db',
                      borderRight: '2px solid #d1d5db',
                      borderTop: 'none',
                      borderBottom: 'none',
                    }"
                    class="rounded-md cursor-pointer inline-block"
                    :title="t('settingsHub.themePlayground.swatchTitle', { name: colorName, shade: String(shade), hex })"
                    @click="selectPalette(colorName, hex)"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="theme-editor-section min-w-0 w-full">
        <h2 class="text-xl font-bold mb-4">{{ t('settingsHub.themePlayground.editorTitle') }}</h2>
        <ThreeColumnThemeEditor />
      </div>
    </div>

    <div class="theme-preview-section mt-6 min-w-0">
      <h2 class="text-xl font-bold mb-1">{{ t('settingsHub.themePlayground.previewTitle') }}</h2>
      <p class="text-sm text-base-content/70 mb-4">{{ t('settingsHub.themePlayground.previewChromeHint') }}</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          class="theme-preview-card rounded-2xl border p-4 shadow-sm"
          :style="previewGlassSurface(mappedLight)"
        >
          <h3 class="font-bold mb-2" :style="{ color: mappedLight['primary'] }">{{ t('settingsHub.themePlayground.previewLight') }}</h3>
          <div class="mb-2 flex flex-wrap gap-2">
            <button class="btn btn-sm" :style="{ backgroundColor: mappedLight['primary'], color: mappedLight['primary-content'] }">
              {{ t('settingsHub.themePlayground.btnPrimary') }}
            </button>
            <button class="btn btn-sm" :style="{ backgroundColor: mappedLight['secondary'], color: mappedLight['secondary-content'] }">
              {{ t('settingsHub.themePlayground.btnSecondary') }}
            </button>
          </div>
          <div class="mb-2 flex flex-wrap gap-2">
            <span class="badge" :style="{ backgroundColor: mappedLight['accent'], color: mappedLight['accent-content'] }">{{
              t('settingsHub.themePlayground.badgeAccent')
            }}</span>
            <span class="badge" :style="{ backgroundColor: mappedLight['info'], color: mappedLight['info-content'] }">{{
              t('settingsHub.themePlayground.badgeInfo')
            }}</span>
          </div>
          <div class="text-sm opacity-95">
            <p>{{ t('settingsHub.themePlayground.previewLightBody') }}</p>
          </div>
          <div class="mt-3 rounded-xl border p-3" :style="previewNestedSurface(mappedLight)">
            <h4 class="font-semibold" :style="{ color: mappedLight['base-content'] }">{{ t('settingsHub.themePlayground.cardExampleTitle') }}</h4>
            <p class="text-sm opacity-90" :style="{ color: mappedLight['base-content'] }">{{ t('settingsHub.themePlayground.cardExampleBody') }}</p>
          </div>
        </div>

        <div
          class="theme-preview-card rounded-2xl border p-4 shadow-sm"
          :style="previewGlassSurface(mappedDark)"
        >
          <h3 class="font-bold mb-2" :style="{ color: mappedDark['primary'] }">{{ t('settingsHub.themePlayground.previewDark') }}</h3>
          <div class="mb-2 flex flex-wrap gap-2">
            <button class="btn btn-sm" :style="{ backgroundColor: mappedDark['primary'], color: mappedDark['primary-content'] }">
              {{ t('settingsHub.themePlayground.btnPrimary') }}
            </button>
            <button class="btn btn-sm" :style="{ backgroundColor: mappedDark['secondary'], color: mappedDark['secondary-content'] }">
              {{ t('settingsHub.themePlayground.btnSecondary') }}
            </button>
          </div>
          <div class="mb-2 flex flex-wrap gap-2">
            <span class="badge" :style="{ backgroundColor: mappedDark['accent'], color: mappedDark['accent-content'] }">{{
              t('settingsHub.themePlayground.badgeAccent')
            }}</span>
            <span class="badge" :style="{ backgroundColor: mappedDark['info'], color: mappedDark['info-content'] }">{{
              t('settingsHub.themePlayground.badgeInfo')
            }}</span>
          </div>
          <div class="text-sm opacity-95">
            <p>{{ t('settingsHub.themePlayground.previewDarkBody') }}</p>
          </div>
          <div class="mt-3 rounded-xl border p-3" :style="previewNestedSurface(mappedDark)">
            <h4 class="font-semibold" :style="{ color: mappedDark['base-content'] }">{{ t('settingsHub.themePlayground.cardExampleTitle') }}</h4>
            <p class="text-sm opacity-90" :style="{ color: mappedDark['base-content'] }">{{ t('settingsHub.themePlayground.cardExampleBody') }}</p>
          </div>
        </div>

        <div
          class="theme-preview-card rounded-2xl border p-4 shadow-sm"
          :style="previewGlassSurface(mappedRandom)"
        >
          <h3 class="font-bold mb-2" :style="{ color: mappedRandom['primary'] }">{{ t('settingsHub.themePlayground.previewRandom') }}</h3>
          <div class="mb-2 flex flex-wrap gap-2">
            <button class="btn btn-sm" :style="{ backgroundColor: mappedRandom['primary'], color: mappedRandom['primary-content'] }">
              {{ t('settingsHub.themePlayground.btnPrimary') }}
            </button>
            <button class="btn btn-sm" :style="{ backgroundColor: mappedRandom['secondary'], color: mappedRandom['secondary-content'] }">
              {{ t('settingsHub.themePlayground.btnSecondary') }}
            </button>
          </div>
          <div class="mb-2 flex flex-wrap gap-2">
            <span class="badge" :style="{ backgroundColor: mappedRandom['accent'], color: mappedRandom['accent-content'] }">{{
              t('settingsHub.themePlayground.badgeAccent')
            }}</span>
            <span class="badge" :style="{ backgroundColor: mappedRandom['info'], color: mappedRandom['info-content'] }">{{
              t('settingsHub.themePlayground.badgeInfo')
            }}</span>
          </div>
          <div class="text-sm opacity-95">
            <p>{{ t('settingsHub.themePlayground.previewRandomBody') }}</p>
          </div>
          <div class="mt-3 rounded-xl border p-3" :style="previewNestedSurface(mappedRandom)">
            <h4 class="font-semibold" :style="{ color: mappedRandom['base-content'] }">{{ t('settingsHub.themePlayground.cardExampleTitle') }}</h4>
            <p class="text-sm opacity-90" :style="{ color: mappedRandom['base-content'] }">{{ t('settingsHub.themePlayground.cardExampleBody') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { usePlaygroundStore } from '@/stores/playgroundStore'
import {
  getAllDaisyThemes,
  daisyThemeToRoleMap,
  generateM3Theme,
  semanticPairFromDark,
  semanticPairFromLight,
  generateSemanticRandomPalette,
} from '@/components/preferences/PaletteMapper.js'
import { tailwindColors } from '@/components/preferences/tailwindPalettes'
import { daisyPalettes } from '@/components/preferences/daisyPalettes'
import ThreeColumnThemeEditor from '@/components/preferences/ThreeColumnThemeEditor.vue'

const { t } = useI18n()

const playgroundStore = usePlaygroundStore()
const { lightPalette, darkPalette, randomPalette } = storeToRefs(playgroundStore)

const showSection = ref('daisy')
const selectedBaseColor = ref('#4f46e5')

const mappedLight = computed(() => lightPalette.value)
const mappedDark = computed(() => darkPalette.value)
const mappedRandom = computed(() => randomPalette.value)

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim()
  if (!raw) return null
  const expanded = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const m = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(expanded)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
}

/** Settings-hub style: frosted surface using palette base-100 so previews sit on the page gradient like admin cards. */
function previewGlassSurface(p: Record<string, string>) {
  const bg = p['base-100'] || '#ffffff'
  const content = p['base-content'] || '#000000'
  return {
    color: content,
    backgroundColor: rgbaFromHex(bg, 0.72),
    borderColor: rgbaFromHex(content, 0.14),
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
  } as Record<string, string>
}

function previewNestedSurface(p: Record<string, string>) {
  const layer = p['base-200'] || p['base-100'] || '#e5e5e5'
  const edge = p['base-300'] || layer
  return {
    backgroundColor: rgbaFromHex(layer, 0.58),
    borderColor: rgbaFromHex(edge, 0.3),
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  } as Record<string, string>
}

const emptyPalette: Record<string, string> = {
  primary: '',
  'primary-content': '',
  secondary: '',
  'secondary-content': '',
  accent: '',
  'accent-content': '',
  neutral: '',
  'neutral-content': '',
  'base-100': '',
  'base-200': '',
  'base-300': '',
  'base-content': '',
  info: '',
  'info-content': '',
  success: '',
  'success-content': '',
  warning: '',
  'warning-content': '',
  error: '',
  'error-content': '',
}

const allDaisyThemes = ref([
  { name: 'CustomLight', colorScheme: 'light', theme: daisyPalettes.light },
  { name: 'CustomDark', colorScheme: 'dark', theme: daisyPalettes.dark },
  {
    name: 'Random',
    colorScheme: 'custom',
    theme:
      playgroundStore.randomPalette && Object.keys(playgroundStore.randomPalette).length > 0
        ? playgroundStore.randomPalette
        : { ...emptyPalette },
  },
  ...getAllDaisyThemes().map((entry) => ({
    ...entry,
    theme: entry.theme && Object.keys(entry.theme).length > 0 ? entry.theme : { ...emptyPalette },
  })),
])

function selectDaisyTheme(themeName: string) {
  const themeObj = allDaisyThemes.value.find((row) => row.name === themeName)
  if (!themeObj) return

  let mapped: Record<string, string>
  if (themeName === 'Random') {
    mapped = { ...emptyPalette, ...playgroundStore.randomPalette }
  } else {
    const safeTheme = themeObj.theme && Object.keys(themeObj.theme).length > 0 ? themeObj.theme : {}
    mapped = { ...emptyPalette, ...daisyThemeToRoleMap(safeTheme) }
  }

  if (themeObj.colorScheme === 'light') {
    playgroundStore.setLightPalette(mapped, true)
    playgroundStore.setDarkPalette({ ...emptyPalette, ...semanticPairFromLight(mapped) }, true)
  } else {
    playgroundStore.setDarkPalette(mapped, true)
    playgroundStore.setLightPalette({ ...emptyPalette, ...semanticPairFromDark(mapped) }, true)
  }

  const seedHex = mapped.primary
  if (typeof seedHex === 'string' && seedHex.startsWith('#') && seedHex.length >= 4) {
    selectedBaseColor.value = seedHex
  }
}

function selectPalette(_colorName: string, baseHex: string) {
  selectedBaseColor.value = baseHex
  const lightTheme = generateM3Theme(baseHex, 'light')
  const darkTheme = generateM3Theme(baseHex, 'dark')
  playgroundStore.setLightPalette(lightTheme, true)
  playgroundStore.setDarkPalette(darkTheme, true)
}

function collectRandomSeeds(): Record<string, string> {
  const L = playgroundStore.lightPalette
  const D = playgroundStore.darkPalette
  return {
    primary: L.primary || D.primary,
    secondary: L.secondary || D.secondary,
    accent: L.accent || D.accent,
    'base-100': D['base-100'] || L['base-100'],
    base100: D['base-100'] || L['base-100'],
  }
}

function generateRandomThemeWithBase() {
  try {
    const seeds = collectRandomSeeds()
    return { ...emptyPalette, ...generateSemanticRandomPalette(seeds, selectedBaseColor.value) }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error generating semantic random theme:', error)
    }
    return { ...emptyPalette, ...generateSemanticRandomPalette({}, selectedBaseColor.value) }
  }
}

function generateRandomTheme() {
  const randomTheme = generateRandomThemeWithBase()
  playgroundStore.setRandomPalette(randomTheme)
  const p = randomTheme.primary
  if (typeof p === 'string' && p.startsWith('#') && p.length >= 4) {
    selectedBaseColor.value = p
  }
}

defineExpose({ generateRandomTheme })
</script>

<style scoped>
.theme-playground-container {
  max-width: 100%;
  overflow-x: hidden;
}

.theme-selector-section,
.theme-editor-section {
  height: fit-content;
}

.theme-preview-section {
  width: 100%;
}
</style>
