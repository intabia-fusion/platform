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
  import type { Ref, Space } from '@hcengineering/core'
  import type { MeetingGroup, PermanentMeeting } from '@hcengineering/love'
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

  async function created (event: CustomEvent<{ meeting: PermanentMeeting | string, password?: string }>): Promise<void> {
    // Both kinds of meeting are addressed by their own id: the link is issued for the meeting.
    const link = await getEventMeetingLink(event.detail.meeting as string, 'meeting')
    if (link !== '') {
      // The password the meeting was just created with travels along, so the screen can offer the link
      // with it inside: the server keeps a hash and never gives the plaintext back.
      showPopup(MeetingLinkReadyPopup, { link, password: event.detail.password }, 'content')
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
