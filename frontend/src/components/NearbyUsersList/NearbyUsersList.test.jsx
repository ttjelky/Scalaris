import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NearbyUsersList from './NearbyUsersList'

function renderList(props) {
  return render(
    <MemoryRouter>
      <NearbyUsersList {...props} />
    </MemoryRouter>
  )
}

describe('NearbyUsersList', () => {
  it('shows the radius hint text', () => {
    renderList({ nearbyUsersFiltered: [], friendsOnly: false, sheetState: 'collapsed' })
    expect(screen.getByText(/Радіус 5 км/)).toBeInTheDocument()
  })

  it('shows a generic empty message when not filtering by friends', () => {
    renderList({ nearbyUsersFiltered: [], friendsOnly: false, sheetState: 'collapsed' })
    expect(screen.getByText(/Поки що нікого поруч немає/)).toBeInTheDocument()
  })

  it('shows a friends-specific empty message when friendsOnly is active', () => {
    renderList({ nearbyUsersFiltered: [], friendsOnly: true, sheetState: 'collapsed' })
    expect(screen.getByText(/Немає друзів поруч/)).toBeInTheDocument()
  })

  it('renders a card per nearby user with online status', () => {
    renderList({
      nearbyUsersFiltered: [
        { id: 1, username: 'bob', avatar: null, is_online: true },
        { id: 2, username: 'carol', avatar: null, is_online: false },
      ],
      friendsOnly: false,
      sheetState: 'expanded',
    })
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('онлайн')).toBeInTheDocument()
    expect(screen.getByText('carol')).toBeInTheDocument()
    expect(screen.getByText('був(ла) нещодавно')).toBeInTheDocument()
  })

  it('links each user card to their profile', () => {
    renderList({
      nearbyUsersFiltered: [{ id: 7, username: 'dave', avatar: null, is_online: true }],
      friendsOnly: false,
      sheetState: 'expanded',
    })
    expect(screen.getByText('dave').closest('a')).toHaveAttribute('href', '/profile/7')
  })

  it('renders avatar image when provided instead of the fallback initial', () => {
    renderList({
      nearbyUsersFiltered: [{ id: 7, username: 'dave', avatar: 'http://example.com/d.jpg', is_online: true }],
      friendsOnly: false,
      sheetState: 'expanded',
    })
    const img = document.querySelector('img')
    expect(img).toHaveAttribute('src', 'http://example.com/d.jpg')
  })
})
