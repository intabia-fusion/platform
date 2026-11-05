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
  A meeting looks exactly like a calendar event until you open it: same card, same time, no way to
  tell that a room and a guest link exist behind it. This badge marks such a card in every calendar
  view (day grid, month, planner) and joins the session in one click - the same call the meeting
  panel makes. The mixin is mirrored onto participant copies by the calendar trigger, so the badge
  appears for them too, not only for the owner of the series.
-->
<script lang="ts">
  import type { Event, ReccuringInstance } from '@hcengineering/calendar'
  import { getClient } from '@hcengineering/presentation'
  // IconButton is exported by the UI kit only: the barrel in @hcengineering/ui points at a stale path
  // and hands webpack undefined, which fails at render time with "is not a constructor".
  import { IconButton } from '@hcengineering/ui/kit'
  import love from '../plugin'
  import { joinMeetingBySession } from '../meetings'

  export let event: Event
  export let narrow: boolean = false
  export let oneRow: boolean = false
  export let hideDetails: boolean = false

  const hierarchy = getClient().getHierarchy()
  let joining = false

  $: isMeeting = hierarchy.hasMixin(event, love.mixin.MeetingEventLink)
  // A busy overlay of a colleague carries no mixin, and a cancelled occurrence is not joinable.
  $: joinable = isMeeting && !hideDetails && (event as ReccuringInstance).isCancelled !== true

  async function join (e: MouseEvent): Promise<void> {
    // The card opens the event editor on click, and Svelte forbids event modifiers on a component,
    // so the badge stops the click here instead of in the template.
    e.stopPropagation()
    if (joining) return
    joining = true
    try {
      await joinMeetingBySession(event.eventId, 'event')
    } finally {
      joining = false
    }
  }
</script>

{#if joinable}
  <span class="meeting-badge">
    <IconButton
      icon={love.icon.Cam}
      size={narrow || oneRow ? 'min' : 'extra-small'}
      kind="ghost"
      loading={joining}
      tooltip={{ label: love.string.JoinMeeting }}
      data-id="event-meeting-badge"
      on:click={join}
    />
  </span>
{/if}

<style lang="scss">
  .meeting-badge {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    flex-shrink: 0;
  }
</style>
