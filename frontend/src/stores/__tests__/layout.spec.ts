import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLayoutStore } from '../layout'

describe('LayoutStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initial state: dialog inactive, toast inactive', () => {
    const store = useLayoutStore()
    expect(store.dialog.isActive).toBe(false)
    expect(store.toast.isActive).toBe(false)
  })

  it('openDialog sets dialog active with title and component', async () => {
    const store = useLayoutStore()
    await store.openDialog({
      title: 'Test',
      component: 'TaskDialog',
      item: { id: 1 },
    })
    expect(store.dialog.isActive).toBe(true)
    expect(store.dialog.title).toBe('Test')
    expect(store.dialog.component).toBe('TaskDialog')
    expect(store.dialog.item).toEqual({ id: 1 })
  })

  it('closeDialog sets dialog inactive', async () => {
    const store = useLayoutStore()
    await store.openDialog({ title: 'X', component: 'X' })
    store.closeDialog()
    expect(store.dialog.isActive).toBe(false)
  })

  it('openToast sets toast active with message and type', () => {
    const store = useLayoutStore()
    store.openToast({ message: 'Saved!', type: 'success' })
    expect(store.toast.isActive).toBe(true)
    expect(store.toast.message).toBe('Saved!')
    expect(store.toast.type).toBe('success')
  })

  it('closeToast sets toast inactive', () => {
    const store = useLayoutStore()
    store.openToast({ message: 'Hi', type: 'info' })
    store.closeToast()
    expect(store.toast.isActive).toBe(false)
  })

  it('changeSideBarStatus cycles sidebar size', () => {
    const store = useLayoutStore()
    expect(store.sidebarSize).toBe('large')
    store.changeSideBarStatus()
    expect(store.sidebarSize).toBe('small')
    store.changeSideBarStatus()
    expect(store.sidebarSize).toBe('hidden')
    store.changeSideBarStatus()
    expect(store.sidebarSize).toBe('large')
  })
})
