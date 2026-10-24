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

import type { Readable } from 'svelte/store'

export interface PlaybackState {
  id?: string
  playing: boolean
  time: number
  /** 0 while unknown: a webm recording reports no duration until it has been played through. */
  duration: number
  /** One speed for every recording: the next one plays as fast as the last. */
  rate: number
}

export interface Playback extends Readable<PlaybackState> {
  toggle: (id: string, src: string, knownDuration?: number) => void
  seek: (fraction: number) => void
  stop: () => void
  /** A card shows the recording until the returned release; the playing one stops once none does. */
  show: (id: string) => () => void
  cycleRate: () => void
  /** Where a recording was left when another one started; it resumes from there. */
  position: (id: string) => SavedPosition | undefined
}

export interface SavedPosition {
  time: number
  duration: number
}

/** The player as one recording sees it; a recording left halfway keeps its time while inactive. */
export interface PlayerState {
  active: boolean
  playing: boolean
  time: number
  duration: number
}

export interface WaveformData {
  peaks: number[]
  duration: number
}
