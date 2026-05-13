import { describe, expect, it, vi } from 'vitest'
import { dispatchWebsocketMessage } from '@/stores/websocket'
import { createSubscribePayload, createUnsubscribePayload } from '@/composables/useWebsockets'

describe('websocket adapter contract', () => {
  it('dispatches valid channel + action payload', () => {
    const fn = vi.fn()
    const dict = {
      TasksIndexChannel: {
        create: fn,
      },
    }
    const handled = dispatchWebsocketMessage(dict as any, {
      identifier: { channel: 'TasksIndexChannel' },
      message: { actionType: 'create', data: { id: 1 } },
    })
    expect(handled).toBe(true)
    expect(fn).toHaveBeenCalledWith({ id: 1 })
  })

  it('ignores malformed payloads safely', () => {
    const fn = vi.fn()
    const dict = { TasksIndexChannel: { update: fn } }
    expect(dispatchWebsocketMessage(dict as any, {} as any)).toBe(false)
    expect(
      dispatchWebsocketMessage(dict as any, {
        identifier: { channel: 'TasksIndexChannel' },
        message: { actionType: 'create', data: {} },
      } as any),
    ).toBe(false)
    expect(fn).not.toHaveBeenCalled()
  })

  it('builds subscribe and unsubscribe payload shape for backend', () => {
    expect(createSubscribePayload('MembersIndexChannel', { projectId: 7 })).toEqual({
      channel: 'MembersIndexChannel',
      params: { projectId: 7 },
    })
    expect(createUnsubscribePayload('MembersIndexChannel')).toEqual({
      channel: 'MembersIndexChannel',
    })
  })
})
