import { useAuthStore } from '../stores/auth'
import { setDocumentTitle } from './documentTitle'
import { validateProjectId } from '../utils/validation'
import { createRouter, createWebHistory, type RouteLocationGeneric } from 'vue-router'
import { useLayoutStore } from '../stores/layout'
import { uiLog } from '@/utils/logger'
import i18n from '../locale'

import DashboardWrapperView from '../views/DashboardWrapperView.vue'
import HomeView from '../views/HomeView.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView,
    redirect: '/projects',
    meta: { public: true, title: 'Welcome' },
    children: [],
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true, title: 'Auth' },
    children: [],
  },
  {
    path: '/signup',
    name: 'SignUp',
    component: () => import('../views/SignUpView.vue'),
    meta: { public: true, title: 'Sign up' },
    children: [],
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardWrapperView,
    redirect: '/dashboard/explore',
        children: [
      {
        path: 'explore',
        name: 'Explore',
        component: () => import('../views/ExploreProjectsView.vue'),
        meta: { title: 'Explore' },
      },
      {
        path: 'project/:id',
        component: () => import('../views/ProjectView.vue'),
        children: [
          {
            path: '',
            name: 'Board',
            component: () => import('../components/dashboard/board/Board.vue'),
            meta: { title: 'Board' },
          },
          {
            path: 'members',
            redirect: (to: RouteLocationGeneric) => ({
              name: 'Board',
              params: { id: String(to.params.id) },
            }),
          },
          {
            path: 'grid',
            name: 'ProjectGrid',
            component: () => import('../components/dashboard/project/ProjectGrid.vue'),
            meta: { title: 'Project grid' },
          },
          {
            path: 'docs',
            name: 'ProjectDocs',
            component: () => import('../views/DocsView.vue'),
            meta: { title: 'Project docs' },
          },
          {
            path: 'subboard/:parentId',
            name: 'SubBoard',
            component: () => import('../views/SubBoardView.vue'),
            meta: { title: 'Sub-board' },
          },
        ],
      },
      {
        path: 'account',
        name: 'Account',
        component: () => import('../views/AccountView.vue'),
        meta: { title: 'Account' },
      },
      {
        path: 'preferences',
        name: 'Preferences',
        redirect: { name: 'SettingsThemeBuilder' },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('../views/SettingsView.vue'),
        meta: { title: 'Settings' },
        children: [
          {
            path: 'account',
            name: 'SettingsAccount',
            component: () => import('../views/settings/SettingsAccountView.vue'),
            meta: { title: 'Account' },
          },
          {
            path: 'agents',
            name: 'SettingsAgents',
            component: () => import('../views/settings/SettingsAgentsView.vue'),
            meta: { title: 'Agents' },
          },
          {
            path: 'project',
            name: 'SettingsProject',
            component: () => import('../views/settings/SettingsProjectView.vue'),
            meta: { title: 'Project settings' },
          },
          {
            path: 'admin',
            name: 'SettingsAdmin',
            component: () => import('../views/settings/SettingsAdminView.vue'),
            meta: { title: 'Administration' },
          },
          {
            path: 'theme-builder',
            name: 'SettingsThemeBuilder',
            component: () => import('../views/settings/SettingsThemeBuilderView.vue'),
            meta: { title: 'Theme Builder' },
          },
        ],
      },
    ],
  },
  {
    path: '/:notFound(.*)',
    redirect: '/dashboard',
    children: [],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

function isNetworkLikeError(error: unknown): boolean {
  const e = error as { response?: { status?: number }; code?: string; message?: string }
  if (!e?.response) return true
  const status = e.response.status
  return typeof status !== 'number' || status >= 500
}

router.beforeEach(async (to, from) => {
  uiLog.debug('Entering beforeEach', { to: to.fullPath, from: from.fullPath })

  if (to.meta.public) {
    setDocumentTitle(to.meta.title as string)
    uiLog.debug('Route is public. Access granted.')
    return true
  }

  uiLog.debug('Route is protected. Checking authentication...')
  const authStore = useAuthStore()
  const isAuthorized = authStore.isAuthorized()
  uiLog.debug('Authorization status', { isAuthorized })

  if (to.params.id) {
    try {
      validateProjectId(to.params.id)
    } catch {
      setDocumentTitle('Explore')
      const layoutStore = useLayoutStore()
      layoutStore.openToast({ message: 'Invalid project ID.', type: 'error' })
      return {
        path: '/dashboard/explore',
        query: { error: 'invalid-id' },
      }
    }
  }

  if (!isAuthorized) {
    setDocumentTitle('Auth')
    uiLog.debug('User is not authorized. Redirecting to Login.')
    return { name: 'Login' }
  }

  uiLog.debug('User is authorized.')
  try {
    await authStore.refreshSession()
  } catch (error) {
    if (!authStore.isAuthorized()) {
      setDocumentTitle('Auth')
      return { name: 'Login' }
    }
    if (isNetworkLikeError(error)) {
      uiLog.warn('Session refresh failed during navigation; blocking route change', {
        to: to.fullPath,
        from: from.fullPath,
        error,
      })
      const layoutStore = useLayoutStore()
      layoutStore.openToast({
        message: i18n.global.t('login.sessionVerifyFailed'),
        type: 'warning',
      })
      return false
    }
  }

  if (to.name === 'Login' || to.name === 'SignUp') {
    setDocumentTitle('Explore')
    uiLog.debug('User is on Login/SignUp page, redirecting to Dashboard.')
    return { name: 'Dashboard' }
  }

  if (to.name === 'SettingsAdmin') {
    const canUseAdmin =
      authStore.user?.permissions?.canManageRateLimits === true ||
      authStore.user?.permissions?.isAdmin === true
    if (!canUseAdmin) {
      const layoutStore = useLayoutStore()
      layoutStore.openToast({ message: 'Admin access required.', type: 'warning' })
      return { name: 'SettingsAccount' }
    }
  }

  setDocumentTitle(to.meta.title as string)
  uiLog.debug('Granting access to protected route.')
  return true
})

export default router
