import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MapContainer, useMap } from 'react-leaflet'
import { RecenterOnMove, ZoomWatcher } from './MapControls'

function MapSpy({ onMap }) {
  const map = useMap()
  onMap(map)
  return null
}

describe('RecenterOnMove', () => {
  it('centers the map on the first position it receives', async () => {
    let mapRef
    const { rerender } = render(
      <MapContainer center={[0, 0]} zoom={10} style={{ height: 200, width: 200 }}>
        <MapSpy onMap={(m) => { mapRef = m }} />
        <RecenterOnMove position={null} />
      </MapContainer>
    )

    rerender(
      <MapContainer center={[0, 0]} zoom={10} style={{ height: 200, width: 200 }}>
        <MapSpy onMap={(m) => { mapRef = m }} />
        <RecenterOnMove position={[50.45, 30.52]} />
      </MapContainer>
    )

    await waitFor(() => {
      const center = mapRef.getCenter()
      expect(center.lat).toBeCloseTo(50.45, 3)
      expect(center.lng).toBeCloseTo(30.52, 3)
    })
  })

  it('does not re-center again once a position has already centered the map', async () => {
    let mapRef
    const { rerender } = render(
      <MapContainer center={[0, 0]} zoom={10} style={{ height: 200, width: 200 }}>
        <MapSpy onMap={(m) => { mapRef = m }} />
        <RecenterOnMove position={[50.45, 30.52]} />
      </MapContainer>
    )

    await waitFor(() => expect(mapRef.getCenter().lat).toBeCloseTo(50.45, 3))

    // Manually move the map away, then feed a *new* position — the hook
    // should not touch the map again since it already centered once.
    mapRef.setView([10, 10], 10, { animate: false })

    rerender(
      <MapContainer center={[0, 0]} zoom={10} style={{ height: 200, width: 200 }}>
        <MapSpy onMap={(m) => { mapRef = m }} />
        <RecenterOnMove position={[60, 60]} />
      </MapContainer>
    )

    expect(mapRef.getCenter().lat).toBeCloseTo(10, 3)
  })
})

describe('ZoomWatcher', () => {
  it('calls onZoomChange when the map is zoomed', async () => {
    const onZoomChange = vi.fn()
    let mapRef
    render(
      <MapContainer center={[50.45, 30.52]} zoom={10} style={{ height: 200, width: 200 }}>
        <MapSpy onMap={(m) => { mapRef = m }} />
        <ZoomWatcher onZoomChange={onZoomChange} />
      </MapContainer>
    )

    mapRef.setZoom(14, { animate: false })

    await waitFor(() => expect(onZoomChange).toHaveBeenCalledWith(14))
  })
})
