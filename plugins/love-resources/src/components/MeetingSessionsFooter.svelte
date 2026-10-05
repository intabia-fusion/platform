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
<!-- Past sessions of a permanent meeting or of a series, below its description. -->
<script lang="ts">
  import type { Event } from '@hcengineering/calendar'
  import type { Doc } from '@hcengineering/core'
  import { LIVE_MEETING_STATUSES } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import love from '../plugin'
  import MeetingMinutesSection from './MeetingMinutesSection.svelte'

  export let object: Doc
  export let readonly: boolean = false

  // A session points at its meeting by `meeting` or `eventId`, never by attachedTo.
  $: query = getClient().getHierarchy().isDerived(object._class, love.class.PermanentMeeting)
    ? { meeting: object._id, status: { $nin: LIVE_MEETING_STATUSES } }
    : { eventId: (object as Event).eventId, status: { $nin: LIVE_MEETING_STATUSES } }
</script>

<MeetingMinutesSection
  objectId={object._id}
  space={object.space}
  _class={object._class}
  meetings={0}
  label={love.string.MeetingsMinutes}
  {query}
  {readonly}
/>
