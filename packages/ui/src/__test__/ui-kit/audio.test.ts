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

import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadDuration } from '../../ui-kit/audio/duration'
import { loadWaveform } from '../../ui-kit/audio/peaks'
import { createPlayback, idlePlayer, PLAYBACK_RATES, playbackOf } from '../../ui-kit/audio/playback'
import { seekable, seekAt, seekByKey } from '../../ui-kit/audio/seek'
import type { PlayerState } from '../../ui-kit/audio/types'

// jsdom does not implement media playback: play() and pause() only throw there.
class FakeAudio extends EventTarget {
  static last: FakeAudio | undefined
  static deferLoad = false
  preload = ''
  paused = true
  currentTime = 0
  duration = NaN
  playbackRate = 1
  defaultPlaybackRate = 1
  playResult: Promise<void> = Promise.resolve()
  error: { code: number } | null = null
  loads = 0

  private source = ''

  constructor () {
    super()
    FakeAudio.last = this
  }

  get src (): string {
    return this.source
  }

  set src (value: string) {
    this.source = value
    this.loads++
    this.error = null
    this.currentTime = 0
    this.playbackRate = this.defaultPlaybackRate
    if (!FakeAudio.deferLoad) this.fire('loadedmetadata')
  }

  async play (): Promise<void> {
    this.paused = false
    this.dispatchEvent(new Event('play'))
    await this.playResult
  }

  pause (): void {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }

  load (): void {}

  removeAttribute (name: string): void {
    if (name === 'src') this.source = ''
  }

  fire (type: string): void {
    this.dispatchEvent(new Event(type))
  }
}

function audio (): FakeAudio {
  if (FakeAudio.last == null) throw new Error('no audio element')
  return FakeAudio.last
}

