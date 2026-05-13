import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { setUnauthorizedHandler } from './api/unauthorizedHandler'
import { useAuthStore } from './stores/auth'
import router from './router'
import i18n from './locale'
import axios from 'axios'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { setQueryClient } from './queryClient'
import App from './App.vue'
import { logError } from './utils/logger'

// Import base components
import BaseButton from './components/base/BaseButton.vue'
import BaseButtonTabs from './components/base/BaseButtonTabs.vue'
import BaseDialogTextarea from './components/base/BaseDialogTextarea.vue'
import BaseDoubleClickInput from './components/base/BaseDoubleClickInput.vue'
import BaseInput from './components/base/BaseInput.vue'
import BasePasswordInput from './components/base/BasePasswordInput.vue'
import BaseSearch from './components/base/BaseSearch.vue'
import BaseSelect from './components/base/BaseSelect.vue'
import { DataGridVue } from 'data-grid-vue'
import 'data-grid-vue/style'

import './styles/tailwind.css'
import './styles/main.scss'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

app.config.errorHandler = (err, instance, info) => {
  logError('[Vue Error]', { err, info, component: instance?.$options?.name })
}

setUnauthorizedHandler(() => {
  useAuthStore().logout()
})

// Set up other plugins
const queryClient = new QueryClient()
setQueryClient(queryClient)
app.use(router)
app.use(VueQueryPlugin, { queryClient })
app.use(i18n)
app.use(DataGridVue)

// Initialize auth (restores token, hydrates role/permissions via GET /session)
const authStore = useAuthStore()
void authStore.setAuth()

// Set up HTTP
app.config.globalProperties.$http = axios

// Register base components
app.component('BaseButton', BaseButton)
app.component('BaseInput', BaseInput)
app.component('BasePasswordInput', BasePasswordInput)
app.component('BaseSearch', BaseSearch)
app.component('BaseSelect', BaseSelect)
app.component('BaseDoubleClickInput', BaseDoubleClickInput)
app.component('BaseButtonTabs', BaseButtonTabs)
app.component('BaseDialogTextarea', BaseDialogTextarea)

// Mount the app
app.mount('#app')