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
  The column a permanent meeting cannot compute on its own: when it happens next. The schedule lives
  on the series of the meeting (`MeetingEventLink.permanentMeeting`) and the interval on the meeting
  itself, so the presenter reads both and formats the result like any other date column.
-->
<script lang="ts">
  import calendar, { type Event } from '@hcengineering/calendar'
  import { DateRangeMode } from '@hcengineering/core'
  import love, { type MeetingEventLink, type PermanentMeeting } from '@hcengineering/love'
  import { createQuery } from '@hcengineering/presentation'
  import { formatDateValue } from '@hcengineering/ui/kit'

  import { nextOccurrence } from '../period'

  export let value: PermanentMeeting

  // Occurrences are skipped: a copy of the series carries a copy of the mixin and would answer with
  // its own date instead of the series' one.
  let series: Event[] = []

  const query = createQuery()
  $: void query.query(
    calendar.class.Event,
    {
      [`${love.mixin.MeetingEventLink as string}.permanentMeeting`]: value._id,
      recurringEventId: { $exists: false }
    } as any,
    (res) => {
      series = res
    }
  )

  $: start = series[0]?.date
  $: next =
    start === undefined || value.repeatEvery === undefined || value.repeatEvery <= 0
      ? undefined
      : nextOccurrence(start, value.repeatEvery, Date.now())
</script>

{#if next !== undefined}
  <span class="text-sm content-dark-color">{formatDateValue(next, DateRangeMode.DATETIME)}</span>
{/if}