describe('createPlayback', () => {
  beforeEach(() => {
    FakeAudio.last = undefined
    FakeAudio.deferLoad = false
    vi.stubGlobal('Audio', FakeAudio)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('creates no element until something plays', () => {
    createPlayback()
    expect(FakeAudio.last).toBeUndefined()
  })

  it('plays a recording with its known duration', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg', 12)
    expect(audio().src).toBe('a.ogg')
    expect(get(playback)).toEqual({ id: 'a', playing: true, time: 0, duration: 12, rate: 1 })
  })

  it('pauses and resumes the same recording without reloading it', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg')
    audio().currentTime = 3
    audio().fire('timeupdate')
    playback.toggle('a', 'a.ogg')
    expect(get(playback)).toMatchObject({ id: 'a', playing: false, time: 3 })
    playback.toggle('a', 'a.ogg')
    expect(get(playback)).toMatchObject({ id: 'a', playing: true, time: 3 })
  })

  it('stops the previous recording when another starts', () => {
    const playback = createPlayback()
    const pause = vi.fn()
    playback.toggle('a', 'a.ogg')
    audio().addEventListener('pause', pause)
    audio().currentTime = 5
    audio().fire('timeupdate')
    playback.toggle('b', 'b.ogg', 7)
    expect(pause).toHaveBeenCalledOnce()
    expect(audio().src).toBe('b.ogg')
    expect(get(playback)).toEqual({ id: 'b', playing: true, time: 0, duration: 7, rate: 1 })
  })

  it('takes the duration from the file only when it is finite', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg', 4)
    audio().duration = Infinity
    audio().fire('durationchange')
    expect(get(playback).duration).toBe(4)
    audio().duration = 9
    audio().fire('durationchange')
    expect(get(playback).duration).toBe(9)
  })

  it('rewinds at the end', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg')
    audio().currentTime = 8
    audio().fire('timeupdate')
    audio().fire('ended')
    expect(get(playback)).toMatchObject({ id: 'a', playing: false, time: 0 })
  })

  it('is not left playing when the file fails to load', () => {
    const playback = createPlayback()
    playback.toggle('a', 'broken.ogg')
    audio().fire('error')
    expect(get(playback)).toMatchObject({ id: 'a', playing: false })
  })

  it('loads a file that failed again on the next click', () => {
    const playback = createPlayback()
    playback.toggle('a', 'broken.ogg')
    audio().error = { code: 2 }
    audio().fire('error')
    playback.toggle('a', 'broken.ogg')
    expect(audio().loads).toBe(2)
    expect(get(playback)).toMatchObject({ id: 'a', playing: true })
  })

  it('does not report an interrupted play, only a real failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg')
    audio().playResult = Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    playback.toggle('b', 'b.ogg')
    await Promise.resolve()
    await Promise.resolve()
    expect(warn).not.toHaveBeenCalled()
    audio().playResult = Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    playback.toggle('c', 'c.ogg')
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledOnce()
    })
    warn.mockRestore()
  })

  it('seeks within the duration', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg', 10)
    playback.seek(0.25)
    expect(audio().currentTime).toBe(2.5)
    playback.seek(2)
    expect(audio().currentTime).toBe(10)
    playback.seek(-1)
    expect(audio().currentTime).toBe(0)
  })

  it('does not seek before the duration is known', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg')
    playback.seek(0.5)
    expect(audio().currentTime).toBe(0)
  })

  it('goes up the scale from 1x and wraps around to the slowest', () => {
    const playback = createPlayback()
    const seen = [get(playback).rate]
    for (let i = 0; i < PLAYBACK_RATES.length; i++) {
      playback.cycleRate()
      seen.push(get(playback).rate)
    }
    expect(seen).toEqual([1, 1.5, 2, 0.5, 0.75, 1])
    expect([...PLAYBACK_RATES].sort((a, b) => a - b)).toEqual(PLAYBACK_RATES)
  })

  it('plays the next recording at the speed of the last', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg')
    playback.cycleRate()
    expect(audio().playbackRate).toBe(1.5)
    playback.toggle('b', 'b.ogg')
    expect(audio().playbackRate).toBe(1.5)
    expect(get(playback)).toMatchObject({ id: 'b', rate: 1.5 })
  })

  it('applies a speed chosen before anything played', () => {
    const playback = createPlayback()
    playback.cycleRate()
    playback.toggle('a', 'a.ogg')
    expect(audio().playbackRate).toBe(1.5)
  })

  it('remembers the speed between sessions', () => {
    localStorage.removeItem('test.rate')
    createPlayback({ rateKey: 'test.rate' }).cycleRate()
    expect(get(createPlayback({ rateKey: 'test.rate' })).rate).toBe(1.5)
    localStorage.setItem('test.rate', '7')
    expect(get(createPlayback({ rateKey: 'test.rate' })).rate).toBe(1)
    localStorage.removeItem('test.rate')
  })

  it('keeps the speed when it stops', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg')
    playback.cycleRate()
    playback.stop()
    expect(get(playback).rate).toBe(1.5)
  })

  it('stops the recording and keeps its place', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg', 10)
    audio().currentTime = 4
    audio().fire('timeupdate')
    playback.stop()
    expect(audio().paused).toBe(true)
    expect(audio().src).toBe('')
    expect(get(playback)).toEqual({ playing: false, time: 0, duration: 0, rate: 1 })
    expect(playback.position('a')).toEqual({ time: 4, duration: 10 })
  })

  it('resumes a recording where it was left for another', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg', 10)
    audio().currentTime = 6
    audio().fire('timeupdate')
    playback.toggle('b', 'b.ogg', 5)
    expect(playback.position('a')).toEqual({ time: 6, duration: 10 })
    FakeAudio.deferLoad = true
    playback.toggle('a', 'a.ogg', 10)
    expect(get(playback)).toMatchObject({ id: 'a', time: 6 })
    // The element still reports 0 for the new file: the bar must not jump back meanwhile.
    audio().fire('timeupdate')
    expect(get(playback).time).toBe(6)
    audio().fire('loadedmetadata')
    expect(audio().currentTime).toBe(6)
    expect(playback.position('a')).toBeUndefined()
    expect(playback.position('b')).toBeUndefined()
  })

  it('starts over a recording that was played to the end', () => {
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg', 10)
    audio().currentTime = 10
    audio().fire('timeupdate')
    audio().fire('ended')
    playback.toggle('b', 'b.ogg')
    expect(playback.position('a')).toBeUndefined()
  })

  it('seeks a file that has not loaded yet once it does', () => {
    FakeAudio.deferLoad = true
    const playback = createPlayback()
    playback.toggle('a', 'a.ogg', 10)
    playback.seek(0.5)
    expect(get(playback).time).toBe(5)
    audio().fire('loadedmetadata')
    expect(audio().currentTime).toBe(5)
  })
})

