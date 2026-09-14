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

import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ComponentProps } from 'svelte'
import Video from '../components/Video.svelte'

// jsdom has no WebVTT track API; plyr probes it while building the control bar.
if ((globalThis as any).TextTrackList === undefined) {
  ;(globalThis as any).TextTrackList = class extends Array {}
}
if ((globalThis as any).TextTrack === undefined) {
  class TextTrackPolyfill {
    mode: '' | 'hidden' | 'showing' = 'hidden'
    kind: string
    label: string
    constructor (kind = '', label = '') {
      this.kind = kind
      this.label = label
    }
  }
  ;(globalThis as any).TextTrack = TextTrackPolyfill
}

let target: HTMLElement

function mount (props: Partial<ComponentProps<Video>>): { host: HTMLElement, component: Video, video: HTMLVideoElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Video({ target: host, props: props as ComponentProps<Video> })
  return { host, component, video: host.querySelector('video') as HTMLVideoElement }
}

describe('Video', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a video with the provided src', () => {
    const { video } = mount({ src: '/movie.mp4' })
    expect(video).not.toBeNull()
    expect(video.getAttribute('src')).toBe('/movie.mp4')
    expect(video.getAttribute('width')).toBe('100%')
    expect(video.getAttribute('height')).toBe('100%')
  })

  it('preloads automatically by default and not when disabled', () => {
    expect(mount({ src: '/a.mp4' }).video.getAttribute('preload')).toBe('auto')
    expect(mount({ src: '/a.mp4', preload: false }).video.getAttribute('preload')).toBe('none')
  })

  it('exposes the caption track with the given name', () => {
    const { video } = mount({ src: '/a.mp4', name: 'ru' })
    const track = video.querySelector('track') as HTMLTrackElement
    expect(track).not.toBeNull()
    expect(track.getAttribute('kind')).toBe('captions')
    expect(track.getAttribute('label')).toBe('ru')
    expect(mount({ src: '/b.mp4' }).video.querySelector('track')?.getAttribute('label')).toBe('')
  })

  it('passes the poster through the data attribute', async () => {
    const { video } = mount({ src: '/a.mp4', poster: '/poster.jpg' })
    expect(video.getAttribute('data-poster')).toBe('/poster.jpg')
    await tick()
  })
})
