<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useLayoutStore } from '@/stores/layout'
import { useForm } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BasePasswordInput from '@/components/base/BasePasswordInput.vue'
import { uiLog } from '@/utils/logger'

const authStore = useAuthStore()
const layoutStore = useLayoutStore()
const { t } = useI18n()

const { errors, handleSubmit, defineField, setFieldError } = useForm({
  initialValues: {
    email: '',
    password: '',
  },
})

const [email, emailAttrs] = defineField('email')
const [password, passwordAttrs] = defineField('password')

const login = handleSubmit(async (values) => {
  const e = (values.email ?? '').trim()
  const p = values.password ?? ''
  if (!e || !p) {
    layoutStore.openToast({ message: t('login.validationMessage'), type: 'error' })
    if (!e) setFieldError('email', t('validators.isRequired', { field: t('login.email') }))
    if (!p) setFieldError('password', t('validators.isRequired', { field: t('login.password') }))
    nextTick(() => {
      if (!e) document.getElementById('email')?.focus()
      else document.getElementById('password')?.focus()
    })
    return
  }
  try {
    await authStore.loginUser({ email: e, password: p })
  } catch (error) {
    uiLog.error('Login error', { error })
  }
})
</script>

<template>
  <div class="bg-gradient-to-br from-primary to-secondary to-80% min-h-screen flex items-center justify-center">
    <div class="card bg-base-100 shadow-lg w-full max-w-md p-8 flex flex-col items-center relative">
      <div class="absolute left-4 top-4">
      <img
          src="@/assets/images/noun-robotic-7629035.svg"
          alt="Vibe Tasks Logo"
          class="w-12 h-12"
      />
    </div>
      <span class="text-2xl font-bold mt-8 mb-6">Vibe Tasks</span>
      <form @submit.prevent="login" class="flex flex-col gap-4 w-full">
          <BaseInput
            v-model="email"
            v-bind="emailAttrs"
            name="email"
            :label="$t('login.email')"
            autocomplete="username"
            rules="required|email"
          class="input input-bordered w-full text-base-content bg-base-100 border-base-300"
          />
          <BasePasswordInput
            v-model="password"
            v-bind="passwordAttrs"
            name="password"
            :label="$t('login.password')"
            label-position="bottom"
            rules="required|min:8"
          class="input input-bordered w-full text-base-content bg-base-100 border-base-300"
          show-toggle
          toggle-class="btn btn-ghost btn-xs"
          />
          <BaseButton
            type="submit"
            :label="$t('login.submit')"
            class="mt-2"
            :disabled="authStore.loading || Object.keys(errors).length > 0"
          />
        </form>
      <p class="mt-4 text-sm text-base-content/80">
        {{ $t('login.doNotHaveAccount') }}
        <RouterLink :to="{ name: 'SignUp' }" class="link link-primary font-medium">
          {{ $t('signup.linkText') }}
        </RouterLink>
      </p>
    </div>
  </div>
</template>