describe('playbackOf', () => {
  // A card that goes stops its recording on a timer: a real one would fire after the test environment is gone.
  beforeEach(() => {
    vi.useFakeTimers()
    FakeAudio.deferLoad = false
    vi.stubGlobal('Audio', FakeAudio)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('tells a recording about itself and stays quiet while another one plays', () => {
    const playback = createPlayback()
    const a: PlayerState[] = []
    const b: PlayerState[] = []
    const stopA = playbackOf(playback, 'a').subscribe((s) => a.push(s))
    const stopB = playbackOf(playback, 'b').subscribe((s) => b.push(s))

    playback.toggle('a', 'a.ogg', 10)
    for (const time of [1, 2, 3]) {
      audio().currentTime = time
      audio().fire('timeupdate')
    }
    expect(b).toHaveLength(1)
    expect(b[0].active).toBe(false)
    expect(a.at(-1)).toEqual({ active: true, playing: true, time: 3, duration: 10 })

    playback.toggle('b', 'b.ogg')
    expect(a.at(-1)?.active).toBe(false)
    expect(b.at(-1)).toMatchObject({ active: true, playing: true })

    stopA()
    stopB()
  })

  it('stops the recording shortly after its last card is gone', () => {
    const playback = createPlayback()
    const first = playbackOf(playback, 'a').subscribe(() => {})
    const second = playbackOf(playback, 'a').subscribe(() => {})
    playback.toggle('a', 'a.ogg')
    first()
    vi.runAllTimers()
    expect(get(playback)).toMatchObject({ id: 'a', playing: true })
    second()
    expect(get(playback).id).toBe('a')
    vi.runAllTimers()
    expect(get(playback)).toEqual({ playing: false, time: 0, duration: 0, rate: 1 })
  })

  it('keeps playing a recording whose card comes back at once', () => {
    const playback = createPlayback()
    const card = playbackOf(playback, 'a').subscribe(() => {})
    playback.toggle('a', 'a.ogg')
    card()
    const remounted = playbackOf(playback, 'a').subscribe(() => {})
    vi.runAllTimers()
    expect(get(playback)).toMatchObject({ id: 'a', playing: true })
    remounted()
  })

  it('leaves alone the recording that plays when another card goes', () => {
    const playback = createPlayback()
    const a = playbackOf(playback, 'a').subscribe(() => {})
    const b = playbackOf(playback, 'b').subscribe(() => {})
    playback.toggle('a', 'a.ogg')
    b()
    vi.runAllTimers()
    expect(get(playback)).toMatchObject({ id: 'a', playing: true })
    a()
  })

  it('shows a recording left halfway at its place, once', () => {
    const playback = createPlayback()
    const a: PlayerState[] = []
    const stop = playbackOf(playback, 'a').subscribe((s) => a.push(s))
    playback.toggle('a', 'a.ogg', 10)
    audio().currentTime = 4
    audio().fire('timeupdate')
    playback.toggle('b', 'b.ogg')
    const left = a.length
    expect(a.at(-1)).toEqual({ active: false, playing: false, time: 4, duration: 10 })
    audio().currentTime = 1
    audio().fire('timeupdate')
    expect(a).toHaveLength(left)
    stop()
  })

  it('gives a card that is not a recording a constant idle state', () => {
    expect(get(idlePlayer)).toEqual({ active: false, playing: false, time: 0, duration: 0 })
  })
})

describe('seekByKey', () => {
  it('steps five seconds of a known length', () => {
    expect(seekByKey('ArrowRight', 0.5, 10)).toBe(1)
    expect(seekByKey('ArrowLeft', 0.5, 20)).toBe(0.25)
    expect(seekByKey('ArrowUp', 0, 100)).toBeCloseTo(0.05)
  })

  it('steps a share of a recording of unknown length', () => {
    expect(seekByKey('ArrowRight', 0.5, undefined)).toBeCloseTo(0.55)
    expect(seekByKey('ArrowDown', 0.5, 0)).toBeCloseTo(0.45)
  })

  it('stays within the recording', () => {
    expect(seekByKey('ArrowRight', 0.99, 10)).toBe(1)
    expect(seekByKey('ArrowLeft', 0.01, 10)).toBe(0)
    expect(seekByKey('Home', 0.7, 10)).toBe(0)
    expect(seekByKey('End', 0.2, 10)).toBe(1)
  })

  it('leaves other keys to the page', () => {
    expect(seekByKey('Enter', 0.5, 10)).toBeUndefined()
    expect(seekByKey('Tab', 0.5, 10)).toBeUndefined()
  })
})

describe('seekAt', () => {
  function click (clientX: number, width: number): MouseEvent {
    const target = document.createElement('div')
    target.getBoundingClientRect = () => ({ left: 100, width }) as unknown as DOMRect
    return { clientX, currentTarget: target } as unknown as MouseEvent
  }

  it('is the share of the line left of the pointer', () => {
    expect(seekAt(click(150, 200))).toBe(0.25)
  })

  it('stays within the line', () => {
    expect(seekAt(click(90, 200))).toBe(0)
    expect(seekAt(click(400, 200))).toBe(1)
  })

  it('is the start for a line not laid out yet', () => {
    expect(seekAt(click(150, 0))).toBe(0)
  })
})

describe('seekable', () => {
  it('makes a slider that seeks on a click and on the arrows', () => {
    const node = document.createElement('span')
    node.getBoundingClientRect = () => ({ left: 0, width: 100 }) as unknown as DOMRect
    const onSeek = vi.fn()
    const action = seekable(node, { progress: 0.5, duration: 10, valueText: '0:05 / 0:10', onSeek })
    expect(node.getAttribute('role')).toBe('slider')
    expect(node.tabIndex).toBe(0)
    expect(node.getAttribute('aria-valuenow')).toBe('50')
    expect(node.getAttribute('aria-valuetext')).toBe('0:05 / 0:10')

    node.dispatchEvent(new MouseEvent('click', { clientX: 25 }))
    expect(onSeek).toHaveBeenLastCalledWith(0.25)
    const key = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    node.dispatchEvent(key)
    expect(onSeek).toHaveBeenLastCalledWith(1)
    expect(key.defaultPrevented).toBe(true)

    action.update({ progress: 0.2, onSeek })
    expect(node.getAttribute('aria-valuenow')).toBe('20')
    expect(node.hasAttribute('aria-valuetext')).toBe(false)

    action.destroy()
    node.dispatchEvent(new MouseEvent('click', { clientX: 25 }))
    expect(onSeek).toHaveBeenCalledTimes(2)
  })
})

describe('loadDuration', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('gives up on a header that never comes and asks again later', async () => {
    vi.useFakeTimers()
    const created: number[] = []
    vi.stubGlobal(
      'Audio',
      class {
        preload = ''
        src = ''
        onloadedmetadata: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor () {
          created.push(1)
        }

        removeAttribute (): void {}
        load (): void {}
      }
    )
    const result = loadDuration('rec-silent', 'a.ogg')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await result).toBeUndefined()
    void loadDuration('rec-silent', 'a.ogg')
    expect(created).toHaveLength(2)
  })
})

