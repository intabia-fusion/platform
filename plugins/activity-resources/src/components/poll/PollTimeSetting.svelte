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
  import { createEventDispatcher } from 'svelte'
  import type { Timestamp } from '@hcengineering/core'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import {
    DatePopup,
    getCurrentLocale,
    getFormattedDate,
    IconDropdown,
    ModernButton,
    ModernPopup,
    ModernToggle,
    showPopup,
    type DropdownIntlItem
  } from '@hcengineering/ui'

  import activity from '../../plugin'
  import { HOUR_MS, POLL_TIME_PRESETS } from '../../pollTime'

  export let label: IntlString
  export let dateLabel: IntlString
  // A preset: a delay from the sending, or a duration from the start.
  export let span: number | undefined
  export let at: Timestamp | undefined
  // The date picker opens on it.
  export let resolved: Timestamp | undefined
  // A delay reads "in 3 hours", a duration "3 hours".
  export let kind: 'delay' | 'duration'
  export let defaultSpan: number

  const dispatch = createEventDispatcher<{ change: { span?: number, at?: Timestamp } }>()
  const CUSTOM = 'custom'

  let button: HTMLButtonElement | undefined
  let opened = false

  $: enabled = span != null || at != null
  $: title = at != null ? formatAt(at) : span != null ? formatSpan(span) : ''

  function formatSpan (ms: number): string {
    const hours = Math.round(ms / HOUR_MS)
    return kind === 'delay'
      ? new Intl.RelativeTimeFormat(getCurrentLocale(), { numeric: 'always' }).format(hours, 'hour')
      : new Intl.NumberFormat(getCurrentLocale(), { style: 'unit', unit: 'hour', unitDisplay: 'long' }).format(hours)
  }

  function formatAt (time: Timestamp): string {
    return getFormattedDate(time, { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })
  }

  function getItems (): DropdownIntlItem[] {
    return [
      ...POLL_TIME_PRESETS.map((it) => ({ id: it, label: getEmbeddedLabel(formatSpan(it)) })),
      { id: CUSTOM, label: activity.string.CustomTime }
    ]
  }

  function toggle (): void {
    dispatch('change', enabled ? {} : { span: defaultSpan })
  }

  function openMenu (): void {
    if (opened || button === undefined) return
    opened = true
    showPopup(ModernPopup, { items: getItems(), selected: at != null ? CUSTOM : span }, button, (result) => {
      opened = false
      if (result === CUSTOM) {
        pickExactTime()
      } else if (typeof result === 'number') {
        dispatch('change', { span: result })
      }
    })
  }

  function pickExactTime (): void {
    const currentDate = new Date(at ?? resolved ?? Date.now() + defaultSpan)
    showPopup(DatePopup, { currentDate, withTime: true, label: dateLabel }, 'top', undefined, (result) => {
      // Null is a cleared date: the setting keeps what it had, the toggle turns it off.
      if (result instanceof Date) {
        dispatch('change', { at: result.getTime() })
      }
    })
  }
</script>

<div class="time-setting">
  <ModernToggle {label} size="large" checked={enabled} on:change={toggle} />
  {#if enabled}
    <ModernButton bind:element={button} kind="secondary" size="small" pressed={opened} on:click={openMenu}>
      <span class="overflow-label">{title}</span>
      <IconDropdown size="small" fill="var(--theme-dark-color)" />
    </ModernButton>
  {/if}
</div>

<style lang="scss">
  .time-setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-width: 0;
    // The row keeps its height when the button shows up.
    min-height: 2rem;
  }
</style>
