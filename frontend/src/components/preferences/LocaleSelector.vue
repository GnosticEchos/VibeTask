<script setup lang="ts">
import { messages } from '../../locale'
import { getImageUrl } from '../../utils/functions'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps({
  flagsOnly: {
    type: Boolean,
    default: false,
  },
})

const i18n = useI18n()

const getLocaleFullname = (locale: string) => {
  return i18n.t(`locales.${locale}`)
}

const availableLocales = computed(() => {
  return Object.keys(messages)
    ?.map((locale) => ({
      label: getLocaleFullname(locale),
      id: locale,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const activeI18nLocale = computed(() => {
  return i18n.locale.value
})

const selectedLocale = ref(activeI18nLocale.value)

watch(selectedLocale, (newValue) => {
  updateLocale(newValue)
})

const updateLocale = (locale: string) => {
  setTimeout(() => {
    i18n.locale.value = locale
  }, 5)
}
</script>
<template>
  <BaseSelect
    v-model="selectedLocale"
    name="localeSelector"
    :items="availableLocales"
    :label="$t('sidebar.language')"
    :placeholder="$t('sidebar.selectLanguage')"
    optionsLabel="label"
    optionsValue="id"
    :showClear="false"
    hideDropdownIcon
    disableOutline
  >
    <template #value="{ slotProps }">
      <div
        class="w-full flex items-center"
        :class="
          flagsOnly ? 'justify-center' : 'justify-between'
        "
      >
        <span v-if="!flagsOnly">{{ getLocaleFullname(slotProps.value) }}</span>
        <img
          class="flag"
          :src="
            getImageUrl(
              `/src/assets/images/locales/${slotProps.value}-flag.jpg`,
            )
          "
        />
      </div>
    </template>
    <template #option="{ slotProps }">
      <div class="w-full flex items-center justify-between">
        <span v-if="!flagsOnly">{{
          getLocaleFullname(slotProps?.option?.id)
        }}</span>
        <img
          class="flag"
          :src="
            getImageUrl(
              `/src/assets/images/locales/${slotProps?.option?.id}-flag.jpg`,
            )
          "
        />
      </div>
    </template>
  </BaseSelect>
</template>

<style scoped lang="scss">
.flag {
  width: 30px;
  height: 20px;
  border-radius: 4px;
  object-fit: cover;
}
</style>
