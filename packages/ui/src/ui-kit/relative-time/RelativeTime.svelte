<!--
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
-->
<script lang="ts">
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import { ticker } from '../../index'
  import ui from '../../plugin'
  import { tooltip } from '../../tooltips'
  import { DAY, HOUR, MINUTE, MONTH, YEAR } from '../../types'
  import type { RelativeTimeEvents, RelativeTimeFormat, RelativeTimeProps } from './types'

  type $$Props = RelativeTimeProps
  type $$Events = RelativeTimeEvents

  export let value: number | null | undefined = undefined
  export let format: RelativeTimeFormat = 'ago'
  export let exact: boolean = false

  interface Part {
    label: IntlString
    params: Record<string, number>
  }

  const dispatch = createEventDispatcher<{ timeout: null }>()

  let now = Date.now()
  let timer: ReturnType<typeof setInterval> | undefined
  let unsubscribe: (() => void) | undefined
  let text = ''

  $: has = isValid(value, format)
  $: restart(format, value)
  $: lang = $languageStore === '' ? undefined : $languageStore
  $: void render(has ? describe(format, value as number, now, exact) : [], lang)
  $: datetime = has && format !== 'offset' ? new Date(value as number).toISOString() : undefined
  $: hint =
    format === 'ago' && has
      ? {
          label: ui.string.TimeTooltip,
          props: {
            value: new Date(value as number).toLocaleString(lang ?? 'default', {
              minute: '2-digit',
              hour: 'numeric',
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })
          }
        }
      : undefined

  // An offset is any number of milliseconds, a timestamp must make a date.
  function isValid (value: number | null | undefined, format: RelativeTimeFormat): value is number {
    if (value === null || value === undefined || !Number.isFinite(value)) return false
    return format === 'offset' || !Number.isNaN(new Date(value).getTime())
  }

  function stop (): void {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    unsubscribe?.()
    unsubscribe = undefined
  }

  // Only a live value ticks: «5 minutes ago» shares the ten-second ticker, the countdown needs every second.
  function restart (format: RelativeTimeFormat, value: number | null | undefined): void {
    stop()
    now = Date.now()
    if (format === 'offset' || !isValid(value, format)) return
    if (format === 'ago') {
      unsubscribe = ticker.subscribe(() => {
        now = Date.now()
      })
      return
    }
    // The first check is a tick later: a value already over still reports to a listener added after mount.
    const deadline = value
    timer = setInterval(() => {
      now = Date.now()
      if (deadline <= now) {
        stop()
        dispatch('timeout', null)
      }
    }, 1000)
  }

  function monthsBetween (from: number, to: number): number {
    const start = new Date(from)
    const end = new Date(to)
    return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
  }

  function pad (n: number): string {
    return n.toString().padStart(2, '0')
  }

  // A part is a translated string, a plain string is shown as is.
  function describe (format: RelativeTimeFormat, value: number, now: number, exact: boolean): Array<Part | string> {
    if (format === 'ago') {
      const passed = Math.max(0, now - value)
      if (passed < HOUR) return [{ label: ui.string.MinutesAgo, params: { minutes: Math.floor(passed / MINUTE) } }]
      if (passed < DAY) return [{ label: ui.string.HoursAgo, params: { hours: Math.floor(passed / HOUR) } }]
      if (passed < MONTH) return [{ label: ui.string.DaysAgo, params: { days: Math.floor(passed / DAY) } }]
      if (passed < YEAR) return [{ label: ui.string.MonthsAgo, params: { months: monthsBetween(value, now) } }]
      return [{ label: ui.string.YearsAgo, params: { years: Math.floor(passed / YEAR) } }]
    }
    if (format === 'countdown') {
      const left = Math.max(0, value - now)
      if (left === 0) return []
      if (left >= DAY) return [{ label: ui.string.Days, params: { days: Math.floor(left / DAY) } }]
      const seconds = Math.floor(left / 1000)
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      const s = seconds % 60
      return [h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`]
    }
    const abs = Math.abs(value)
    if (value > 0 && exact) {
      const d = Math.floor(abs / DAY)
      const h = Math.floor((abs - d * DAY) / HOUR)
      const m = Math.floor((abs - d * DAY - h * HOUR) / MINUTE)
      const parts: Part[] = []
      if (d > 0) parts.push({ label: ui.string.DaysShort, params: { value: d } })
      if (h > 0) parts.push({ label: ui.string.HoursShort, params: { value: h } })
      if (m > 0) parts.push({ label: ui.string.MinutesShort, params: { value: m } })
      return parts
    }
    const after = value > 0
    if (abs < HOUR) {
      return [
        {
          label: after ? ui.string.MinutesAfter : ui.string.MinutesBefore,
          params: { minutes: Math.floor(abs / MINUTE) }
        }
      ]
    }
    if (abs < DAY) {
      return [
        { label: after ? ui.string.HoursAfter : ui.string.HoursBefore, params: { hours: Math.floor(abs / HOUR) } }
      ]
    }
    return [{ label: after ? ui.string.DaysAfter : ui.string.DaysBefore, params: { days: Math.floor(abs / DAY) } }]
  }

  // Translations arrive one by one; the text changes once all parts are there.
  let generation = 0
  async function render (parts: Array<Part | string>, lang: string | undefined): Promise<void> {
    const current = ++generation
    const result = await Promise.all(
      parts.map(
        async (part) =>
          await new Promise<string>((resolve) => {
            if (typeof part === 'string') {
              resolve(part)
            } else {
              translateCB(part.label, part.params, lang, resolve)
            }
          })
      )
    )
    if (current === generation) text = result.join(' ')
  }

  onDestroy(stop)
</script>

{#if has}
  {#if format === 'offset'}
    <span class="relative-time">{text}</span>
  {:else if format === 'countdown'}
    <time class="relative-time" role="timer" {datetime}>{text}</time>
  {:else}
    <time class="relative-time" {datetime} use:tooltip={hint}>{text}</time>
  {/if}
{/if}

<style lang="scss">
  // Text of the line: the font and color come from the place.
  .relative-time {
    white-space: nowrap;
  }
</style>
