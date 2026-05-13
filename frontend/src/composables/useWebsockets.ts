import { useAuthStore } from '../stores/auth'
import { useWebsocketStore } from '../stores/websocket'
import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type { WebsocketInboundMessage } from '@/types/websocketTypes'
import { WS_CHANNEL_SETTINGS_LAYOUT } from '@/types/websocketTypes'
import { useSettingsLayoutStore } from '@/stores/settingsLayout'
import { wsLog } from '@/utils/logger'

const WS_DEBUG = import.meta.env.VITE_WS_DEBUG === 'true'
function debugLog(stage: string, details?: Record<string, unknown>) {
  if (!WS_DEBUG) return
  wsLog.debug(stage, details)
}

export function createSubscribePayload(channel: string, params: any) {
  return { channel, params }
}

export function createUnsubscribePayload(channel: string) {
  return { channel }
}

export function useWebSocket() {
  const authStore = useAuthStore()
  const websocketStore = useWebsocketStore()
  const socket = ref<Socket | null>(null)
  const isConnected = ref(false)
  const url = import.meta.env.VITE_WS_BASE_URL

  const connect = () => {
    if (socket.value?.connected) return socket.value

    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }

    debugLog('connect:init', {
      url,
      hasToken: Boolean(authStore.token),
      tokenLength: authStore.token?.length ?? 0,
    })

    socket.value = io(url, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token: authStore.token },
      query: { Authorization: authStore.token },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    })

    socket.value.on('connect', () => {
      isConnected.value = true
      debugLog('connect:success', {
        socketId: socket.value?.id,
        connected: socket.value?.connected,
        transport: socket.value?.io?.engine?.transport?.name,
      })
      const uid = Number(authStore.user?.id)
      if (Number.isFinite(uid) && uid > 0) {
        websocketStore.joinChannel(WS_CHANNEL_SETTINGS_LAYOUT, { userId: uid })
      }
    })

    socket.value.on('settings-layout:updated', (payload: { layout?: unknown | null }) => {
      debugLog('settings-layout:updated', { hasLayout: payload?.layout != null })
      const layout = payload?.layout !== undefined ? payload.layout : undefined
      if (layout === undefined) return
      useSettingsLayoutStore().applyRemoteWsLayoutPayload(layout as unknown | null)
    })

    socket.value.on('disconnect', () => {
      isConnected.value = false
      debugLog('disconnect', { connected: socket.value?.connected })
    })

    socket.value.on('message', (message: WebsocketInboundMessage) => {
      debugLog('message:inbound', {
        channel: message?.identifier?.channel,
        actionType: message?.message?.actionType,
        itemType: message?.message?.itemType,
      })
      websocketStore.handleMessage(message)
    })

    socket.value.on('welcome', (message: unknown) => {
      debugLog('welcome', { message })
    })

    socket.value.on('confirmSubscription', (payload: unknown) => {
      debugLog('subscribe:ack', { payload })
    })

    socket.value.on('confirmUnsubscription', (payload: unknown) => {
      debugLog('unsubscribe:ack', { payload })
    })

    socket.value.on('error', (err: unknown) => {
      debugLog('socket:error', { err })
    })

    socket.value.on('connect_error', (err: unknown) => {
      isConnected.value = false
      debugLog('connect:error', { err })
    })

    return socket.value
  }

  const disconnect = () => {
    if (socket.value) {
      debugLog('disconnect:requested', {
        socketId: socket.value.id,
        connected: socket.value.connected,
      })
      socket.value.removeAllListeners()
      socket.value.disconnect()
      socket.value = null
      isConnected.value = false
    }
  }

  const joinChannel = (channel: string, params: any) => {
    if (!socket.value) connect()
    debugLog('subscribe:emit', { channel, params, connected: socket.value?.connected })
    socket.value?.emit('subscribe', createSubscribePayload(channel, params))
  }

  const leaveChannel = (channel: string) => {
    debugLog('unsubscribe:emit', { channel, connected: socket.value?.connected })
    socket.value?.emit('unsubscribe', createUnsubscribePayload(channel))
  }

  return {
    connect,
    disconnect,
    socket,
    joinChannel,
    leaveChannel,
    isConnected,
  }
}
