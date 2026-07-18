import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DiscordCallback from './DiscordCallback'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../api/axios.js', () => ({
  default: { post: vi.fn() },
}))

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../utils/apiErrors.js', () => ({
  parseApiError: vi.fn(() => ({ generalError: 'Помилка' })),
}))

vi.mock('../../utils/discordAuth.js', () => ({
  getDiscordRedirectUri: () => 'http://localhost:5174/oauth/discord/callback',
  claimDiscordCallback: vi.fn(() => true),
}))

import api from '../../api/axios.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { claimDiscordCallback } from '../../utils/discordAuth.js'

function renderCallback(search = '?code=abc123') {
  window.history.pushState({}, '', `/oauth/discord/callback${search}`)
  return render(
    <MemoryRouter>
      <DiscordCallback />
    </MemoryRouter>
  )
}

describe('DiscordCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/oauth/discord/callback')
  })

  it('shows loading state while auth is loading', () => {
    useAuth.mockReturnValue({ loading: true, isAuthenticated: false })
    renderCallback()
    expect(screen.getByText(/зʼєднуємось із discord/i)).toBeInTheDocument()
  })

  it('shows error when no code is provided', () => {
    useAuth.mockReturnValue({ loading: false, isAuthenticated: false })
    renderCallback('?')
    expect(screen.getByText(/не отримано код авторизації/i)).toBeInTheDocument()
  })

  it('shows error when OAuth error is in URL', () => {
    useAuth.mockReturnValue({ loading: false, isAuthenticated: false })
    renderCallback('?error=access_denied')
    expect(screen.getByText(/discord відхилив запит/i)).toBeInTheDocument()
  })

  it('calls loginWithDiscord for anonymous user', async () => {
    const loginWithDiscord = vi.fn().mockResolvedValue(undefined)
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: false,
      loginWithDiscord,
      updateUser: vi.fn(),
    })

    renderCallback()

    await waitFor(() => {
      expect(loginWithDiscord).toHaveBeenCalledWith('abc123')
    })
  })

  it('navigates to /home after successful anonymous login', async () => {
    const loginWithDiscord = vi.fn().mockResolvedValue(undefined)
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: false,
      loginWithDiscord,
      updateUser: vi.fn(),
    })

    renderCallback()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true })
    })
  })

  it('links Discord for already authenticated user', async () => {
    api.post.mockResolvedValueOnce({ data: { discord_id: '111' } })
    const updateUser = vi.fn()
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      loginWithDiscord: vi.fn(),
      updateUser,
    })

    renderCallback()

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/users/oauth/discord/link/', {
        code: 'abc123',
        redirect_uri: 'http://localhost:5174/oauth/discord/callback',
      })
    })
    expect(updateUser).toHaveBeenCalledWith({ discord_id: '111' })
    expect(mockNavigate).toHaveBeenCalledWith('/profile', { replace: true })
  })

  it('shows conflict error when Discord account is already linked', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 409 } })
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      loginWithDiscord: vi.fn(),
      updateUser: vi.fn(),
    })

    renderCallback()

    await waitFor(() => {
      expect(screen.getByText(/вже прив’язано до іншого користувача/)).toBeInTheDocument()
    })
  })

  it('shows generic error on link failure', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 500 } })
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      loginWithDiscord: vi.fn(),
      updateUser: vi.fn(),
    })

    renderCallback()

    await waitFor(() => {
      expect(screen.getByText(/не вдалося підключити discord/i)).toBeInTheDocument()
    })
  })

  it('deduplicates code processing via claimDiscordCallback', async () => {
    const loginWithDiscord = vi.fn().mockResolvedValue(undefined)
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: false,
      loginWithDiscord,
      updateUser: vi.fn(),
    })

    claimDiscordCallback.mockReturnValueOnce(true).mockReturnValueOnce(false)

    const { rerender } = renderCallback()
    rerender(<MemoryRouter><DiscordCallback /></MemoryRouter>)

    // Second render should not call loginWithDiscord again
    await waitFor(() => {
      expect(loginWithDiscord).toHaveBeenCalledTimes(1)
    })
  })

  it('shows back link to login for anonymous users', () => {
    useAuth.mockReturnValue({ loading: false, isAuthenticated: false })
    renderCallback('?error=denied')
    expect(screen.getByRole('button', { name: /назад до входу/i })).toBeInTheDocument()
  })

  it('shows back link to profile for authenticated users', () => {
    useAuth.mockReturnValue({ loading: false, isAuthenticated: true })
    renderCallback('?error=denied')
    expect(screen.getByRole('button', { name: /назад до профілю/i })).toBeInTheDocument()
  })
})
