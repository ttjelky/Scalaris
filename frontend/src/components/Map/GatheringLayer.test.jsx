import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import GatheringLayer from './GatheringLayer'

function renderInMap(props) {
  return render(
    <MapContainer center={[50.45, 30.52]} zoom={13} style={{ height: 200, width: 200 }}>
      <GatheringLayer {...props} />
    </MapContainer>
  )
}

describe('GatheringLayer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ code: 'NoRoute' }) }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when gathering is null', () => {
    const { container } = renderInMap({ gathering: null, position: null })
    expect(container.querySelectorAll('.leaflet-marker-icon, path.leaflet-interactive').length).toBe(0)
  })

  it('renders a marker with the title tooltip for a point gathering', () => {
    renderInMap({
      gathering: { point: [50.45, 30.52], title: 'Баскетбол', category: 'gathering' },
      position: null,
    })
    expect(screen.getByText('Баскетбол')).toBeInTheDocument()
  })

  it('falls back to "Збір" when the gathering has no title', () => {
    renderInMap({
      gathering: { point: [50.45, 30.52], category: 'gathering' },
      position: null,
    })
    expect(screen.getByText('Збір')).toBeInTheDocument()
  })

  it('renders a circle instead of a marker for zone gatherings', () => {
    const { container } = renderInMap({
      gathering: { point: [50.45, 30.52], category: 'zone', radius: 100 },
      position: null,
    })
    expect(container.querySelectorAll('path.leaflet-interactive').length).toBe(1)
    expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(0)
  })

  it('requests a walking route for point gatherings when a position is known', async () => {
    renderInMap({
      gathering: { point: [50.45, 30.52], category: 'gathering' },
      position: [50.44, 30.51],
    })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })

  it('does not request a route for zone gatherings', () => {
    renderInMap({
      gathering: { point: [50.45, 30.52], category: 'zone' },
      position: [50.44, 30.51],
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
