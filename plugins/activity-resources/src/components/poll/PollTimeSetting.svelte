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
  import { createEventDispatcher, onDestroy } from 'svelte'
  import { DateRangeMode, generateId, type Timestamp } from '@hcengineering/core'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import {
    getCurrentLocale,
    getFormattedDate,
    showPopup,
    type IconComponent,
    type PopupResult
  } from '@hcengineering/ui'
  import {
    DatePicker,
    Menu,
    SelectButton,
    SettingRow,
    Toggle,
    type DatePickerResult,
    type MenuItem
  } from '@hcengineering/ui/kit'

  import activity from '../../plugin'
  import { HOUR_MS, POLL_TIME_PRESETS } from '../../pollTime'

  export let icon: IconComponent
  export let color: string
  export let label: IntlString
  export let description: IntlString | undefined = undefined
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
  const buttonId = `poll-time-${generateId()}`
  let popup: PopupResult | undefined

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

  function getItems (): Array<MenuItem<number | string>> {
    return [
      ...POLL_TIME_PRESETS.map((it) => ({ id: it, label: getEmbeddedLabel(formatSpan(it)) })),
      {
        id: CUSTOM,
        label: activity.string.CustomTime,
        submenuOnly: true,
        popup: {
          component: DatePicker,
          props: { value: at ?? resolved ?? Date.now() + defaultSpan, mode: DateRangeMode.DATETIME, label: dateLabel }
        }
      }
    ]
  }

  function toggle (): void {
    dispatch('change', enabled ? {} : { span: defaultSpan })
  }

  function openMenu (): void {
    if (popup != null || button == null) return
    popup = showPopup(
      Menu,
      {
        items: getItems(),
        selected: at != null ? CUSTOM : span,
        // The root menu takes the result of its date submenu itself: the popup host passes only `close` on.
        onResult: (_: number | string, result: DatePickerResult | null | undefined, close: boolean) => {
          // Null is a cleared date: the setting keeps what it had, the toggle turns it off.
          if (typeof result?.value === 'number') dispatch('change', { at: result.value })
          if (!close) return
          // `close()` skips the close callback: the button must know the menu is gone.
          popup?.close()
          popup = undefined
        }
      },
      button,
      (id: number | string | null | undefined) => {
        popup = undefined
        if (typeof id === 'number') dispatch('change', { span: id })
      }
    )
  }

  onDestroy(() => {
    popup?.close()
  })
</script>

<SettingRow variant="list" {icon} {color} {label} {description} let:labelId let:descriptionId let:controlId>
  {#if enabled}
    <!-- The value alone says nothing: the title of the setting names the button too. -->
    <SelectButton
      bind:element={button}
      id={buttonId}
      kind="ghost"
      size="small"
      label={getEmbeddedLabel(title)}
      pressed={popup != null}
      aria-labelledby="{labelId} {buttonId}"
      on:click={openMenu}
    />
  {/if}
  <Toggle
    id={controlId}
    kind="primary"
    checked={enabled}
    aria-labelledby={labelId}
    aria-describedby={descriptionId}
    on:change={toggle}
  />
</SettingRow>
