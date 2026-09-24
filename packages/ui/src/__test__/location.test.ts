import { describe, it, expect, vi } from 'vitest'
import { locationToUrl, stripLinkSlugs } from '../location'
import { type Location } from '../types'

// Mock svelte/store to avoid ES module issues in Jest
vi.mock('svelte/store', () => ({
  derived: vi.fn(),
  get: vi.fn(),
  writable: vi.fn()
}))

describe('location', () => {
  it('should translate location to url', () => {
    const loc: Location = {
      path: ['x', 'y']
    }
    const url = locationToUrl(loc)
    expect(url).toBe('/x/y')
  })

  it('strips names from link ids before analytics', () => {
    const id = '6ab563cdad9fa7c25f0b4f94'
    expect(stripLinkSlugs(`/workbench/ws/chunter/dumpa-lumpa-${id}`)).toBe(`/workbench/ws/chunter/${id}`)
    expect(stripLinkSlugs(`/workbench/ws/chunter/dumpa-lumpa-${id}/thread?message=x`)).toBe(
      `/workbench/ws/chunter/${id}/thread?message=x`
    )
    expect(stripLinkSlugs(`/workbench/ws/chunter/${id}`)).toBe(`/workbench/ws/chunter/${id}`)
    expect(stripLinkSlugs('/workbench/ws/chunter/chunter-space-General')).toBe(
      '/workbench/ws/chunter/chunter-space-General'
    )
    expect(stripLinkSlugs('/workbench/ws/tracker/TSK-1')).toBe('/workbench/ws/tracker/TSK-1')
  })
})
