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
    name: '',
    email: '',
    password: '',
  },
})

const [name, nameAttrs] = defineField('name')
const [email, emailAttrs] = defineField('email')
const [password, passwordAttrs] = defineField('password')

function focusFirstInvalid(nameVal: string, emailVal: string, passwordVal: string) {
  const n = (nameVal ?? '').trim()
  const e = (emailVal ?? '').trim()
  if (!n) {
    nextTick(() => document.getElementById('name')?.focus())
    return
  }
  if (!e) {
    nextTick(() => document.getElementById('email')?.focus())
    return
  }
  if (!passwordVal) {
    nextTick(() => document.getElementById('password')?.focus())
  }
}

const signUp = handleSubmit(async (values) => {
  const n = (values.name ?? '').trim()
  const e = (values.email ?? '').trim()
  const p = values.password ?? ''
  if (!n || !e || !p) {
    layoutStore.openToast({ message: t('signup.validationMessage'), type: 'error' })
    if (!n) setFieldError('name', t('validators.isRequired', { field: t('signup.name') }))
    if (!e) setFieldError('email', t('validators.isRequired', { field: t('signup.email') }))
    if (!p) setFieldError('password', t('validators.isRequired', { field: t('signup.password') }))
    focusFirstInvalid(values.name ?? '', values.email ?? '', p)
    return
  }
  try {
    await authStore.registerUser({ name: n, email: e, password: p })
  } catch (error) {
    uiLog.error('Signup error', { error })
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
      <form @submit.prevent="signUp" class="flex flex-col gap-4 w-full">
        <BaseInput
          v-model="name"
          v-bind="nameAttrs"
          name="name"
          :label="$t('signup.name')"
          autocomplete="name"
          rules="required"
          class="input input-bordered w-full text-base-content bg-base-100 border-base-300"
        />
        <BaseInput
          v-model="email"
          v-bind="emailAttrs"
          name="email"
          :label="$t('signup.email')"
          autocomplete="email"
          rules="required|email"
          class="input input-bordered w-full text-base-content bg-base-100 border-base-300"
        />
        <BasePasswordInput
          v-model="password"
          v-bind="passwordAttrs"
          name="password"
          :label="$t('signup.password')"
          label-position="bottom"
          rules="required|min:8"
          class="input input-bordered w-full text-base-content bg-base-100 border-base-300"
          show-toggle
          toggle-class="btn btn-ghost btn-xs"
        />
        <BaseButton
          type="submit"
          :label="$t('signup.submit')"
          class="mt-2"
          :disabled="authStore.loading || Object.keys(errors).length > 0"
        />
      </form>
      <p class="mt-4 text-sm text-base-content/80">
        {{ $t('signup.alreadyHaveAccount') }}
        <RouterLink :to="{ name: 'Login' }" class="link link-primary font-medium">
          {{ $t('signup.signIn') }}
        </RouterLink>
      </p>
    </div>
  </div>
</template>
