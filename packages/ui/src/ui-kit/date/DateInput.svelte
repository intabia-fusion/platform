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
  import { DateRangeMode } from '@hcengineering/core'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'

  import { daysInMonth, fromCurrentToTz, fromTzToCurrent } from '../../components/calendar/internal/DateUtils'
  import IconClose from '../../components/icons/Close.svelte'
  import ui from '../../plugin'
  import IconButton from '../button/IconButton.svelte'
  import type { DateInputEvents, DateInputKind, DateInputPart, DateInputProps, DateInputSize } from './types'

  type $$Props = DateInputProps
  type $$Events = DateInputEvents

  export let value: number | null | undefined = undefined
  export let mode: DateRangeMode | undefined = undefined
  export let kind: DateInputKind | undefined = undefined
  export let size: DateInputSize | undefined = undefined
  export let clearable: boolean = false
  export let timeZone: string | undefined = undefined
  export let disabled: boolean = false

  type Parts = Record<DateInputPart, number | null>

  const dispatch = createEventDispatcher<{ change: number | null, submit: number | null }>()

  const placeholders: Record<DateInputPart, IntlString> = {
    day: ui.string.DD,
    month: ui.string.MM,
    year: ui.string.YYYY,
    hour: ui.string.HH,
    minute: ui.string.MM
  }
  const lengths: Record<DateInputPart, number> = { day: 2, month: 2, year: 4, hour: 2, minute: 2 }
  const minimums: Record<DateInputPart, number> = { day: 1, month: 1, year: 1970, hour: 0, minute: 0 }

  let parts: Parts = split(undefined)
  // The day of the value: the parts that are not shown keep it.
  let base: Date = new Date()
  let synced: number | null | undefined | false = false
  let syncedZone: string | undefined
  let typed = 0
  const elements: Partial<Record<DateInputPart, HTMLElement>> = {}
  let names: Partial<Record<DateInputPart, string>> = {}

  $: resolvedMode = mode ?? DateRangeMode.DATE
  $: resolvedKind = kind ?? 'secondary'
  $: resolvedSize = size ?? 'small'
  $: shown = partsOf(resolvedMode)
  $: sync(value, timeZone)
  $: translateNames($languageStore)
  $: complete = shown.every((part) => parts[part] !== null)

  function partsOf (mode: DateRangeMode): DateInputPart[] {
    if (mode === DateRangeMode.TIME || mode === DateRangeMode.TIMEONLY) return ['hour', 'minute']
    if (mode === DateRangeMode.DATETIME) return ['day', 'month', 'year', 'hour', 'minute']
    return ['day', 'month', 'year']
  }

  function zoned (ts: number): Date {
    return timeZone !== undefined ? fromCurrentToTz(ts, timeZone) : new Date(ts)
  }

  function split (ts: number | null | undefined): Parts {
    if (ts === null || ts === undefined || Number.isNaN(ts)) {
      return { day: null, month: null, year: null, hour: null, minute: null }
    }
    const date = zoned(ts)
    return {
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      hour: date.getHours(),
      minute: date.getMinutes()
    }
  }

  // A value set by the place replaces the parts; the one this field reported is left as typed.
  function sync (v: number | null | undefined, tz: string | undefined): void {
    if (v === synced && tz === syncedZone) return
    synced = v
    syncedZone = tz
    parts = split(v)
    if (v !== null && v !== undefined && !Number.isNaN(v)) base = zoned(v)
  }

  function translateNames (lang: string): void {
    for (const part of Object.keys(placeholders) as DateInputPart[]) {
      translateCB(placeholders[part], {}, lang === '' ? undefined : lang, (res) => {
        names = { ...names, [part]: res }
      })
    }
  }

  // `current` is a parameter, so the template re-evaluates the maximum when a part changes.
  function maximum (part: DateInputPart, current: Parts): number {
    switch (part) {
      case 'day':
        return current.month !== null && current.year !== null
          ? daysInMonth(new Date(current.year, current.month - 1, 1))
          : 31
      case 'month':
        return 12
      case 'year':
        return 3000
      case 'hour':
        return 23
      case 'minute':
        return 59
    }
  }

  function compose (): number | null {
    if (!complete) return null
    const get = (part: DateInputPart, fallback: number): number =>
      shown.includes(part) ? (parts[part] ?? fallback) : fallback
    const year = get('year', base.getFullYear())
    const month = get('month', base.getMonth() + 1)
    if (year < minimums.year || year > 3000 || month < 1 || month > 12) return null
    const last = daysInMonth(new Date(year, month - 1, 1))
    const date = new Date(
      year,
      month - 1,
      Math.min(get('day', base.getDate()), last),
      get('hour', base.getHours()),
      get('minute', base.getMinutes())
    )
    return (timeZone !== undefined ? fromTzToCurrent(date, timeZone) : date).getTime()
  }

  function report (next: number | null): void {
    if (next === value) return
    value = next
    synced = next
    if (next !== null) base = zoned(next)
    dispatch('change', next)
  }

  function commit (): void {
    // An incomplete value is not reported: only clearing a part reports `null`.
    const next = compose()
    if (next !== null) report(next)
  }

  function focusPart (part: DateInputPart | undefined): void {
    if (part !== undefined) elements[part]?.focus()
  }

  export function focus (part?: DateInputPart): void {
    focusPart(part !== undefined && shown.includes(part) ? part : shown[0])
  }

  function handleKeydown (event: KeyboardEvent, part: DateInputPart): void {
    if (disabled) return
    const index = shown.indexOf(part)
    if (event.key >= '0' && event.key <= '9' && event.key.length === 1) {
      event.preventDefault()
      const digit = Number(event.key)
      const max = maximum(part, parts)
      let next = typed === 0 ? digit : (parts[part] ?? 0) * 10 + digit
      if (part !== 'year' && next > max) next = typed === 0 ? digit : max
      parts = { ...parts, [part]: next }
      typed++
      const done = typed >= lengths[part] || (part !== 'year' && next * 10 > max)
      if (done) {
        finish(part)
        focusPart(shown[index + 1])
      }
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      typed = 0
      parts = { ...parts, [part]: null }
      if (value !== null && value !== undefined) report(null)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      typed = 0
      const min = minimums[part]
      const max = maximum(part, parts)
      const current = parts[part]
      const step = event.key === 'ArrowUp' ? 1 : -1
      // Wraps inside the part: 59 minutes and up is 00, the hour stays.
      const next =
        current === null ? (step > 0 ? min : max) : ((current - min + step + (max - min + 1)) % (max - min + 1)) + min
      parts = { ...parts, [part]: next }
      commit()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusPart(shown[index + (event.key === 'ArrowLeft' ? -1 : 1)])
    } else if (event.key === 'Enter') {
      if (typed > 0) finish(part)
      dispatch('submit', value ?? null)
    }
  }

  // Day or month 0 would roll the date back a month: raised to the minimum; a half-typed year stays incomplete.
  function finish (part: DateInputPart): void {
    const whole = typed >= lengths[part]
    typed = 0
    const current = parts[part]
    if (current !== null && current < minimums[part] && (part !== 'year' || whole)) {
      parts = { ...parts, [part]: minimums[part] }
    }
    commit()
  }

  function handleBlur (part: DateInputPart): void {
    if (typed > 0) finish(part)
  }

  function text (part: DateInputPart, parts: Parts): string | undefined {
    const v = parts[part]
    return v === null ? undefined : String(v).padStart(lengths[part], '0')
  }
