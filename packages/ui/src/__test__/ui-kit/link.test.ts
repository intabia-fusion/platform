//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { describe, expect, it } from 'vitest'

import { describeLink, linkHref, linkLayout, linkTarget, nonEmpty, webUrl } from '../../ui-kit/link/link'

describe('linkHref', () => {
  it('keeps web, mail, phone and relative addresses', () => {
    expect(linkHref('https://example.com/a')).toBe('https://example.com/a')
    expect(linkHref('mailto:a@example.com')).toBe('mailto:a@example.com')
    expect(linkHref('tel:+100')).toBe('tel:+100')
    expect(linkHref('/workbench/ws/tracker')).toBe('/workbench/ws/tracker')
    expect(linkHref('#top')).toBe('#top')
  })

  // An uploaded .md renders raw `<a href>` through htmlToMarkup with the href as is.
  it('drops schemes that run code, as the browser reads them', () => {
    expect(linkHref('javascript:alert(1)')).toBeUndefined()
    expect(linkHref(' JavaScript:alert(1)')).toBeUndefined()
    expect(linkHref('java\tscript:alert(1)')).toBeUndefined()
    expect(linkHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(linkHref('vbscript:msgbox(1)')).toBeUndefined()
    expect(linkHref(undefined)).toBeUndefined()
  })
})

describe('webUrl', () => {
  it('keeps a web address in any case', () => {
    expect(webUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(webUrl('HTTP://example.com')).toBe('HTTP://example.com')
  })

  it('drops other schemes and no address', () => {
    expect(webUrl('javascript:alert(1)')).toBeUndefined()
    expect(webUrl('ftp://example.com')).toBeUndefined()
    expect(webUrl('example.com')).toBeUndefined()
    expect(webUrl(undefined)).toBeUndefined()
  })
})

describe('nonEmpty', () => {
  it('treats blank text as none', () => {
    expect(nonEmpty('  ')).toBeUndefined()
    expect(nonEmpty(undefined)).toBeUndefined()
    expect(nonEmpty(' a ')).toBe(' a ')
  })
})

describe('linkLayout', () => {
  it('is text without a picture', () => {
    expect(linkLayout(undefined)).toBe('text')
    expect(linkLayout(' ')).toBe('text')
  })

  it('is a thumbnail for an unknown, small or square picture', () => {
    expect(linkLayout('a.png')).toBe('thumb')
    expect(linkLayout('a.png', 800, 0)).toBe('thumb')
    expect(linkLayout('a.png', 300, 150)).toBe('thumb')
    expect(linkLayout('a.png', 800, 800)).toBe('thumb')
  })

  it('is a cover for a wide picture', () => {
    expect(linkLayout('a.png', 1200, 630)).toBe('cover')
    expect(linkLayout('a.png', 400, 300)).toBe('cover')
  })
})

describe('linkTarget', () => {
  it('prefers the details and takes the site from them', () => {
    expect(linkTarget({ url: 'https://a.com/x' }, { url: 'https://b.com/y', hostname: 'b.com' })).toEqual({
      url: 'https://b.com/y',
      site: 'b.com'
    })
  })

  it('takes the site from the address when the details have none', () => {
    expect(linkTarget({ url: 'https://www.a.com/x' }, { hostname: '' })).toEqual({
      url: 'https://www.a.com/x',
      site: 'www.a.com'
    })
  })

  it('has no site for an address it cannot read', () => {
    expect(linkTarget({ url: 'not a url' })).toEqual({ url: 'not a url', site: undefined })
    expect(linkTarget()).toEqual({ url: undefined, site: undefined })
  })
})

describe('describeLink', () => {
  it('names the page by its title', () => {
    const line = describeLink({ url: 'https://a.com/x', title: 'Page', image: 'p.png' }, undefined, true)
    expect(line).toMatchObject({ title: 'Page', site: 'a.com', image: 'p.png', failed: false })
    expect(line.address).toBeUndefined()
  })

  it('shows the address without its scheme when only the site is known', () => {
    const line = describeLink({ url: 'HTTPS://a.com/docs/1' }, undefined, true)
    expect(line).toMatchObject({ title: 'a.com', address: 'a.com/docs/1', failed: false })
  })

  it('fails only once the details have come with nothing', () => {
    expect(describeLink(undefined, undefined, false).failed).toBe(false)
    expect(describeLink(undefined, undefined, true).failed).toBe(true)
  })
})
