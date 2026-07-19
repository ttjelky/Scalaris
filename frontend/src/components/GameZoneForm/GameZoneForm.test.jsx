import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameZoneForm from './GameZoneForm'

vi.mock('../../api/axios.js', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { id: 1, title: 'Test Zone' } }),
  },
}))

vi.mock('leaflet', () => {
  const markerInstance = {
    addTo: vi.fn(function () { return this }),
    on: vi.fn(),
    setLatLng: vi.fn(),
    getLatLng: vi.fn(() => ({ lat: 50.45, lng: 30.52 })),
  }
  const circleInstance = {
    addTo: vi.fn(function () { return this }),
    setLatLng: vi.fn(),
    setRadius: vi.fn(),
  }
  const mapInstance = {
    setView: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
    addLayer: vi.fn(),
  }
  return {
    default: {
      map: vi.fn(() => mapInstance),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      marker: vi.fn(() => markerInstance),
      circle: vi.fn(() => circleInstance),
    },
  }
})

function renderForm(overrides = {}) {
  const defaultProps = {
    initialPosition: null,
    onCancel: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  }
  return { ...render(<GameZoneForm {...defaultProps} />), props: defaultProps }
}

describe('GameZoneForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form fields', () => {
    renderForm()
    expect(screen.getByPlaceholderText(/напр\. баскетбольне поле/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/що тут відбувається/i)).toBeInTheDocument()
    expect(screen.getByText(/радіус/i)).toBeInTheDocument()
    expect(screen.getByText('Для всіх')).toBeInTheDocument()
  })

  it('shows cancel button and submit button', () => {
    renderForm()
    expect(screen.getByText('Скасувати')).toBeInTheDocument()
    expect(screen.getByText('Створити зону')).toBeInTheDocument()
  })

  it('shows client validation error when submitting without location', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByPlaceholderText(/напр\. баскетбольне поле/i), 'Test Zone')
    await user.click(screen.getByText('Створити зону'))
    expect(screen.getByText(/Постав мітку на карті/)).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', () => {
    const { props } = renderForm()
    fireEvent.click(screen.getByText('Скасувати'))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('toggles friends-only visibility', async () => {
    const user = userEvent.setup()
    renderForm()

    const toggleBtn = screen.getByText('Для всіх')
    await user.click(toggleBtn)
    expect(screen.getByText('Тільки друзі')).toBeInTheDocument()
  })
})
