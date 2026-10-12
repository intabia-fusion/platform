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

import { getMetadata } from '@hcengineering/platform'
import { get, writable } from 'svelte/store'

import uis from './plugin'

// Ten minutes without input, or a minute out of sight, and the person is away.
export const DEFAULT_IDLE_AFTER_MS = 10 * 60 * 1000
export const DEFAULT_HIDDEN_AFTER_MS = 60 * 1000
// How often the thresholds are re-checked without any event.
const CHECK_EVERY_MS = 15 * 1000
// Pointer moves come in bursts; one note per second is plenty.
const INPUT_NOTE_EVERY_MS = 1000

export const isUserAwayStore = writable(false)

export function isUserAway (): boolean {
  return get(isUserAwayStore)
}

export interface PresenceThresholds {
  idleAfterMs: number
  hiddenAfterMs: number
}

export interface PresenceState {
  lastInput: number
  hiddenSince: number | undefined
  systemIdle: boolean
}

export type PresenceReason = 'system-idle' | 'hidden' | 'idle' | 'active'

export function presenceReason (state: PresenceState, now: number, thresholds: PresenceThresholds): PresenceReason {
  if (state.systemIdle) return 'system-idle'
  if (state.hiddenSince !== undefined && now - state.hiddenSince >= thresholds.hiddenAfterMs) return 'hidden'
  if (now - state.lastInput >= thresholds.idleAfterMs) return 'idle'
  return 'active'
}

export function computeAway (state: PresenceState, now: number, thresholds: PresenceThresholds): boolean {
  return presenceReason(state, now, thresholds) !== 'active'
}

export function getPresenceThresholds (): PresenceThresholds {
  return {
    idleAfterMs: getMetadata(uis.metadata.IdleAfterMs) ?? DEFAULT_IDLE_AFTER_MS,
    hiddenAfterMs: getMetadata(uis.metadata.HiddenAfterMs) ?? DEFAULT_HIDDEN_AFTER_MS
  }
}

const state: PresenceState = { lastInput: Date.now(), hiddenSince: undefined, systemIdle: false }

function publish (): void {
  const now = Date.now()
  const reason = presenceReason(state, now, getPresenceThresholds())
  const away = reason !== 'active'
  if (get(isUserAwayStore) === away) return
  // Only transitions are logged: what the server is told decides whether the phone push waits.
  console.info(`[presence] ${away ? 'away' : 'here'}`, reason, new Date(now).toISOString())
  isUserAwayStore.set(away)
}

function noteInput (): void {
  const now = Date.now()
  if (now - state.lastInput < INPUT_NOTE_EVERY_MS) return
  state.lastInput = now
  publish()
}

function noteVisibility (): void {
  const hidden = typeof document !== 'undefined' && document.hidden
  if (hidden) {
    state.hiddenSince = state.hiddenSince ?? Date.now()
  } else {
    state.hiddenSince = undefined
    // Coming back to the window counts as input: the person is looking at it.
    state.lastInput = Date.now()
  }
  publish()
}

/** The desktop app reports the lock screen and sleep; a browser has no such signal. */
export function setSystemIdle (idle: boolean): void {
  state.systemIdle = idle
  if (!idle) state.lastInput = Date.now()
  publish()
}

const inputEvents: Array<keyof WindowEventMap> = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']

/** Watches the window; returns the function that stops watching. */
export function startActivityTracking (): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  state.lastInput = Date.now()
  state.hiddenSince = document.hidden ? Date.now() : undefined
  state.systemIdle = false
  for (const event of inputEvents) window.addEventListener(event, noteInput, { passive: true })
  document.addEventListener('visibilitychange', noteVisibility)
  const timer = setInterval(publish, CHECK_EVERY_MS)
  publish()
  return () => {
    for (const event of inputEvents) window.removeEventListener(event, noteInput)
    document.removeEventListener('visibilitychange', noteVisibility)
    clearInterval(timer)
  }
}
