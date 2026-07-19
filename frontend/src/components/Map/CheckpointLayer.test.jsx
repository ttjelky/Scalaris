import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import CheckpointLayer from './CheckpointLayer'

function renderInMap(props) {
  return render(
    <MapContainer center={[50.45, 30.52]} zoom={13} style={{ height: 200, width: 200 }}>
      <CheckpointLayer {...props} />
    </MapContainer>
  )
}

const checkpoints = [
  { id: 1, order: 1, latitude: 50.45, longitude: 30.52 },
  { id: 2, order: 2, latitude: 50.46, longitude: 30.53 },
  { id: 3, order: 3, latitude: 50.47, longitude: 30.54 },
]

describe('CheckpointLayer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ code: 'NoRoute' }),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when there are no checkpoints', () => {
    const { container } = renderInMap({
      checkpoints: [],
      currentCheckpointId: null,
      passedCheckpointIds: [],
      userPosition: null,
    })
    expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(0)
  })

  it('renders nothing when checkpoints is null', () => {
    const { container } = renderInMap({
      checkpoints: null,
      currentCheckpointId: null,
      passedCheckpointIds: [],
      userPosition: null,
    })
    expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(0)
  })

  it('renders one marker per checkpoint', () => {
    const { container } = renderInMap({
      checkpoints,
      currentCheckpointId: null,
      passedCheckpointIds: [],
      userPosition: null,
    })
    expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(3)
  })

  it('shows a permanent tooltip label for non-current checkpoints', () => {
    const { container } = renderInMap({
      checkpoints,
      currentCheckpointId: 1,
      passedCheckpointIds: [],
      userPosition: null,
    })
    // The current checkpoint (#1) has no tooltip; the other two do.
    expect(container.querySelectorAll('.map-checkpoint-label').length).toBe(2)
  })

  it('requests a route when there is a current checkpoint and a user position', async () => {
    renderInMap({
      checkpoints,
      currentCheckpointId: 1,
      passedCheckpointIds: [],
      userPosition: [50.44, 30.51],
    })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })

  it('does not request a route when there is no current checkpoint', () => {
    renderInMap({
      checkpoints,
      currentCheckpointId: null,
      passedCheckpointIds: [],
      userPosition: [50.44, 30.51],
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
