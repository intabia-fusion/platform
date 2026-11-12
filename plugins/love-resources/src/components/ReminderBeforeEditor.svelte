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
  `reminderBefore` is a lead time in milliseconds, which reads as nothing: `900000` instead of
  "15 minutes". The attribute panel shows this dropdown, so the value reads in minutes, hours or days
  and is picked in the same units. The model keeps milliseconds - the reminder itself is computed
  from a timestamp difference.
-->
<script lang="ts">
  import type { Doc } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import ui, { DropdownLabelsIntl, type DropdownIntlItem } from '@hcengineering/ui'

  export let value: number | undefined = undefined
  // An attribute editor is handed the document and no callback: it writes itself. A caller in a
  // custom header passes `onChange` instead, and then the caller owns the write.
  export let onChange: ((value: number) => void) | undefined = undefined
  export let object: Doc | undefined = undefined
  export let readonly: boolean = false

  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR

  type Unit = 'minutes' | 'hours' | 'days'

  /** A lead time as a number and the unit that says it with the smallest number. */
  function split (msec: number): { unit: Unit, count: number } {
    if (msec < HOUR) return { unit: 'minutes', count: Math.max(1, Math.round(msec / MINUTE)) }
    if (msec < DAY) return { unit: 'hours', count: Math.round(msec / HOUR) }
    return { unit: 'days', count: Math.round(msec / DAY) }
  }

  function item (msec: number): DropdownIntlItem<number> {
    const { unit, count } = split(msec)
    const labels = {
      minutes: ui.string.Minutes,
      hours: ui.string.Hours,
      days: ui.string.Days
    }
    return { id: msec, label: labels[unit], params: { [unit]: count } }
  }

  // The usual lead times: a reminder is picked, not invented, so the list is short and readable.
  const PRESETS = [5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR, DAY]

  let items: Array<DropdownIntlItem<number>> = []

  $: {
    const known = new Set(PRESETS)
    // A document may carry a lead time that is not in the list: it still has to read as itself, or
    // the dropdown would show nothing while the reminder is set.
    items = PRESETS.map(item)
    if (value !== undefined && value > 0 && !known.has(value)) items = [...items, item(value)]
  }

  function commit (msec: number): void {
    if (onChange !== undefined) {
      onChange(msec)
      return
    }
    if (object !== undefined) {
      void getClient().diffUpdate(object, { reminderBefore: msec } as any)
    }
  }
</script>

<div class="flex-row-center" data-id="reminder-before-editor">
  <DropdownLabelsIntl
    {items}
    selected={value}
    size="medium"
    disabled={readonly}
    on:selected={(ev) => {
      commit(Number(ev.detail))
    }}
  />
</div>
