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
  Next occurrence: the schedule lives on the series, the interval on the meeting.
-->
<script lang="ts">
  import calendar, { type Event } from '@hcengineering/calendar'
  import { DateRangeMode } from '@hcengineering/core'
  import love, { type MeetingEventLink, type PermanentMeeting } from '@hcengineering/love'
  import { createQuery } from '@hcengineering/presentation'
  import { formatDateValue } from '@hcengineering/ui/kit'

  import { nextOccurrence } from '../period'

  export let value: PermanentMeeting

  // No occurrences: a copy of the series answers with its own date.
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

  $: start = series.reduce<number | undefined>(
    (acc, it) => (acc === undefined || it.date < acc ? it.date : acc),
    undefined
  )
  $: next =
    start === undefined || value.repeatEvery === undefined || value.repeatEvery <= 0
      ? undefined
      : nextOccurrence(start, value.repeatEvery, Date.now())
  $: label = next === undefined ? '' : formatDateValue(next, DateRangeMode.DATETIME)
</script>

<span class="text-sm content-dark-color">{label}</span>
