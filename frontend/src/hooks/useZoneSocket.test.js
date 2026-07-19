import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useZoneSocket from './useZoneSocket'

vi.mock('../api/axios.js', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
}))

import { getAccessToken } from '../api/axios.js'

class MockWebSocket {
  static instances = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.url = url
    this.readyState = 1
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    MockWebSocket.instances.push(this)
  }

  close() {
    this.readyState = 3
    if (this.onclose) this.onclose({ code: 1000 })
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.clearAllMocks()
  getAccessToken.mockReturnValue('mock-token')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useZoneSocket', () => {
  it('starts with an empty deletedZoneIds set', () => {
    const { result } = renderHook(() => useZoneSocket())
    expect(result.current.deletedZoneIds).toEqual(new Set())
  })

  it('does not connect when there is no access token', () => {
    getAccessToken.mockReturnValue(null)
    renderHook(() => useZoneSocket())
    expect(MockWebSocket.instances.length).toBe(0)
  })

  it('opens a WebSocket connection to the zones endpoint with the token', () => {
    renderHook(() => useZoneSocket())
    expect(MockWebSocket.instances.length).toBe(1)
    expect(MockWebSocket.instances[0].url).toContain('/api/ws/zones/')
    expect(MockWebSocket.instances[0].url).toContain('mock-token')
  })

  it('adds an activity id to deletedZoneIds on a zone_deleted message', () => {
    const { result } = renderHook(() => useZoneSocket())

    act(() => {
      MockWebSocket.instances[0].onmessage({ data: JSON.stringify({ type: 'zone_deleted', activity_id: 7 }) })
    })

    expect(result.current.deletedZoneIds.has(7)).toBe(true)
  })

  it('accumulates multiple deleted zone ids', () => {
    const { result } = renderHook(() => useZoneSocket())

    act(() => {
      MockWebSocket.instances[0].onmessage({ data: JSON.stringify({ type: 'zone_deleted', activity_id: 1 }) })
    })
    act(() => {
      MockWebSocket.instances[0].onmessage({ data: JSON.stringify({ type: 'zone_deleted', activity_id: 2 }) })
    })

    expect(result.current.deletedZoneIds).toEqual(new Set([1, 2]))
  })

  it('ignores malformed messages without crashing', () => {
    const { result } = renderHook(() => useZoneSocket())

    act(() => {
      MockWebSocket.instances[0].onmessage({ data: 'not-json' })
    })

    expect(result.current.deletedZoneIds).toEqual(new Set())
  })

  it('ignores non zone_deleted message types', () => {
    const { result } = renderHook(() => useZoneSocket())

    act(() => {
      MockWebSocket.instances[0].onmessage({ data: JSON.stringify({ type: 'other', activity_id: 5 }) })
    })

    expect(result.current.deletedZoneIds).toEqual(new Set())
  })

  it('closes the WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useZoneSocket())
    const ws = MockWebSocket.instances[0]
    unmount()
    expect(ws.readyState).toBe(3)
  })
})
