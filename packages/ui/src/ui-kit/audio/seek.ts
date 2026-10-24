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

import { translate } from '@hcengineering/platform'
import { themeStore } from '@hcengineering/theme'
import { derived, type Readable } from 'svelte/store'

import ui from '../../plugin'

const STEP_SECONDS = 5
// Without a known length a step is a share of the recording.
const STEP_FRACTION = 0.05

export function seekByKey (key: string, progress: number, duration: number | undefined): number | undefined {
  const step = duration != null && duration > 0 ? STEP_SECONDS / duration : STEP_FRACTION
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return Math.min(progress + step, 1)
    case 'ArrowLeft':
    case 'ArrowDown':
      return Math.max(progress - step, 0)
    case 'Home':
      return 0
    case 'End':
      return 1
    default:
      return undefined
  }
}

/** Handled keys must not scroll the page or open the card. */
function seekKey (e: KeyboardEvent, progress: number, duration: number | undefined): number | undefined {
  const to = seekByKey(e.key, progress, duration)
  if (to == null) return undefined
  e.preventDefault()
  e.stopPropagation()
  return to
}

export function seekAt (e: MouseEvent): number {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
}

const positionLabel: Readable<string> = derived(
  themeStore,
  ($theme, set) => {
    void translate(ui.string.PlaybackPosition, {}, $theme.language).then(set)
  },
  ''
)

export interface SeekableParams {
  progress: number
  duration?: number
  valueText?: string
  onSeek: (to: number) => void
}

/** A slider over the recording: a click or the arrows seek, a screen reader hears where it is. */
export function seekable (
  node: HTMLElement,
  params: SeekableParams
): { update: (params: SeekableParams) => void, destroy: () => void } {
  let current = params
  node.setAttribute('role', 'slider')
  node.tabIndex = 0
  node.setAttribute('aria-valuemin', '0')
  node.setAttribute('aria-valuemax', '100')
  const unsubscribe = positionLabel.subscribe((label) => {
    node.setAttribute('aria-label', label)
  })

  function apply (next: SeekableParams): void {
    current = next
    node.setAttribute('aria-valuenow', `${Math.round(next.progress * 100)}`)
    if (next.valueText != null) node.setAttribute('aria-valuetext', next.valueText)
    else node.removeAttribute('aria-valuetext')
  }

  function click (e: MouseEvent): void {
    e.stopPropagation()
    current.onSeek(seekAt(e))
  }

  function keydown (e: KeyboardEvent): void {
    const to = seekKey(e, current.progress, current.duration)
    if (to != null) current.onSeek(to)
  }

  apply(params)
  node.addEventListener('click', click)
  node.addEventListener('keydown', keydown)
  return {
    update: apply,
    destroy: () => {
      unsubscribe()
      node.removeEventListener('click', click)
      node.removeEventListener('keydown', keydown)
    }
  }
}
