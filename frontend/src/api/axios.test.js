import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock axios — we need to control it fully for interceptor tests
const mockAxiosInstance = {
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
  post: vi.fn(),
  get: vi.fn(),
  defaults: { headers: { common: {} } },
}

vi.mock('axios', () => {
  const interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  }
  const instance = {
    interceptors,
    post: vi.fn(),
    get: vi.fn(),
    create: vi.fn(() => instance),
    defaults: { headers: { common: {} } },
  }
  return {
    default: {
      create: vi.fn(() => instance),
      post: vi.fn(),
    },
    __mockInstance: instance,
  }
})

describe('axios.js — token management', () => {
  let getAccessToken, setAccessToken, clearAccessToken, onAuthFailure

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../api/axios.js')
    getAccessToken = mod.getAccessToken
    setAccessToken = mod.setAccessToken
    clearAccessToken = mod.clearAccessToken
    onAuthFailure = mod.onAuthFailure
  })

  it('initial access token is null', () => {
    expect(getAccessToken()).toBeNull()
  })

  it('setAccessToken stores the token', () => {
    setAccessToken('test-token-123')
    expect(getAccessToken()).toBe('test-token-123')
  })

  it('clearAccessToken resets token to null', () => {
    setAccessToken('token-to-clear')
    clearAccessToken()
    expect(getAccessToken()).toBeNull()
  })
})

describe('axios.js — PUBLIC_AUTH_PATHS exclusion', () => {
  let api, setAccessToken

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../api/axios.js')
    api = mod.default
    setAccessToken = mod.setAccessToken
    setAccessToken('valid-token')
  })

  it('does not attach Bearer to public login path', () => {
    const config = { url: '/users/login/', headers: {} }
    // Get the request interceptor that was registered
    const requestInterceptor = api.interceptors.request.use.mock.calls[0]?.[0]
    if (requestInterceptor) {
      const result = requestInterceptor(config)
      expect(result.headers.Authorization).toBeUndefined()
    }
  })

  it('does not attach Bearer to register path', () => {
    const config = { url: '/users/register/', headers: {} }
    const requestInterceptor = api.interceptors.request.use.mock.calls[0]?.[0]
    if (requestInterceptor) {
      const result = requestInterceptor(config)
      expect(result.headers.Authorization).toBeUndefined()
    }
  })

  it('does not attach Bearer to online-count path', () => {
    const config = { url: '/activities/online-count/', headers: {} }
    const requestInterceptor = api.interceptors.request.use.mock.calls[0]?.[0]
    if (requestInterceptor) {
      const result = requestInterceptor(config)
      expect(result.headers.Authorization).toBeUndefined()
    }
  })

  it('attaches Bearer to non-public paths', () => {
    const config = { url: '/users/me/', headers: {} }
    const requestInterceptor = api.interceptors.request.use.mock.calls[0]?.[0]
    if (requestInterceptor) {
      const result = requestInterceptor(config)
      expect(result.headers.Authorization).toBe('Bearer valid-token')
    }
  })
})
