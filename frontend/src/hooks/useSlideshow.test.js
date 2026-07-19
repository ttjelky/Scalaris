import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useSlideshow from './useSlideshow'

describe('useSlideshow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at index 0', () => {
    const { result } = renderHook(() => useSlideshow(3))
    expect(result.current).toBe(0)
  })

  it('advances the index after the default interval', () => {
    const { result } = renderHook(() => useSlideshow(3))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(1)
  })

  it('wraps back around to 0 after the last slide', () => {
    const { result } = renderHook(() => useSlideshow(2))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(1)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(0)
  })

  it('respects a custom intervalMs', () => {
    const { result } = renderHook(() => useSlideshow(3, { intervalMs: 1000 }))
    act(() => vi.advanceTimersByTime(999))
    expect(result.current).toBe(0)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(1)
  })

  it('does not advance when disabled', () => {
    const { result } = renderHook(() => useSlideshow(3, { enabled: false }))
    act(() => vi.advanceTimersByTime(20000))
    expect(result.current).toBe(0)
  })

  it('does not advance when count is 1 or fewer', () => {
    const { result } = renderHook(() => useSlideshow(1))
    act(() => vi.advanceTimersByTime(20000))
    expect(result.current).toBe(0)
  })

  it('does not advance when count is 0', () => {
    const { result } = renderHook(() => useSlideshow(0))
    act(() => vi.advanceTimersByTime(20000))
    expect(result.current).toBe(0)
  })
})
