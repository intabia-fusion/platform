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

import type { Blob, Ref } from '@hcengineering/core'
import { getFileUrl } from '@hcengineering/presentation'

const durations = new Map<string, Promise<number | undefined>>()

/** The length of a transcoded video, summed from the segments of its playlist: for versions saved without one. */
export async function videoDuration (master: Ref<Blob>): Promise<number | undefined> {
  const known = durations.get(master)
  if (known != null) return await known
  const result = readDuration(master).catch(() => undefined)
  durations.set(master, result)
  const value = await result
  // Not kept: a network blip or a transcoding in progress would hide the length until a reload.
  if (value == null) durations.delete(master)
  return value
}

async function readDuration (master: Ref<Blob>): Promise<number | undefined> {
  // Any quality will do: they are cut from the same source.
  const variant = (await readText(master))
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'))
  const name = variant?.split('/').pop()
  if (name == null || name === '') return undefined
  const playlist = await readText(name as Ref<Blob>)
  // Without the end mark the playlist is still being written and its sum is short.
  if (playlist?.includes('#EXT-X-ENDLIST') !== true) return undefined
  let total = 0
  for (const [, seconds] of playlist.matchAll(/#EXTINF:([\d.]+)/g)) total += Number(seconds)
  return total > 0 ? total : undefined
}

async function readText (blob: Ref<Blob>): Promise<string | undefined> {
  const response = await fetch(getFileUrl(blob, ''))
  return response.ok ? await response.text() : undefined
}
