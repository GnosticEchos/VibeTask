import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { useMemberProjects } from '../useMemberProjects'

vi.mock('@/api/v1/indexApi', () => ({
  default: {
    getItems: vi.fn(),
  },
}))

vi.mock('@/composables/useProjectsQuery', () => ({
  useProjectsQuery: vi.fn(),
}))

const { useProjectsQuery } = await import('@/composables/useProjectsQuery')

describe('useMemberProjects', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  beforeEach(() => {
    setActivePinia(createPinia())
    queryClient.clear()
    vi.mocked(useProjectsQuery).mockReturnValue({
      data: { value: null },
      isLoading: { value: false },
      isError: { value: false },
      error: { value: null },
    } as any)
  })

  it('exposes projects, memberProjects, isLoading, isError, error', () => {
    const Host = defineComponent({
      setup() {
        return useMemberProjects()
      },
      template: '<div>{{ memberProjects.length }}</div>',
    })
    const wrapper = mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })
    expect(wrapper.vm.projects).toBeDefined()
    expect(wrapper.vm.memberProjects).toBeDefined()
    expect(wrapper.vm.isLoading).toBeDefined()
    expect(wrapper.vm.isError).toBeDefined()
    expect(wrapper.vm.error).toBeDefined()
  })

  it('filters memberProjects to only isMember projects', () => {
    vi.mocked(useProjectsQuery).mockReturnValue({
      data: {
        value: [
          { id: 1, name: 'A', isMember: true },
          { id: 2, name: 'B', isMember: false },
          { id: 3, name: 'C', isMember: true },
        ],
      },
      isLoading: { value: false },
      isError: { value: false },
      error: { value: null },
    } as any)

    const Host = defineComponent({
      setup() {
        const { memberProjects } = useMemberProjects()
        return { memberProjects }
      },
      template: '<div>{{ memberProjects.length }}</div>',
    })
    const wrapper = mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })
    expect(wrapper.text()).toBe('2')
  })

  it('returns empty array when data is null', () => {
    const Host = defineComponent({
      setup() {
        const { memberProjects } = useMemberProjects()
        return { memberProjects }
      },
      template: '<div>{{ memberProjects.length }}</div>',
    })
    const wrapper = mount(Host, {
      global: {
        plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      },
    })
    expect(wrapper.text()).toBe('0')
  })
})
