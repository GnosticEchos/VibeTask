import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BaseToast from '@/components/base/BaseToast.vue'

describe('BaseToast', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('renders message and type class', () => {
    const wrapper = mount(BaseToast, {
      props: { message: 'Saved!', type: 'success' },
      global: { plugins: [createPinia()] },
    })
    expect(wrapper.text()).toContain('Saved!')
    expect(wrapper.find('.alert').classes()).toContain('alert-success')
  })

  it('shows close button', () => {
    const wrapper = mount(BaseToast, {
      props: { message: 'Info' },
      global: { plugins: [createPinia()] },
    })
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
  })

  it('hides on close click', async () => {
    const wrapper = mount(BaseToast, {
      props: { message: 'Hi', type: 'info' },
      global: { plugins: [createPinia()] },
    })
    expect(wrapper.find('.alert').exists()).toBe(true)
    await wrapper.find('button').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.alert').exists()).toBe(false)
  })

  it('applies error type class', () => {
    const wrapper = mount(BaseToast, {
      props: { message: 'Error', type: 'error' },
      global: { plugins: [createPinia()] },
    })
    expect(wrapper.find('.alert').classes()).toContain('alert-error')
  })
})
