import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../../hooks/useNotifications', () => ({
  default: () => ({ notifCount: 0, refreshCount: vi.fn() }),
}))

function renderNavbar(path = '/home') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
    </MemoryRouter>
  )
}

describe('Navbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the burger button', () => {
    renderNavbar()
    expect(screen.getByLabelText(/відкрити меню/i)).toBeInTheDocument()
  })

  it('toggles menu open on burger click', () => {
    renderNavbar()
    const burger = screen.getByLabelText(/відкрити меню/i)
    fireEvent.click(burger)
    expect(screen.getByLabelText(/закрити меню/i)).toBeInTheDocument()
  })

  it('shows navigation items when menu is opened', () => {
    renderNavbar()
    fireEvent.click(screen.getByLabelText(/відкрити меню/i))
    expect(screen.getByText('Головна')).toBeInTheDocument()
    expect(screen.getByText('Профіль')).toBeInTheDocument()
    expect(screen.getByText('Сповіщення')).toBeInTheDocument()
    expect(screen.getByText('Заблоковані користувачі')).toBeInTheDocument()
  })

  it('shows logout button in the menu', () => {
    renderNavbar()
    fireEvent.click(screen.getByLabelText(/відкрити меню/i))
    expect(screen.getByText('Вийти')).toBeInTheDocument()
  })

  it('shows logout confirmation modal on logout click', () => {
    renderNavbar()
    fireEvent.click(screen.getByLabelText(/відкрити меню/i))
    fireEvent.click(screen.getByText('Вийти'))
    expect(screen.getByText('Вийти з акаунту?')).toBeInTheDocument()
    expect(screen.getByText(/Доведеться увійти знову/)).toBeInTheDocument()
  })

  it('closes menu on escape key', () => {
    renderNavbar()
    fireEvent.click(screen.getByLabelText(/відкрити меню/i))
    expect(screen.getByLabelText(/закрити меню/i)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByLabelText(/відкрити меню/i)).toBeInTheDocument()
  })

  it('closes menu when clicking outside', () => {
    renderNavbar()
    fireEvent.click(screen.getByLabelText(/відкрити меню/i))

    fireEvent.pointerDown(document.body)
    expect(screen.getByLabelText(/відкрити меню/i)).toBeInTheDocument()
  })
})
