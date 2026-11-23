<!--
// Copyright © 2026 Intabia Fusion.
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
  import calendar from '@hcengineering/calendar'
  import type { Ref, Space } from '@hcengineering/core'
  import type { MeetingGroup, PermanentMeeting } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import { showPopup } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import CreateMeetingDialog from './CreateMeetingDialog.svelte'
  import MeetingLinkReadyPopup from './MeetingLinkReadyPopup.svelte'
  import { getEventMeetingLink } from '../utils'

  // The popup is only a host: the window itself lives in `CreateMeetingDialog`, so creation from the
  // header, from a group and from the calendar grid all open the same form.
  const dispatch = createEventDispatcher()

  // Created from a group header: the meeting has to land in that group, not in "no group".
  export let group: Ref<MeetingGroup> | undefined = undefined
  export let space: Ref<Space> | undefined = undefined
  // Only the permanent meetings list offers the choice: anywhere else a meeting goes to the calendar.
  export let allowNoCalendar: boolean = false
  // Sent by the calendar grid: the moment clicked and whether that row was an hour or a whole day.
  export let date: Date | number | undefined = undefined
  export let withTime: boolean | undefined = undefined
  // The calendar tab creates a one-off meeting, the planner a standing one; the tabs still switch.
  export let initialKind: 'permanent' | 'one-off' | undefined = undefined

  async function created (event: CustomEvent<{ eventId: string, meeting?: PermanentMeeting | string }>): Promise<void> {
    const { eventId, meeting } = event.detail
    // A permanent meeting is addressed by its own id, a one-off by the id of its event: the two are
    // resolved by different kinds of link.
    const link =
      meeting !== undefined
        ? await getEventMeetingLink(meeting as string, 'meeting')
        : await getEventMeetingLink(eventId)
    if (link !== '') {
      if (meeting === undefined) {
        // The card carries the link, the same way a meeting made from the calendar form does.
        const master = await getClient().findOne(calendar.class.Event, { eventId })
        if (master !== undefined) await getClient().update(master, { location: link })
      }
      showPopup(MeetingLinkReadyPopup, { link }, 'content')
    }
    dispatch('close')
  }
</script>

<CreateMeetingDialog
  {group}
  {space}
  {allowNoCalendar}
  {date}
  {withTime}
  {initialKind}
  on:close={() => dispatch('close')}
  on:created={created}
/>
