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
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import ui from '../../plugin'
  import { showPopup, type PopupResult } from '../../popups'
  import type { IconComponent, IconSize, LabelAndProps } from '../../types'
  import DatePicker from './DatePicker.svelte'
  import SelectButton from '../select-button/SelectButton.svelte'
  import { getDueState } from './due'
  import DateValue from './DateValue.svelte'
  import type { DatePickerResult, DateSelectEvents, DateSelectProps, DateTone } from './types'

  type $$Props = DateSelectProps
  type $$Events = DateSelectEvents

  export let value: number | null | undefined = undefined
  export let mode: DateRangeMode | undefined = undefined
  export let placeholder: IntlString | undefined = undefined
  export let icon: IconComponent | undefined = undefined
  export let iconSize: IconSize | undefined = undefined
  export let tone: DateTone | undefined = undefined
  export let due: boolean = false
  export let ignoreOverdue: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined
  export let popupLabel: IntlString | undefined = undefined
  export let popupDetail: IntlString | undefined = undefined
  export let shifts: boolean = true
  export let readonly: boolean = false
  export let disabled: boolean = false
  export let element: HTMLButtonElement | undefined = undefined

  export function focus (): void {
    element?.focus()
  }

  const dispatch = createEventDispatcher<{ change: number | null }>()

  let opened = false
  let popup: PopupResult | undefined

  $: resolvedMode = mode ?? DateRangeMode.DATE
  $: resolvedPlaceholder = placeholder ?? ui.string.NoDate
  $: empty = value === null || value === undefined
  $: dueState = due ? getDueState(value, ignoreOverdue) : undefined
  $: shownTone = tone ?? dueState?.tone
  $: label = popupLabel ?? (due ? (empty ? ui.string.AddDueDate : ui.string.EditDueDate) : undefined)

  function open (e: MouseEvent): void {
    if (readonly || disabled || opened) return
    // The date sits in rows and cards that open on click.
    e.stopPropagation()
    e.preventDefault()
    opened = true
    popup = showPopup(
      DatePicker,
      {
        value: value ?? null,
        mode: resolvedMode,
        shifts,
        // Left out while unset: the picker picks its own title; a due date keeps the add / edit one.
        ...(label !== undefined ? { label } : {}),
        ...(popupDetail !== undefined ? { detail: popupDetail } : {})
      },
      'top',
      (result: DatePickerResult | null | undefined) => {
        opened = false
        popup = undefined
        if (result === null || result === undefined) return
        value = result.value
        dispatch('change', value)
      }
    )
  }

  // A row removed with the date in it must not leave the picker hanging.
  onDestroy(() => {
    popup?.close()
  })
</script>

<span class="date-select date-select--{shownTone ?? 'normal'}" class:date-select--readonly={readonly}>
  <SelectButton
    bind:element
    {...$$restProps}
    {empty}
    field
    placeholder={resolvedPlaceholder}
    icon={icon ?? (shownTone === 'overdue' ? ui.icon.CalendarX : ui.icon.Calendar)}
    {iconSize}
    tooltip={tooltip ?? dueState?.tooltip}
    {disabled}
    pressed={opened}
    aria-haspopup={readonly ? undefined : 'dialog'}
    aria-expanded={readonly ? undefined : opened}
    aria-disabled={readonly && !disabled ? 'true' : undefined}
    on:click={open}
  >
    {#if value !== null && value !== undefined}<DateValue {value} mode={resolvedMode} />{/if}
  </SelectButton>
</span>

<style lang="scss">
  // No box of its own: the button stays the grid item of the place, as with `fullWidth`.
  // A date is a value of a form, so its button takes the field fill (`field`), as DateInput.
  .date-select {
    display: contents;
  }
  .date-select--warning :global(.select-button__icon) {
    color: var(--theme-warning-color);
  }
  .date-select--critical :global(.select-button__icon),
  .date-select--overdue :global(.select-button__icon) {
    color: var(--global-error-TextColor);
  }
  // Nothing to open: no hover and no pressed look.
  .date-select--readonly :global(.button) {
    pointer-events: none;
  }
</style>
