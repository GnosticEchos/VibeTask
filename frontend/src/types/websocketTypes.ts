/** Must match Kanban-rewrite `CHANNELS.SETTINGS_LAYOUT` (`src/infrastructure/websocket/channels.ts`). */
export const WS_CHANNEL_SETTINGS_LAYOUT = 'SettingsLayoutChannel' as const

export interface iProjectDataWSPayload {
  name?: string
  description?: string
}

export type WebsocketActionType = 'create' | 'update' | 'delete'

export interface WebsocketIdentifier {
  channel: string
}

export interface WebsocketMessageEnvelope<T = unknown> {
  itemType?: 'task' | 'column' | 'member' | 'project'
  actionType: WebsocketActionType
  data: T
}

export interface WebsocketInboundMessage<T = unknown> {
  identifier?: WebsocketIdentifier
  message?: WebsocketMessageEnvelope<T>
}
