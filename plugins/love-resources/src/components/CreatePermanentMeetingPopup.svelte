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
  import type { PermanentMeeting } from '@hcengineering/love'
  import { showPopup } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import MeetingLinkReadyPopup from './MeetingLinkReadyPopup.svelte'
  import PermanentMeetingForm from './PermanentMeetingForm.svelte'
  import { getEventMeetingLink } from '../utils'

  // The popup is only a host: the window itself lives in `PermanentMeetingForm`, so creation and
  // settings stay one and the same form.
  const dispatch = createEventDispatcher()

  async function created (event: CustomEvent<{ eventId: string, meeting: PermanentMeeting | string }>): Promise<void> {
    const meeting = event.detail.meeting as string
    const link = await getEventMeetingLink(meeting, 'meeting')
    if (link !== '') showPopup(MeetingLinkReadyPopup, { link }, 'content')
    dispatch('close')
  }
</script>

<PermanentMeetingForm on:close={() => dispatch('close')} on:created={created} />
