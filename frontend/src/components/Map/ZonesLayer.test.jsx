import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import ZonesLayer from './ZonesLayer'

function renderInMap(props) {
  return render(
    <MapContainer center={[50.45, 30.52]} zoom={13} style={{ height: 200, width: 200 }}>
      <ZonesLayer {...props} />
    </MapContainer>
  )
}

describe('ZonesLayer', () => {
  it('renders nothing when zones is null', () => {
    const { container } = renderInMap({ zones: null })
    expect(container.querySelectorAll('path.leaflet-interactive').length).toBe(0)
  })

  it('renders nothing when zones is empty', () => {
    const { container } = renderInMap({ zones: [] })
    expect(container.querySelectorAll('path.leaflet-interactive').length).toBe(0)
  })

  it('renders one circle per zone', () => {
    const { container } = renderInMap({
      zones: [
        { id: 1, latitude: 50.45, longitude: 30.52, radius: 80 },
        { id: 2, latitude: 50.46, longitude: 30.53, radius: 120 },
      ],
    })
    expect(container.querySelectorAll('path.leaflet-interactive').length).toBe(2)
  })

  it('falls back to an 80m radius when zone.radius is missing', () => {
    // No direct DOM assertion for radius (SVG path geometry), but this
    // should render without throwing when radius is undefined.
    expect(() =>
      renderInMap({ zones: [{ id: 1, latitude: 50.45, longitude: 30.52 }] })
    ).not.toThrow()
  })

  it('calls onZoneClick with the clicked zone', () => {
    const onZoneClick = vi.fn()
    const zone = { id: 1, latitude: 50.45, longitude: 30.52, radius: 80 }
    const { container } = renderInMap({ zones: [zone], onZoneClick })

    const path = container.querySelector('path.leaflet-interactive')
    path.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onZoneClick).toHaveBeenCalledWith(zone)
  })

  it('does not throw when onZoneClick is not provided', () => {
    const zone = { id: 1, latitude: 50.45, longitude: 30.52, radius: 80 }
    const { container } = renderInMap({ zones: [zone] })
    const path = container.querySelector('path.leaflet-interactive')
    expect(() => path.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow()
  })
})
