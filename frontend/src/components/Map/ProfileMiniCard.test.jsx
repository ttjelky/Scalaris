import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProfileMiniCard from './ProfileMiniCard'

function renderCard(overrides = {}) {
  const props = {
    person: { username: 'bob', avatar: null },
    onClose: vi.fn(),
    onViewProfile: vi.fn(),
    ...overrides,
  }
  return { ...render(<ProfileMiniCard {...props} />), props }
}

describe('ProfileMiniCard', () => {
  it('renders the username', () => {
    renderCard()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('shows the fallback initial when there is no avatar', () => {
    renderCard({ person: { username: 'carol', avatar: null } })
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('falls back to "?" when username is missing', () => {
    renderCard({ person: { username: '', avatar: null } })
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('renders the avatar image when provided', () => {
    renderCard({ person: { username: 'dave', avatar: 'http://example.com/d.jpg' } })
    expect(document.querySelector('img')).toHaveAttribute('src', 'http://example.com/d.jpg')
  })

  it('falls back to initials if the avatar image fails to load', () => {
    renderCard({ person: { username: 'dave', avatar: 'http://example.com/broken.jpg' } })
    fireEvent.error(document.querySelector('img'))
    expect(screen.getByText('D')).toBeInTheDocument()
  })

  it('calls onClose when the backdrop is clicked', () => {
    const { props, container } = renderCard()
    fireEvent.click(container.firstChild)
    expect(props.onClose).toHaveBeenCalled()
  })

  it('does not close when the card itself is clicked (stops propagation)', () => {
    const { props } = renderCard()
    fireEvent.click(screen.getByText('bob'))
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('calls onViewProfile then onClose when the button is clicked', () => {
    const { props } = renderCard()
    fireEvent.click(screen.getByText('Перейти в профіль'))
    expect(props.onViewProfile).toHaveBeenCalledWith(props.person)
    expect(props.onClose).toHaveBeenCalled()
  })
})
