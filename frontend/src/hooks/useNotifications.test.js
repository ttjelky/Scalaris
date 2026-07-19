import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useNotifications from './useNotifications.js'

vi.mock('../api/axios.js', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
}))

class MockWebSocket {
  static instances = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.url = url
    this.readyState = 1
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    this.sent = []
    MockWebSocket.instances.push(this)
  }

  send(data) { this.sent.push(data) }
  close(code) {
    this.readyState = 3
    if (this.onclose) this.onclose({ code: code || 1000 })
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useNotifications hook', () => {
  it('initializes with zero notification count', () => {
    const { result } = renderHook(() => useNotifications())
    expect(result.current.notifCount).toBe(0)
  })

  it('opens a WebSocket connection with the token', () => {
    renderHook(() => useNotifications(true))
    expect(MockWebSocket.instances.length).toBe(1)
    expect(MockWebSocket.instances[0].url).toContain('mock-token')
    expect(MockWebSocket.instances[0].url).toContain('/api/ws/notifications/')
  })

  it('updates notifCount on notification_count message', () => {
    const { result } = renderHook(() => useNotifications(true))

    act(() => {
      MockWebSocket.instances[0].onmessage({ data: JSON.stringify({ type: 'notification_count', count: 5 }) })
    })

    expect(result.current.notifCount).toBe(5)
  })

  it('ignores malformed messages without crashing', () => {
    const { result } = renderHook(() => useNotifications(true))

    act(() => {
      MockWebSocket.instances[0].onmessage({ data: 'not-json' })
    })

    expect(result.current.notifCount).toBe(0)
  })

  it('ignores non-notification_count message types', () => {
    const { result } = renderHook(() => useNotifications(true))

    act(() => {
      MockWebSocket.instances[0].onmessage({ data: JSON.stringify({ type: 'other_event', count: 99 }) })
    })

    expect(result.current.notifCount).toBe(0)
  })

  it('refreshCount sends get_count message when connected', () => {
    const { result } = renderHook(() => useNotifications(true))

    act(() => {
      result.current.refreshCount()
    })

    expect(MockWebSocket.instances[0].sent).toContain(JSON.stringify({ type: 'get_count' }))
  })

  it('closes WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useNotifications(true))
    const ws = MockWebSocket.instances[0]

    unmount()

    expect(ws.readyState).toBe(3)
  })
})
