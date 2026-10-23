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

import { get, readable, writable, type Readable } from 'svelte/store'

import type { Playback, PlaybackState, PlayerState, SavedPosition } from './types'

// A card remounted or handed over to the viewer shows up again within a frame or two.
const RELEASE_DELAY = 300

/** Ascending, so the cycle reads as a scale; a new listener starts at 1×. */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.5, 2]

const RATE_KEY = 'audio.playbackRate'

function storedRate (key: string | undefined): number {
  if (key == null) return 1
  try {
    const rate = Number(localStorage.getItem(key))
    return PLAYBACK_RATES.includes(rate) ? rate : 1
  } catch {
    return 1
  }
}

function storeRate (key: string | undefined, rate: number): void {
  if (key == null) return
  try {
    localStorage.setItem(key, String(rate))
  } catch {}
}

/** A recording loads when played, not when its row renders; starting one stops the previous. */
export function createPlayback (options: { rateKey?: string } = {}): Playback {
  const state = writable<PlaybackState>({ playing: false, time: 0, duration: 0, rate: storedRate(options.rateKey) })
  let audio: HTMLAudioElement | undefined
  const shown = new Map<string, number>()
  const positions = new Map<string, SavedPosition>()
  // Applied once the new file knows its length; until then the element reports 0.
  let resumeAt: number | undefined

  function remember (): void {
    const { id, time, duration } = get(state)
    if (id == null) return
    if (time > 0) positions.set(id, { time, duration })
    else positions.delete(id)
  }

  function element (): HTMLAudioElement {
    if (audio != null) return audio
    const el = new Audio()
    el.preload = 'metadata'
    applyRate(el, get(state).rate)
    el.addEventListener('timeupdate', () => {
      if (resumeAt != null) return
      state.update((s) => ({ ...s, time: el.currentTime }))
    })
    el.addEventListener('loadedmetadata', () => {
      if (resumeAt == null) return
      el.currentTime = resumeAt
      resumeAt = undefined
    })
    el.addEventListener('durationchange', () => {
      if (Number.isFinite(el.duration)) state.update((s) => ({ ...s, duration: el.duration }))
    })
    el.addEventListener('play', () => {
      state.update((s) => ({ ...s, playing: true }))
    })
    el.addEventListener('pause', () => {
      state.update((s) => ({ ...s, playing: false }))
    })
    el.addEventListener('ended', () => {
      state.update((s) => ({ ...s, playing: false, time: 0 }))
    })
    // A file that fails to load leaves the element unpaused, with no pause event to say it stopped.
    el.addEventListener('error', () => {
      state.update((s) => ({ ...s, playing: false }))
    })
    audio = el
    return el
  }

  // A new file resets the speed to the default one, so both are set.
  function applyRate (el: HTMLAudioElement, rate: number): void {
    el.defaultPlaybackRate = rate
    el.playbackRate = rate
  }

  function play (el: HTMLAudioElement): void {
    void el.play().catch((err) => {
      // Switching recordings interrupts the pending play of the previous one.
      if ((err as Error)?.name !== 'AbortError') console.warn('failed to play recording', err)
    })
  }

  function stop (): void {
    remember()
    resumeAt = undefined
    if (audio != null) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    state.update((s) => ({ playing: false, time: 0, duration: 0, rate: s.rate }))
  }

  return {
    subscribe: state.subscribe,
    stop,

    toggle (id: string, src: string, knownDuration?: number): void {
      const el = element()
      const current = get(state)
      // A file that failed to load is loaded again rather than resumed.
      if (current.id === id && el.error == null) {
        if (el.paused) play(el)
        else el.pause()
        return
      }
      remember()
      const saved = positions.get(id)
      positions.delete(id)
      el.pause()
      resumeAt = saved?.time ?? 0
      el.src = src
      applyRate(el, current.rate)
      const duration = knownDuration != null && knownDuration > 0 ? knownDuration : (saved?.duration ?? 0)
      state.set({ id, playing: false, time: saved?.time ?? 0, duration, rate: current.rate })
      play(el)
    },

    seek (fraction: number): void {
      const { duration } = get(state)
      if (duration <= 0) return
      const time = Math.min(Math.max(fraction, 0), 1) * duration
      if (resumeAt != null) {
        resumeAt = time
        state.update((s) => ({ ...s, time }))
        return
      }
      element().currentTime = time
    },

    cycleRate (): void {
      const { rate } = get(state)
      const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length]
      if (audio != null) applyRate(audio, next)
      storeRate(options.rateKey, next)
      state.update((s) => ({ ...s, rate: next }))
    },

    position (id: string): SavedPosition | undefined {
      return positions.get(id)
    },

    show (id: string): () => void {
      shown.set(id, (shown.get(id) ?? 0) + 1)
      let released = false
      return () => {
        if (released) return
        released = true
        const left = (shown.get(id) ?? 1) - 1
        if (left > 0) {
          shown.set(id, left)
          return
        }
        shown.delete(id)
        // Nothing left on screen to pause it with.
        setTimeout(() => {
          if (!shown.has(id) && get(state).id === id) stop()
        }, RELEASE_DELAY)
      }
    }
  }
}

const IDLE: PlayerState = Object.freeze({ active: false, playing: false, time: 0, duration: 0 })

/** For a card that is not a recording: never active, and no subscription to the player at all. */
export const idlePlayer: Readable<PlayerState> = readable(IDLE)

/** Only the playing one re-renders; a subscription counts as a card on screen (see `show`). */
export function playbackOf (playback: Playback, id: string): Readable<PlayerState> {
  return {
    subscribe (run) {
      let last: PlayerState | undefined
      const release = playback.show(id)
      const unsubscribe = playback.subscribe((s) => {
        if (s.id !== id) {
          // Ticks of another recording leave this one as it is.
          const saved = playback.position(id)
          const time = saved?.time ?? 0
          const duration = saved?.duration ?? 0
          if (last != null && !last.active && last.time === time && last.duration === duration) return
          last = saved == null ? IDLE : { active: false, playing: false, time, duration }
          run(last)
          return
        }
        last = { active: true, playing: s.playing, time: s.time, duration: s.duration }
        run(last)
      })
      return () => {
        unsubscribe()
        release()
      }
    }
  }
}

let shared: Playback | undefined

/** The player of the chat: starting a recording in one message stops the one in another. */
export function sharedPlayback (): Playback {
  shared ??= createPlayback({ rateKey: RATE_KEY })
  return shared
}
