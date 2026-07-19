import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useElapsedTime from './useElapsedTime'

describe('useElapsedTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when startedAt is falsy', () => {
    const { result } = renderHook(() => useElapsedTime(null))
    expect(result.current).toBe(0)
  })

  it('returns 0 immediately at the start time', () => {
    const { result } = renderHook(() => useElapsedTime('2026-07-19T12:00:00.000Z'))
    expect(result.current).toBe(0)
  })

  it('increases roughly every second', () => {
    const { result } = renderHook(() => useElapsedTime('2026-07-19T11:59:55.000Z'))
    expect(result.current).toBe(5000)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBe(8000)
  })

  it('resets to 0 when startedAt becomes falsy', () => {
    const { result, rerender } = renderHook(({ startedAt }) => useElapsedTime(startedAt), {
      initialProps: { startedAt: '2026-07-19T11:59:55.000Z' },
    })
    expect(result.current).toBe(5000)

    rerender({ startedAt: null })
    expect(result.current).toBe(0)
  })

  it('clears the interval on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval')
    const { unmount } = renderHook(() => useElapsedTime('2026-07-19T11:59:55.000Z'))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})
