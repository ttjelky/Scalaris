import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import useDocumentBackground from './useDocumentBackground'

describe('useDocumentBackground', () => {
  afterEach(() => {
    cleanup()
    document.documentElement.style.backgroundColor = ''
    document.body.style.backgroundColor = ''
  })

  it('sets html and body background color', () => {
    renderHook(() => useDocumentBackground('#0f0f0f'))
    expect(document.documentElement.style.backgroundColor).toBe('rgb(15, 15, 15)')
    expect(document.body.style.backgroundColor).toBe('rgb(15, 15, 15)')
  })

  it('updates the color when the argument changes', () => {
    const { rerender } = renderHook(({ color }) => useDocumentBackground(color), {
      initialProps: { color: '#111111' },
    })
    expect(document.body.style.backgroundColor).toBe('rgb(17, 17, 17)')

    rerender({ color: '#222222' })
    expect(document.body.style.backgroundColor).toBe('rgb(34, 34, 34)')
  })

  it('restores the previous background color on unmount', () => {
    document.body.style.backgroundColor = 'rgb(1, 2, 3)'
    const { unmount } = renderHook(() => useDocumentBackground('#0f0f0f'))
    expect(document.body.style.backgroundColor).toBe('rgb(15, 15, 15)')

    unmount()
    expect(document.body.style.backgroundColor).toBe('rgb(1, 2, 3)')
  })
})
