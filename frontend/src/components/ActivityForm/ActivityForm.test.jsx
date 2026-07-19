import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActivityForm from './ActivityForm'

vi.mock('../../api/axios.js', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { id: 1, title: 'Збір' } }),
  },
}))

vi.mock('../../api/friends.js', () => ({
  getFriends: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('leaflet', () => {
  const markerInstance = {
    addTo: vi.fn(function () { return this }),
    on: vi.fn(),
    setLatLng: vi.fn(),
    getLatLng: vi.fn(() => ({ lat: 50.45, lng: 30.52 })),
  }
  const mapInstance = {
    setView: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
  }
  return {
    default: {
      map: vi.fn(() => mapInstance),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      marker: vi.fn(() => markerInstance),
    },
  }
})

import api from '../../api/axios.js'
import { getFriends } from '../../api/friends.js'

function renderForm(overrides = {}) {
  const defaultProps = {
    initialPosition: [50.45, 30.52],
    nearbyUsers: [],
    onCancel: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  }
  return { ...render(<ActivityForm {...defaultProps} />), props: defaultProps }
}

describe('ActivityForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.post.mockResolvedValue({ data: { id: 1, title: 'Збір' } })
    getFriends.mockResolvedValue({ data: [] })
  })

  it('renders the location and participants fields', () => {
    renderForm()
    expect(screen.getByText('Місце збору *')).toBeInTheDocument()
    expect(screen.getByText('Учасники (1–8)')).toBeInTheDocument()
  })

  it('shows cancel and submit buttons', () => {
    renderForm()
    expect(screen.getByText('Скасувати')).toBeInTheDocument()
    expect(screen.getByText('Зібратися')).toBeInTheDocument()
  })

  it('calls onCancel when cancel is clicked', () => {
    const { props } = renderForm()
    fireEvent.click(screen.getByText('Скасувати'))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows an empty-participants message when there are no nearby users', () => {
    renderForm({ nearbyUsers: [] })
    expect(screen.getByText('Немає доступних користувачів поруч')).toBeInTheDocument()
  })

  it('lists nearby users as selectable participants', () => {
    renderForm({ nearbyUsers: [{ id: 1, username: 'bob', avatar: null }] })
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('toggles participant selection on click', async () => {
    const user = userEvent.setup()
    renderForm({ nearbyUsers: [{ id: 1, username: 'bob', avatar: null }] })

    const btn = screen.getByText('bob').closest('button')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await user.click(btn)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    await user.click(btn)
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('filters participants to friends only', async () => {
    getFriends.mockResolvedValue({ data: [{ id: 1, username: 'bob' }] })
    const user = userEvent.setup()
    renderForm({
      nearbyUsers: [
        { id: 1, username: 'bob', avatar: null },
        { id: 2, username: 'carol', avatar: null },
      ],
    })

    await waitFor(() => expect(getFriends).toHaveBeenCalled())
    await user.click(screen.getByText('Друзі'))

    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.queryByText('carol')).not.toBeInTheDocument()
  })

  it('shows a friends-specific empty message when filtered and no friends are nearby', async () => {
    const user = userEvent.setup()
    renderForm({ nearbyUsers: [{ id: 2, username: 'carol', avatar: null }] })
    await user.click(screen.getByText('Друзі'))
    expect(screen.getByText('Немає друзів поруч')).toBeInTheDocument()
  })

  it('shows a validation error when submitting without any participants', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByText('Зібратися'))
    expect(screen.getByText('Обери хоча б одного учасника.')).toBeInTheDocument()
  })

  it('shows a validation error when submitting without a location', async () => {
    const user = userEvent.setup()
    renderForm({ initialPosition: null, nearbyUsers: [{ id: 1, username: 'bob', avatar: null }] })
    await user.click(screen.getByText('bob'))
    await user.click(screen.getByText('Зібратися'))
    expect(screen.getByText('Постав мітку на карті.')).toBeInTheDocument()
  })

  it('submits successfully with a location and a participant', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ nearbyUsers: [{ id: 1, username: 'bob', avatar: null }] })

    await user.click(screen.getByText('bob'))
    await user.click(screen.getByText('Зібратися'))

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith({ id: 1, title: 'Збір' }))
    expect(api.post).toHaveBeenCalledWith('/activities/', expect.objectContaining({
      title: 'Збір',
      category: 'hangout',
      participant_ids: [1],
    }))
  })

  it('shows server-side errors when submission fails', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { non_field_errors: ['Забагато активних зборів.'] } } })
    const user = userEvent.setup()
    renderForm({ nearbyUsers: [{ id: 1, username: 'bob', avatar: null }] })

    await user.click(screen.getByText('bob'))
    await user.click(screen.getByText('Зібратися'))

    await waitFor(() => expect(screen.getByText(/Забагато активних зборів/)).toBeInTheDocument())
  })
})
