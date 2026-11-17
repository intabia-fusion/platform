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
  End of the latest session of a permanent meeting.
-->
<script lang="ts">
  import { DateRangeMode } from '@hcengineering/core'
  import love, { type MeetingMinutes, type PermanentMeeting } from '@hcengineering/love'
  import { createQuery } from '@hcengineering/presentation'
  import { formatDateValue } from '@hcengineering/ui/kit'

  export let value: PermanentMeeting

  let sessions: MeetingMinutes[] = []

  const query = createQuery()
  $: void query.query(love.class.MeetingMinutes, { meeting: value._id } as any, (res) => {
    sessions = res
  })

  $: lastEnd = sessions.reduce<number | undefined>((acc, it) => {
    const end = it.meetingEnd ?? it.createdOn
    if (end === undefined) return acc
    return acc === undefined || end > acc ? end : acc
  }, undefined)
</script>

<span class="text-sm content-dark-color">{lastEnd === undefined ? '' : formatDateValue(lastEnd, DateRangeMode.DATETIME)}</span>
