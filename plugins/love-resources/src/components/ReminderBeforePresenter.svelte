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
  `reminderBefore` is a lead time in milliseconds, because that is what the reminder is computed
  from. A bare 900000 in the attribute panel says nothing, so it reads as "15 minutes", "2 hours" or
  "1 day" - the unit that says it with the smallest number. The wording itself comes from the
  calendar, which already names these units in every locale.
-->
<script lang="ts">
  import calendar from '@hcengineering/calendar'
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'

  export let value: number | undefined = undefined

  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR

  let label: IntlString = calendar.string.DueMinutes
  let params: Record<string, number> = { minutes: 0 }

  $: if (value === undefined || value <= 0) {
    label = calendar.string.DueMinutes
    params = { minutes: 0 }
  } else if (value < HOUR) {
    label = calendar.string.DueMinutes
    params = { minutes: Math.round(value / MINUTE) }
  } else if (value < DAY) {
    label = calendar.string.DueHours
    params = { hours: Math.round(value / HOUR) }
  } else {
    label = calendar.string.Day
    params = { count: Math.round(value / DAY) }
  }
</script>

<span class="text-sm" data-id="reminder-before-presenter"><Label {label} {params} /></span>
