import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useActivitySocket from './useActivitySocket.js'

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
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    MockWebSocket.instances.push(this)
  }

  send() {}
  close() {
    this.readyState = 3
    if (this.onclose) this.onclose({ code: 1000 })
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

describe('useActivitySocket hook', () => {
  it('does not connect when activityId is null', () => {
    renderHook(() => useActivitySocket(null))
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('opens WebSocket with activity-specific URL', () => {
    renderHook(() => useActivitySocket(42))
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toContain('/api/ws/activity/42/')
    expect(MockWebSocket.instances[0].url).toContain('mock-token')
  })

  it('sets participants and liveStatus from activity_state message', () => {
    const { result } = renderHook(() => useActivitySocket(42))

    act(() => {
      MockWebSocket.instances[0].onmessage({
        data: JSON.stringify({
          type: 'activity_state',
          participants: [{ id: 1, username: 'bob' }],
          live_status: 'active',
        }),
      })
    })

    expect(result.current.participants).toEqual([{ id: 1, username: 'bob' }])
    expect(result.current.liveStatus).toBe('active')
    expect(result.current.cancelled).toBe(false)
  })

  it('merges participant_update for existing participant', () => {
    const { result } = renderHook(() => useActivitySocket(42))

    act(() => {
      MockWebSocket.instances[0].onmessage({
        data: JSON.stringify({
          type: 'activity_state',
          participants: [{ id: 1, username: 'bob', status: 'pending' }],
          live_status: 'active',
        }),
      })
    })

    act(() => {
      MockWebSocket.instances[0].onmessage({
        data: JSON.stringify({
          type: 'participant_update',
          participant: { id: 1, username: 'bob', status: 'accepted' },
          activity_status: 'active',
        }),
      })
    })

    expect(result.current.participants).toHaveLength(1)
    expect(result.current.participants[0].status).toBe('accepted')
  })

  it('appends new participant via participant_update', () => {
    const { result } = renderHook(() => useActivitySocket(42))

    act(() => {
      MockWebSocket.instances[0].onmessage({
        data: JSON.stringify({
          type: 'activity_state',
          participants: [],
          live_status: 'active',
        }),
      })
    })

    act(() => {
      MockWebSocket.instances[0].onmessage({
        data: JSON.stringify({
          type: 'participant_update',
          participant: { id: 2, username: 'carol' },
          activity_status: 'active',
        }),
      })
    })

    expect(result.current.participants).toHaveLength(1)
    expect(result.current.participants[0].username).toBe('carol')
  })

  it('sets cancelled on activity_cancelled message', () => {
    const { result } = renderHook(() => useActivitySocket(42))

    act(() => {
      MockWebSocket.instances[0].onmessage({
        data: JSON.stringify({ type: 'activity_cancelled' }),
      })
    })

    expect(result.current.cancelled).toBe(true)
    expect(result.current.liveStatus).toBe('cancelled')
  })

  it('ignores malformed messages without crashing', () => {
    const { result } = renderHook(() => useActivitySocket(42))

    act(() => {
      MockWebSocket.instances[0].onmessage({ data: 'not-json' })
    })

    expect(result.current.participants).toEqual([])
    expect(result.current.cancelled).toBe(false)
  })

  it('closes WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useActivitySocket(42))
    const ws = MockWebSocket.instances[0]

    unmount()
    expect(ws.readyState).toBe(3)
  })
})
