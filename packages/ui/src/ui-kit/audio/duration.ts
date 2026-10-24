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

// By the recording and its address: one handed a new address asks again.
const durations = new Map<string, Promise<number | undefined>>()
// A header that never comes must not hold the length back for good.
const HEADER_TIMEOUT_MS = 15_000

/** Reads only the header: for a file the wave is not decoded for, or failed on. */
export async function loadDuration (id: string, src: string): Promise<number | undefined> {
  const key = `${id} ${src}`
  const known = durations.get(key)
  if (known != null) return await known
  const result = new Promise<number | undefined>((resolve) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    const done = (value: number | undefined): void => {
      clearTimeout(timer)
      audio.onloadedmetadata = null
      audio.onerror = null
      audio.removeAttribute('src')
      audio.load()
      resolve(value)
    }
    const timer = setTimeout(() => {
      done(undefined)
    }, HEADER_TIMEOUT_MS)
    // A recorded webm has no length in its header and reports Infinity.
    audio.onloadedmetadata = () => {
      done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined)
    }
    audio.onerror = () => {
      done(undefined)
    }
    audio.src = src
  })
  durations.set(key, result)
  const value = await result
  // Not kept: a network blip would hide the length until a reload.
  if (value == null) durations.delete(key)
  return value
}
