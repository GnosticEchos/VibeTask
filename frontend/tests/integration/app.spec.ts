import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '@/App.vue'
import i18n from '@/locale'

// Avoid real API calls from TopBar/useProjectsQuery when mounting App
vi.mock('@/api/axios', () => ({
  axiosApi: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

// Minimal route components so TopBar/router don't warn about missing routes
const MockExplore = { name: 'Explore', template: '<div data-test="explore">Explore</div>' }
const MockLogin = { name: 'Login', template: '<div data-test="login">Login</div>' }
const MockSettings = { name: 'Settings', template: '<div data-test="settings">Settings</div>' }

const routes = [
  { path: '/', redirect: '/dashboard/explore' },
  { path: '/login', name: 'Login', component: MockLogin },
  { path: '/dashboard/explore', name: 'Explore', component: MockExplore },
  { path: '/dashboard/settings', name: 'Settings', component: MockSettings },
]

describe('App (smoke)', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    queryClient.clear()
  })

  it('mounts without throwing', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes,
    })

    expect(() => {
      mount(App, {
        global: {
          plugins: [createPinia(), [VueQueryPlugin, { queryClient }], router, i18n],
          components: {
            BaseButton: { template: '<button><slot />{{ label }}</button>', props: ['label'] },
          },
        },
      })
    }).not.toThrow()
  })

  it('renders app container and skip link', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes,
    })
    await router.push('/dashboard/explore')

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }], router, i18n],
        components: {
          BaseButton: { template: '<button><slot />{{ label }}</button>', props: ['label'] },
        },
      },
    })

    expect(wrapper.find('.app-container').exists()).toBe(true)
    expect(wrapper.find('.skip-link').exists()).toBe(true)
  })
})
