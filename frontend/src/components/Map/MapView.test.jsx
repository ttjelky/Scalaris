import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MapView from './MapView'

afterEach(() => {
  vi.unstubAllGlobals()
})

const nearbyUsers = [
  { id: 1, username: 'bob', latitude: 51, longitude: 31, avatar: null },
]

describe('MapView', () => {
  it('renders a leaflet map container', () => {
    const { container } = render(<MapView position={[50.45, 30.52]} nearbyUsers={[]} />)
    expect(container.querySelector('.leaflet-container')).toBeTruthy()
  })

  it('renders the own-position marker', async () => {
    const { container } = render(<MapView position={[50.45, 30.52]} nearbyUsers={[]} />)
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBeGreaterThanOrEqual(1))
  })

  it('renders a marker for each nearby user in addition to the own marker', async () => {
    const { container } = render(<MapView position={[50.45, 30.52]} nearbyUsers={nearbyUsers} />)
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(2))
  })

  it('opens a ProfileMiniCard when a nearby user marker is clicked', async () => {
    const { container } = render(<MapView position={[50.45, 30.52]} nearbyUsers={nearbyUsers} />)
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(2))

    // The own marker has no click handler; find the one that opens the card by
    // clicking each and checking for the profile card text.
    const markers = container.querySelectorAll('.leaflet-marker-icon')
    markers.forEach((m) => fireEvent.click(m))

    await waitFor(() => expect(screen.getByText('bob')).toBeInTheDocument())
    expect(screen.getByText('Перейти в профіль')).toBeInTheDocument()
  })

  it('calls onViewProfile and closes the card when "Перейти в профіль" is clicked', async () => {
    const onViewProfile = vi.fn()
    const { container } = render(
      <MapView position={[50.45, 30.52]} nearbyUsers={nearbyUsers} onViewProfile={onViewProfile} />
    )
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(2))
    container.querySelectorAll('.leaflet-marker-icon').forEach((m) => fireEvent.click(m))
    await waitFor(() => expect(screen.getByText('Перейти в профіль')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Перейти в профіль'))
    expect(onViewProfile).toHaveBeenCalledWith(expect.objectContaining({ username: 'bob' }))
    expect(screen.queryByText('Перейти в профіль')).not.toBeInTheDocument()
  })

  it('renders zone circles when zones are provided', async () => {
    const { container } = render(
      <MapView
        position={[50.45, 30.52]}
        nearbyUsers={[]}
        zones={[{ id: 9, latitude: 50.45, longitude: 30.52, radius: 80 }]}
      />
    )
    await waitFor(() => expect(container.querySelectorAll('path.leaflet-interactive').length).toBe(1))
  })

  it('renders checkpoint markers when checkpoints.items is non-empty', async () => {
    const { container } = render(
      <MapView
        position={[50.45, 30.52]}
        nearbyUsers={[]}
        checkpoints={{
          items: [{ id: 1, order: 1, latitude: 50.46, longitude: 30.53 }],
          currentId: null,
          passedIds: [],
        }}
      />
    )
    // own marker + 1 checkpoint marker
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(2))
  })

  it('does not render CheckpointLayer markers when checkpoints.items is empty', async () => {
    const { container } = render(
      <MapView position={[50.45, 30.52]} nearbyUsers={[]} checkpoints={{ items: [] }} />
    )
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(1))
  })
})
