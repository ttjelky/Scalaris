import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import useOsrmRoute from './useOsrmRoute'

describe('useOsrmRoute', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when disabled', () => {
    const { result } = renderHook(() => useOsrmRoute([1, 2], [3, 4], false))
    expect(result.current).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns null when from or to is missing', () => {
    const { result } = renderHook(() => useOsrmRoute(null, [3, 4]))
    expect(result.current).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches a route and returns [lat,lng] pairs on success', async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve({
        code: 'Ok',
        routes: [{ geometry: { coordinates: [[30.52, 50.45], [30.53, 50.46]] } }],
      }),
    })

    const { result } = renderHook(() => useOsrmRoute([50.45, 30.52], [50.46, 30.53]))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toEqual([[50.45, 30.52], [50.46, 30.53]])
  })

  it('requests the OSRM foot-profile URL with lng,lat ordering', async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ code: 'Ok', routes: [{ geometry: { coordinates: [] } }] }) })
    renderHook(() => useOsrmRoute([50.45, 30.52], [50.46, 30.53]))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('router.project-osrm.org/route/v1/foot/30.52,50.45;30.53,50.46')
  })

  it('returns null when OSRM responds without a route', async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ code: 'NoRoute' }) })
    const { result } = renderHook(() => useOsrmRoute([50.45, 30.52], [50.46, 30.53]))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('returns null when the fetch fails', async () => {
    fetch.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useOsrmRoute([50.45, 30.52], [50.46, 30.53]))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
