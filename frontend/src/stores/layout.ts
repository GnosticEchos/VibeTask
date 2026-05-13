import { defineStore } from 'pinia'
import { ref, Ref } from 'vue'

interface Dialog {
  title?: string
  isActive: boolean
  item?: any
  component?: string
  hideHeader?: boolean
  size?: string
  backdropOpacity?: number
}

interface Toast {
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
  isActive: boolean
}

type SidebarSizeType = 'large' | 'small' | 'hidden'

const sideBarSizeChange: Record<SidebarSizeType, SidebarSizeType> = {
  large: 'small',
  small: 'hidden',
  hidden: 'large',
}

export const useLayoutStore = defineStore('layout', () => {
  const sidebarSize: Ref<SidebarSizeType> = ref("large")
  const isDrawerOpen: Ref<boolean> = ref(true)
  const dialog: Ref<Dialog> = ref({ isActive: false } as Dialog)
  const toast: Ref<Toast> = ref({ message: '', type: 'info', isActive: false })

  // Board scaling: 0.5 (dense) to 2.0 (massive)
  const boardScale: Ref<number> = ref(1.0)

  const openDialog = async ({
    title,
    item,
    component,
    hideHeader,
    size,
  }: Omit<Dialog, 'isActive'>) => {
    dialog.value = {
      title,
      item,
      component,
      isActive: true,
      hideHeader: hideHeader || false,
      size: size || '',
    }
  }

  const closeDialog = () => {
    dialog.value = {
      isActive: false,
    }
  }

  const openToast = ({
    message,
    type,
    duration = 3000,
  }: Omit<Toast, 'isActive'>) => {
    toast.value = {
      message,
      type,
      duration,
      isActive: true,
    }

    // Auto-close toast after duration
    setTimeout(() => {
      toast.value = { message: '', type: 'info', isActive: false }
    }, duration)
  }

  const closeToast = () => {
    toast.value = { message: '', type: 'info', isActive: false }
  }

  const changeSideBarStatus = () => {
    sidebarSize.value = sideBarSizeChange[sidebarSize.value]
  }

  const toggleDrawer = () => {
    isDrawerOpen.value = !isDrawerOpen.value
  }

  const setLayoutDefaultState = () => {
    sidebarSize.value = 'large'
    boardScale.value = 1.0
    dialog.value = {
      isActive: false,
    }
    toast.value = { message: '', type: 'info', isActive: false }
  }

  const setBoardScale = (scale: number) => {
    boardScale.value = Math.max(0.5, Math.min(2.0, scale))
  }

  return {
    sidebarSize,
    isDrawerOpen,
    changeSideBarStatus,
    toggleDrawer,
    openDialog,
    closeDialog,
    dialog,
    openToast,
    closeToast,
    toast,
    setLayoutDefaultState,
    boardScale,
    setBoardScale,
  }
})
