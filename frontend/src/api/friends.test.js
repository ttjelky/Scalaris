import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as friendsApi from './friends'

vi.mock('./axios.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from './axios.js'

describe('friends API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getFriends calls GET /users/me/friends/', () => {
    api.get.mockResolvedValue({ data: [] })
    friendsApi.getFriends()
    expect(api.get).toHaveBeenCalledWith('/users/me/friends/')
  })

  it('sendFriendRequest calls POST /users/{id}/friend-request/', () => {
    api.post.mockResolvedValue({ data: {} })
    friendsApi.sendFriendRequest(42)
    expect(api.post).toHaveBeenCalledWith('/users/42/friend-request/')
  })

  it('acceptFriendRequest calls POST /users/friend-requests/{id}/accept/', () => {
    api.post.mockResolvedValue({ data: {} })
    friendsApi.acceptFriendRequest(7)
    expect(api.post).toHaveBeenCalledWith('/users/friend-requests/7/accept/')
  })

  it('rejectFriendRequest calls DELETE /users/friend-requests/{id}/reject/', () => {
    api.delete.mockResolvedValue({ data: {} })
    friendsApi.rejectFriendRequest(3)
    expect(api.delete).toHaveBeenCalledWith('/users/friend-requests/3/reject/')
  })

  it('removeFriend calls DELETE /users/{id}/friend/', () => {
    api.delete.mockResolvedValue({ data: {} })
    friendsApi.removeFriend(5)
    expect(api.delete).toHaveBeenCalledWith('/users/5/friend/')
  })
})
