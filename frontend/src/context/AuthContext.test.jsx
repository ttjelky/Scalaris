import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../api/axios.js', () => {
  const mod = {
    default: {
      get: vi.fn(),
      post: vi.fn(),
    },
    setAccessToken: vi.fn(),
    clearAccessToken: vi.fn(),
    onAuthFailure: vi.fn(),
    tryRestoreSession: vi.fn().mockResolvedValue(false),
  }
  return mod
})

vi.mock('../utils/discordAuth.js', () => ({
  getDiscordRedirectUri: () => 'http://localhost:5174/oauth/discord/callback',
}))

import api, { setAccessToken, clearAccessToken, onAuthFailure, tryRestoreSession } from '../api/axios.js'

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockRejectedValue(new Error('no session'))
    tryRestoreSession.mockResolvedValue(false)
  })

  it('starts in loading state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBeNull()
  })

  it('sets authFailed when loadMe fails', async () => {
    tryRestoreSession.mockResolvedValue(true)
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(result.current.authFailed).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('sets user when loadMe succeeds', async () => {
    tryRestoreSession.mockResolvedValue(true)
    api.get.mockResolvedValueOnce({ data: { username: 'alice', id: 1 } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(result.current.user).toEqual({ username: 'alice', id: 1 })
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('login calls api.post and loadMe', async () => {
    tryRestoreSession.mockResolvedValue(true)
    api.get.mockResolvedValue({ data: { username: 'alice' } })
    api.post.mockResolvedValueOnce({ data: { access: 'token-123' } })

    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    await act(async () => {
      await result.current.login('alice', 'TestPass123!')
    })

    expect(api.post).toHaveBeenCalledWith('/users/login/', {
      username: 'alice',
      password: 'TestPass123!',
    })
    expect(setAccessToken).toHaveBeenCalledWith('token-123')
  })

  it('register calls api.post then login', async () => {
    tryRestoreSession.mockResolvedValue(true)
    api.get.mockResolvedValue({ data: { username: 'alice' } })
    api.post
      .mockResolvedValueOnce({ data: {} }) // register
      .mockResolvedValueOnce({ data: { access: 'token-123' } }) // login

    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    await act(async () => {
      await result.current.register({
        username: 'alice',
        email: 'alice@example.com',
        password: 'TestPass123!',
        passwordConfirm: 'TestPass123!',
      })
    })

    expect(api.post).toHaveBeenCalledWith('/users/register/', {
      username: 'alice',
      email: 'alice@example.com',
      password: 'TestPass123!',
      password_confirm: 'TestPass123!',
    })
  })

  it('logout clears user and token', async () => {
    tryRestoreSession.mockResolvedValue(true)
    api.get.mockResolvedValue({ data: { username: 'alice' } })
    api.post.mockResolvedValueOnce({}) // logout

    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    await act(async () => {
      await result.current.logout()
    })

    expect(clearAccessToken).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('logout handles API error gracefully', async () => {
    tryRestoreSession.mockResolvedValue(true)
    api.get.mockResolvedValue({ data: { username: 'alice' } })
    api.post.mockRejectedValueOnce(new Error('network'))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
  })

  it('updateUser merges fields into current user', async () => {
    tryRestoreSession.mockResolvedValue(true)
    api.get.mockResolvedValue({ data: { username: 'alice', bio: '' } })

    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    act(() => {
      result.current.updateUser({ bio: 'Hello world' })
    })

    expect(result.current.user.bio).toBe('Hello world')
    expect(result.current.user.username).toBe('alice')
  })

  it('registers onAuthFailure callback', async () => {
    renderHook(() => useAuth(), { wrapper })
    await new Promise((r) => setTimeout(r, 10))
    expect(onAuthFailure).toHaveBeenCalledWith(expect.any(Function))
  })

  it('loginWithDiscord posts code and loads profile', async () => {
    tryRestoreSession.mockResolvedValue(true)
    api.get.mockResolvedValue({ data: { username: 'discorduser' } })
    api.post.mockResolvedValueOnce({ data: { access: 'discord-token' } })

    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    await act(async () => {
      await result.current.loginWithDiscord('auth-code-123')
    })

    expect(api.post).toHaveBeenCalledWith('/users/auth/discord/', {
      code: 'auth-code-123',
      redirect_uri: 'http://localhost:5174/oauth/discord/callback',
    })
    expect(setAccessToken).toHaveBeenCalledWith('discord-token')
  })
})
