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

import type { LinkDetailsData, LinkLayout, LinkPreviewData } from './types'

export function nonEmpty (text?: string): string | undefined {
  return text == null || text.trim() === '' ? undefined : text
}

// A smaller or squarer picture is mostly a logo: drawn across the card it blurs or crops.
const COVER_MIN_WIDTH = 400
const COVER_MIN_RATIO = 1.3

export function linkLayout (image?: string, width?: number, height?: number): LinkLayout {
  if (nonEmpty(image) == null) return 'text'
  if (width == null || height == null || height === 0) return 'thumb'
  return width >= COVER_MIN_WIDTH && width / height >= COVER_MIN_RATIO ? 'cover' : 'thumb'
}

function hostOf (url?: string): string | undefined {
  if (url == null) return undefined
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

const WEB_SCHEMES = ['https://', 'http://']

function webScheme (url: string): string | undefined {
  const start = url.slice(0, 8).toLowerCase()
  return WEB_SCHEMES.find((it) => start.startsWith(it))
}

/** The address if it is a web one: it comes from a stranger's page, where `javascript:` may be too. */
export function webUrl (url?: string): string | undefined {
  return url != null && webScheme(url) != null ? url : undefined
}

const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:']

/** A markup link's address unless its scheme runs code (`javascript:`, `data:`). */
export function linkHref (href?: string): string | undefined {
  if (href == null) return undefined
  try {
    return LINK_PROTOCOLS.includes(new URL(href, 'http://relative.invalid').protocol) ? href : undefined
  } catch {
    return undefined
  }
}

function withoutScheme (url: string): string {
  return url.slice(webScheme(url)?.length ?? 0)
}

export function openLink (url?: string): void {
  const href = webUrl(url)
  if (href != null) window.open(href, '_blank', 'noopener,noreferrer')
}

export function linkTarget (preview?: LinkPreviewData, details?: LinkDetailsData): { url?: string, site?: string } {
  const url = nonEmpty(details?.url) ?? nonEmpty(preview?.url)
  return { url, site: nonEmpty(details?.hostname) ?? hostOf(url) }
}

export interface LinkLine {
  url?: string
  site?: string
  title?: string
  /** Only the address survived: the site stands for the title, this names the page under it. */
  address?: string
  image?: string
  failed: boolean
}

export function describeLink (preview?: LinkPreviewData, details?: LinkDetailsData, detailsLoaded = false): LinkLine {
  const { url, site } = linkTarget(preview, details)
  const title = nonEmpty(preview?.title) ?? nonEmpty(details?.title) ?? site
  const address = url != null && title === site && details?.title == null ? withoutScheme(url) : undefined
  const image = nonEmpty(preview?.image) ?? nonEmpty(details?.image)
  return { url, site, title, address, image, failed: detailsLoaded && title == null }
}

// The picture's fade: the skeleton goes only once it is covered.
const REVEAL_MS = 200

/** Marks the box `picture-loading` until the picture has its pixels; a cached one shows at once. */
export function revealImage (
  img: HTMLImageElement,
  src?: string
): { update: (src?: string) => void, destroy: () => void } {
  const box = img.parentElement
  let timer: ReturnType<typeof setTimeout> | undefined
  const loaded = (): void => {
    img.classList.add('revealed')
    timer = setTimeout(() => box?.classList.remove('picture-loading'), REVEAL_MS)
  }
  // A broken picture has nothing to wait for: the skeleton under it would stay for good.
  const failed = (): void => {
    clearTimeout(timer)
    box?.classList.remove('picture-loading')
  }
  const start = (): void => {
    clearTimeout(timer)
    img.classList.remove('revealed', 'revealing')
    if (img.complete) {
      if (img.naturalWidth > 0) img.classList.add('revealed')
      box?.classList.remove('picture-loading')
      return
    }
    img.classList.add('revealing')
    box?.classList.add('picture-loading')
  }
  img.addEventListener('load', loaded)
  img.addEventListener('error', failed)
  start()
  return {
    update: () => {
      start()
    },
    destroy: () => {
      clearTimeout(timer)
      img.removeEventListener('load', loaded)
      img.removeEventListener('error', failed)
      box?.classList.remove('picture-loading')
    }
  }
}
