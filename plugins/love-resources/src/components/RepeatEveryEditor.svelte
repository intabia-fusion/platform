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
<!--
  `repeatEvery` is stored in milliseconds, which says nothing in a form. The period reads the way the
  calendar rule editor reads: a number and a unit, "every 2 weeks". Units and their plural forms come
  from the calendar, so the wording matches the recurrence editor next to it.
-->
<script lang="ts">
  import calendar from '@hcengineering/calendar'
  import type { Doc } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { DropdownLabelsIntl, NumberInput, type DropdownIntlItem } from '@hcengineering/ui'

  export let value: number | undefined = undefined
  // The model registers this component as the attribute editor of `repeatEvery`, and an attribute
  // editor is handed the document and no callback: it writes itself. A caller in a custom header
  // passes `onChange` instead, and then the caller owns the write.
  export let onChange: ((value: number) => void) | undefined = undefined
  export let object: Doc | undefined = undefined
  export let readonly: boolean = false

  const DAY = 24 * 60 * 60 * 1000
  const UNITS: Record<string, number> = {
    day: DAY,
    week: 7 * DAY,
    month: 30 * DAY
  }

  const items: DropdownIntlItem[] = [
    { id: 'day', label: calendar.string.Day },
    { id: 'week', label: calendar.string.Week },
    { id: 'month', label: calendar.string.Month }
  ]

  let interval: number = 1
  let unitId: string = 'week'
  // What the inputs were last set from or reported as, so the two directions do not fight: a value
  // arriving from the document must not be echoed straight back as an update.
  let known: number | undefined = undefined

  function split (msec: number): { unit: string, msec: number, count: number } {
    const bySize = Object.entries(UNITS).sort((a, b) => b[1] - a[1])
    for (const [id, size] of bySize) {
      if (msec >= size && msec % size === 0) return { unit: id, msec: size, count: msec / size }
    }
    // Anything shorter than a day keeps the day as the unit: it is the smallest period the form has.
    return { unit: 'day', msec: DAY, count: 1 }
  }

  $: if (value !== undefined && value !== known) {
    const { unit, count } = split(value)
    known = value
    unitId = unit
    interval = count
  }

  function commit (nextInterval: number, nextUnit: string): void {
    const msec = Math.max(1, Math.round(nextInterval)) * UNITS[nextUnit]
    if (msec === known) return
    known = msec
    if (onChange !== undefined) {
      onChange(msec)
      return
    }
    if (object !== undefined) {
      void getClient().diffUpdate(object, { repeatEvery: msec } as any)
    }
  }
</script>

<div class="flex-row-center gap-1" data-id="repeat-every-editor">
  <NumberInput
    bind:value={interval}
    minValue={1}
    maxDigitsAfterPoint={0}
    maxWidth="4rem"
    disabled={readonly}
    on:change={(ev) => {
      // The dispatched value is the one the input ends up with, a bound variable may still be old here.
      interval = ev.detail ?? interval
      commit(interval, unitId)
    }}
  />
  <DropdownLabelsIntl
    bind:selected={unitId}
    {items}
    params={{ count: interval }}
    size="medium"
    disabled={readonly}
    on:selected={(ev) => {
      unitId = String(ev.detail)
      commit(interval, unitId)
    }}
  />
</div>