</script>

<span
  class="date-input date-input--{resolvedKind} date-input--{resolvedSize}"
  class:date-input--disabled={disabled}
  role="group"
  aria-label={$$props['aria-label']}
>
  <span class="date-input__parts">
    {#each shown as part, i (part)}
      {@const shownText = text(part, parts)}
      {#if i > 0}
        {#if part === 'hour'}
          <span class="date-input__divider" />
        {:else}
          <span class="date-input__separator" aria-hidden="true">{part === 'minute' ? ':' : '.'}</span>
        {/if}
      {/if}
      <span
        bind:this={elements[part]}
        class="date-input__part"
        class:date-input__part--empty={shownText === undefined}
        role="spinbutton"
        tabindex={disabled ? -1 : 0}
        aria-label={names[part]}
        aria-valuemin={minimums[part]}
        aria-valuemax={maximum(part, parts)}
        aria-valuenow={parts[part] ?? undefined}
        aria-valuetext={shownText ?? names[part]}
        aria-disabled={disabled || undefined}
        on:keydown={(event) => {
          handleKeydown(event, part)
        }}
        on:focus={() => {
          typed = 0
        }}
        on:blur={() => {
          handleBlur(part)
        }}
      >
        {shownText ?? names[part] ?? ''}
      </span>
    {/each}
  </span>
  {#if clearable && value !== null && value !== undefined && !disabled}
    <IconButton
      kind="ghost"
      size="min"
      icon={IconClose}
      tooltip={{ label: ui.string.Clear }}
      on:click={() => {
        parts = split(undefined)
        typed = 0
        report(null)
        focus()
      }}
    />
  {/if}
</span>

<style lang="scss">
  .date-input {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-1);
    height: var(--_height);
    padding: 0 var(--_padding);
    border-radius: var(--_radius);
    font-family: var(--font-family);
    font-size: var(--_font);
    font-variant-numeric: tabular-nums;
    color: var(--global-primary-TextColor);

    &--secondary {
      background-color: var(--input-BackgroundColor);
      box-shadow: inset 0 0 0 1px var(--input-BorderColor, transparent);

      &:not(.date-input--disabled):hover {
        background-color: var(--input-hover-BackgroundColor);
      }
    }
    // Digits on the line of the ghost text fields: no padding, the parts' own inset is pulled out.
    &--ghost {
      padding: 0;
      border-radius: var(--extra-small-BorderRadius);

      .date-input__parts {
        margin: 0 calc(-1 * var(--spacing-0_25));
      }
    }
    // The plate grows outward by a shadow, so the digits do not move.
    &--ghost:not(.date-input--disabled):hover,
    &--ghost:not(.date-input--disabled):has(.date-input__part:focus) {
      background-color: var(--button-tertiary-hover-BackgroundColor);
      box-shadow: 0 0 0 var(--spacing-0_5) var(--button-tertiary-hover-BackgroundColor);
    }
    // The ring belongs to the field, on a click as well: the typed part shows which one is active.
    &--secondary:not(.date-input--disabled):has(.date-input__part:focus) {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }

    &__parts {
      display: inline-flex;
      align-items: center;
      min-width: 0;
    }
    &__part {
      padding: 0 var(--spacing-0_25);
      border-radius: var(--extra-small-BorderRadius);
      line-height: var(--_line-height);
      white-space: nowrap;
      outline: none;
      cursor: text;

      &--empty {
        color: var(--global-secondary-TextColor);
      }
      // Brand-filled as in the legacy inputs.
      &:focus {
        color: var(--button-accent-LabelColor);
        background-color: var(--button-brand-BackgroundColor);
      }
    }
    // The parts' own inset is pulled in, so the dot and the colon sit close and the parts read as one date.
    &__separator {
      margin: 0 calc(-1 * var(--spacing-0_25));
      color: var(--global-secondary-TextColor);
    }
    &__divider {
      flex-shrink: 0;
      width: 1px;
      height: 1em;
      margin: 0 var(--spacing-0_75);
      background-color: var(--kit-button-secondary-BorderColor);
    }

    &--disabled {
      color: var(--button-disabled-LabelColor);
      cursor: not-allowed;

      .date-input__separator {
        color: inherit;
      }

      // A click still focuses the part: no active fill on a field that takes no input.
      .date-input__part {
        cursor: not-allowed;

        &:focus {
          color: inherit;
          background-color: transparent;
        }
      }
      &.date-input--secondary {
        background-color: var(--button-disabled-BackgroundColor);
        box-shadow: none;
      }
    }

    // Sizes
    &--large {
      --_height: var(--global-large-Size);
      --_radius: var(--medium-BorderRadius);
      --_padding: var(--spacing-1_75);
      --_font: 0.875rem;
      --_line-height: 1.25rem;
    }
    &--medium {
      --_height: var(--global-medium-Size);
      --_radius: var(--medium-BorderRadius);
      --_padding: var(--spacing-1_25);
      --_font: 0.875rem;
      --_line-height: 1.25rem;
    }
    &--small {
      --_height: var(--global-small-Size);
      --_radius: var(--small-BorderRadius);
      --_padding: var(--spacing-1_25);
      --_font: 0.875rem;
      --_line-height: 1.25rem;
    }
    &--extra-small {
      --_height: var(--global-extra-small-Size);
      --_radius: var(--extra-small-BorderRadius);
      --_padding: var(--spacing-0_75);
      --_font: 0.75rem;
      --_line-height: 1rem;
    }
  }
</style>