describe('loadWaveform', () => {
  let ids = 0
  const id = (): string => `rec-${++ids}`

  beforeEach(() => {
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        async decodeAudioData (): Promise<{ duration: number, getChannelData: () => Float32Array }> {
          return { duration: 2, getChannelData: () => new Float32Array([0.5, 1, 0.5, 1]) }
        }
      }
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function stubFetch (response: () => Promise<Response>): ReturnType<typeof vi.fn> {
    const fetch = vi.fn(response)
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  const ok = async (): Promise<Response> => new Response(new ArrayBuffer(8))

  it('decodes a recording once for every player of it', async () => {
    const fetch = stubFetch(ok)
    const rec = id()
    const [first, second] = await Promise.all([loadWaveform(rec, 'a.ogg'), loadWaveform(rec, 'a.ogg')])
    expect(fetch).toHaveBeenCalledOnce()
    expect(first?.duration).toBe(2)
    expect(second).toBe(first)
    expect(await loadWaveform(rec, 'a.ogg')).toBe(first)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('does not download again a file the browser cannot decode', async () => {
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        async decodeAudioData (): Promise<never> {
          throw new Error('EncodingError')
        }
      }
    )
    const fetch = stubFetch(ok)
    const rec = id()
    expect(await loadWaveform(rec, 'a.webm')).toBeUndefined()
    expect(await loadWaveform(rec, 'a.webm')).toBeUndefined()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('skips a recording nobody shows any more and tries again later', async () => {
    const fetch = stubFetch(ok)
    const rec = id()
    expect(await loadWaveform(rec, 'a.ogg', () => false)).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    expect(await loadWaveform(rec, 'a.ogg')).toBeDefined()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('decodes a queued recording when any of its players is still shown', async () => {
    const pending: Array<() => void> = []
    const fetch = stubFetch(async () => {
      await new Promise<void>((resolve) => pending.push(resolve))
      return new Response(new ArrayBuffer(8))
    })
    const busy = Promise.all([loadWaveform(id(), 'busy.ogg'), loadWaveform(id(), 'busy.ogg')])
    await vi.waitFor(() => {
      expect(pending).toHaveLength(2)
    })
    const rec = id()
    const queued = Promise.all([loadWaveform(rec, 'a.ogg', () => false), loadWaveform(rec, 'a.ogg', () => true)])
    pending.splice(0).forEach((resolve) => {
      resolve()
    })
    await vi.waitFor(() => {
      expect(pending).toHaveLength(1)
    })
    pending[0]()
    await Promise.all([busy, queued])
    expect(fetch.mock.calls.filter(([src]) => src === 'a.ogg')).toHaveLength(1)
  })

  it('does not hold a player that asks after the decode started', async () => {
    let respond: (r: Response) => void = () => {}
    const fetch = stubFetch(async () => await new Promise<Response>((resolve) => (respond = resolve)))
    const rec = id()
    const first = loadWaveform(rec, 'a.ogg')
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce()
    })
    const late = vi.fn(() => true)
    const second = loadWaveform(rec, 'a.ogg', late)
    respond(new Response(new ArrayBuffer(8)))
    expect(await second).toBe(await first)
    expect(late).not.toHaveBeenCalled()
  })

  it('forgets a failure so the next player retries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetch = stubFetch(async () => new Response(null, { status: 500 }))
    const rec = id()
    expect(await loadWaveform(rec, 'a.ogg')).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    fetch.mockImplementation(ok)
    expect(await loadWaveform(rec, 'a.ogg')).toBeDefined()
    warn.mockRestore()
  })

  it('decodes at most two recordings at a time', async () => {
    const pending: Array<() => void> = []
    const fetch = stubFetch(async () => {
      await new Promise<void>((resolve) => pending.push(resolve))
      return new Response(new ArrayBuffer(8))
    })
    const all = Promise.all([id(), id(), id(), id()].map(async (rec) => await loadWaveform(rec, 'a.ogg')))
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetch).toHaveBeenCalledTimes(2)
    pending.shift()?.()
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(3)
    })
    while (pending.length > 0) {
      pending.shift()?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(await all).toHaveLength(4)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})
