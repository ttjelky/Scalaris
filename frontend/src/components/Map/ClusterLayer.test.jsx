import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import ClusterLayer from './ClusterLayer'

function renderInMap(props) {
  return render(
    <MapContainer center={[50.45, 30.52]} zoom={15} style={{ height: 400, width: 400 }}>
      <ClusterLayer {...props} />
    </MapContainer>
  )
}

const solo = { id: 1, username: 'bob', latitude: 60, longitude: -60, avatar: null }
const closeA = { id: 2, username: 'carol', latitude: 50.45, longitude: 30.52, avatar: null }
const closeB = { id: 3, username: 'dave', latitude: 50.45, longitude: 30.52, avatar: null }

describe('ClusterLayer', () => {
  it('renders a single marker per person when nobody overlaps', async () => {
    const { container } = renderInMap({
      people: [solo],
      acceptedIds: [],
      showLabels: false,
      onSelectPerson: vi.fn(),
    })
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(1))
  })

  it('shows a username tooltip label when showLabels is true', async () => {
    renderInMap({
      people: [solo],
      acceptedIds: [],
      showLabels: true,
      onSelectPerson: vi.fn(),
    })
    await waitFor(() => expect(screen.getByText('bob')).toBeInTheDocument())
  })

  it('does not show a tooltip label when showLabels is false', async () => {
    const { container } = renderInMap({
      people: [solo],
      acceptedIds: [],
      showLabels: false,
      onSelectPerson: vi.fn(),
    })
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(1))
    expect(screen.queryByText('bob')).not.toBeInTheDocument()
  })

  it('calls onSelectPerson when a solo marker is clicked', async () => {
    const onSelectPerson = vi.fn()
    const { container } = renderInMap({
      people: [solo],
      acceptedIds: [],
      showLabels: false,
      onSelectPerson,
    })
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(1))
    fireEvent.click(container.querySelector('.leaflet-marker-icon'))
    expect(onSelectPerson).toHaveBeenCalledWith(solo)
  })

  it('groups two people at the exact same coordinates into one cluster marker', async () => {
    const { container } = renderInMap({
      people: [closeA, closeB],
      acceptedIds: [],
      showLabels: false,
      onSelectPerson: vi.fn(),
    })
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(1))
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('keeps far-apart people as separate markers', async () => {
    const { container } = renderInMap({
      people: [solo, closeA],
      acceptedIds: [],
      showLabels: false,
      onSelectPerson: vi.fn(),
    })
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(2))
  })

  it('opens a popup listing everyone in a cluster when clicked', async () => {
    const { container } = renderInMap({
      people: [closeA, closeB],
      acceptedIds: [],
      showLabels: false,
      onSelectPerson: vi.fn(),
    })
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(1))
    fireEvent.click(container.querySelector('.leaflet-marker-icon'))
    await waitFor(() => {
      expect(screen.getByText('carol')).toBeInTheDocument()
      expect(screen.getByText('dave')).toBeInTheDocument()
    })
  })

  it('calls onSelectPerson when a name inside the cluster popup is clicked', async () => {
    const onSelectPerson = vi.fn()
    const { container } = renderInMap({
      people: [closeA, closeB],
      acceptedIds: [],
      showLabels: false,
      onSelectPerson,
    })
    await waitFor(() => expect(container.querySelectorAll('.leaflet-marker-icon').length).toBe(1))
    fireEvent.click(container.querySelector('.leaflet-marker-icon'))
    await waitFor(() => expect(screen.getByText('carol')).toBeInTheDocument())
    fireEvent.click(screen.getByText('carol'))
    expect(onSelectPerson).toHaveBeenCalledWith(closeA)
  })
})
