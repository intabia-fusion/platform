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

import type { WaveformData } from './types'

export const WAVEFORM_BARS = 48
// Decoding reads the whole file: worth it for a voice note, not for an album track.
export const MAX_WAVEFORM_BYTES = 4 * 1024 * 1024
// A long low-bitrate file fits the byte cap but decodes to hundreds of megabytes of samples.
export const MAX_WAVEFORM_SECONDS = 10 * 60
const MAX_PARALLEL = 2
const DECODE_RATE = 22050

interface Entry {
  result: Promise<WaveformData | undefined>
  /** Whether anyone still shows this recording; a player gone from the page is skipped in the queue. */
  wanted: Array<() => boolean>
  started: boolean
}

class Skipped extends Error {}

// By the recording and its address: one handed a new address loads that one.
const cache = new Map<string, Entry>()
const queue: Array<() => void> = []
let running = 0

async function slot<T> (task: () => Promise<T>): Promise<T> {
  if (running < MAX_PARALLEL) running++
  else await new Promise<void>((resolve) => queue.push(resolve))
  try {
    return await task()
  } finally {
    // Handed straight to the next in line: a call landing in between cannot take it too.
    const next = queue.shift()
    if (next != null) next()
    else running--
  }
}

export function computePeaks (data: Float32Array, count: number): number[] {
  const seg = Math.max(1, Math.floor(data.length / count))
  const out: number[] = []
  let max = 0
  for (let i = 0; i < count; i++) {
    let sum = 0
    const start = i * seg
    const end = Math.min(start + seg, data.length)
    for (let j = start; j < end; j++) sum += data[j] * data[j]
    const value = end > start ? Math.sqrt(sum / (end - start)) : 0
    out.push(value)
    if (value > max) max = value
  }
  return out.map((v) => (max > 0 ? Math.max(0.1, v / max) : 0.1))
}

async function decode (src: string): Promise<WaveformData | undefined> {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`failed to fetch recording: ${response.status}`)
  const buffer = await response.arrayBuffer()
  // Offline: no output device to open, and a low rate keeps the decoded samples small.
  const context = new OfflineAudioContext(1, 1, DECODE_RATE)
  let audio: AudioBuffer
  try {
    audio = await context.decodeAudioData(buffer)
  } catch {
    // A format the browser cannot decode stays without a wave: asking again would download it again.
    return undefined
  }
  return { peaks: computePeaks(audio.getChannelData(0), WAVEFORM_BARS), duration: audio.duration }
}

export async function loadWaveform (
  id: string,
  src: string,
  wanted: () => boolean = () => true
): Promise<WaveformData | undefined> {
  const key = `${id} ${src}`
  const known = cache.get(key)
  if (known != null) {
    // Once the decode has started nobody asks again: a kept callback would hold its unmounted player.
    if (!known.started) known.wanted.push(wanted)
    return await known.result
  }
  const entry: Entry = { result: Promise.resolve(undefined), wanted: [wanted], started: false }
  entry.result = slot(async () => {
    const shown = entry.wanted.some((it) => it())
    entry.started = true
    entry.wanted = []
    if (!shown) throw new Skipped()
    return await decode(src)
  }).catch((err) => {
    if (!(err instanceof Skipped)) console.warn('failed to decode recording', err)
    // Not kept: a network blip would hide the wave until a reload.
    cache.delete(key)
    return undefined
  })
  cache.set(key, entry)
  return await entry.result
}
