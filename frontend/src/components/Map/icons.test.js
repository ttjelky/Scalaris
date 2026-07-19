import { describe, it, expect } from 'vitest'
import {
  ownIcon,
  makePersonIcon,
  makeClusterIcon,
  gatheringIcon,
  makeCheckpointIcon,
} from './icons'

describe('Map icons', () => {
  it('ownIcon is a 16x16 divIcon', () => {
    expect(ownIcon.options.iconSize).toEqual([16, 16])
    expect(ownIcon.options.iconAnchor).toEqual([8, 8])
  })

  it('gatheringIcon is a 22x22 divIcon', () => {
    expect(gatheringIcon.options.iconSize).toEqual([22, 22])
  })

  describe('makePersonIcon', () => {
    it('uses the smaller size for a non-accepted person', () => {
      const icon = makePersonIcon({ username: 'bob', avatar: null }, false)
      expect(icon.options.iconSize).toEqual([26, 26])
    })

    it('uses the larger size for an accepted person', () => {
      const icon = makePersonIcon({ username: 'bob', avatar: null }, true)
      expect(icon.options.iconSize).toEqual([30, 30])
    })

    it('renders the uppercase first-letter fallback when there is no avatar', () => {
      const icon = makePersonIcon({ username: 'bob', avatar: null }, false)
      expect(icon.options.html).toContain('>B<')
      expect(icon.options.html).not.toContain('<img')
    })

    it('falls back to "?" when username is missing', () => {
      const icon = makePersonIcon({ username: '', avatar: null }, false)
      expect(icon.options.html).toContain('>?<')
    })

    it('renders an <img> with the avatar url when provided', () => {
      const icon = makePersonIcon({ username: 'carol', avatar: 'http://example.com/c.jpg' }, false)
      expect(icon.options.html).toContain('src="http://example.com/c.jpg"')
    })

    it('escapes HTML-significant characters in the username', () => {
      const icon = makePersonIcon({ username: '<script>', avatar: null }, false)
      expect(icon.options.html).not.toContain('<script>')
      expect(icon.options.html).toContain('&lt;')
    })

    it('escapes HTML-significant characters in the avatar url', () => {
      const icon = makePersonIcon({ username: 'bob', avatar: 'http://x.com/"><script>' }, false)
      expect(icon.options.html).not.toContain('"><script>')
    })
  })

  describe('makeClusterIcon', () => {
    it('renders the count and default styling', () => {
      const icon = makeClusterIcon(5, false)
      expect(icon.options.html).toContain('>5<')
      expect(icon.options.iconSize).toEqual([34, 34])
    })

    it('applies the accepted ring class when hasAccepted is true', () => {
      const icon = makeClusterIcon(3, true)
      // className list is space separated inside the html attribute value
      expect(icon.options.html).toMatch(/class="[^"]*\S+[^"]*">3</)
    })
  })

  describe('makeCheckpointIcon', () => {
    it('renders the order number', () => {
      const icon = makeCheckpointIcon(2, false, false)
      expect(icon.options.html).toContain('>2<')
      expect(icon.options.iconSize).toEqual([30, 30])
    })

    it('marks the current checkpoint distinctly from a passed one', () => {
      const current = makeCheckpointIcon(1, true, false)
      const passed = makeCheckpointIcon(1, false, true)
      expect(current.options.html).not.toBe(passed.options.html)
    })
  })
})
