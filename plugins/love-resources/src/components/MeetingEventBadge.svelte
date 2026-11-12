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
  A series the office built from a permanent meeting also carries `permanentMeeting` on the mixin:
  those cards get a repeat mark, so a recurring meeting is told from a one-off one at a glance.
-->
<script lang="ts">
  import type { Event, ReccuringInstance } from '@hcengineering/calendar'
  import calendar from '@hcengineering/calendar'
  import type { MeetingEventLink } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import { Icon, tooltip } from '@hcengineering/ui'
  // IconButton is exported by the UI kit only: the barrel in @hcengineering/ui points at a stale path
  // and hands webpack undefined, which fails at render time with "is not a constructor".
  import { IconButton } from '@hcengineering/ui/kit'
  import love from '../plugin'
  import { joinMeetingBySession, seriesIdOf } from '../meetings'

  export let event: Event
  export let narrow: boolean = false
  export let oneRow: boolean = false
  export let hideDetails: boolean = false

  const hierarchy = getClient().getHierarchy()
  let joining = false

  $: iconSize = narrow || oneRow ? 'x-small' : 'smaller'
  // Resolved through the mixin, not off the event: only a linked meeting carries the reference of
  // the permanent meeting it was created from - a plain event and a colleague's busy slot do not.
  $: link = hierarchy.hasMixin(event, love.mixin.MeetingEventLink)
    ? hierarchy.as<Event, MeetingEventLink>(event, love.mixin.MeetingEventLink)
    : undefined
  $: isPermanent = link?.permanentMeeting !== undefined
  // A busy overlay of a colleague carries no mixin, and a cancelled occurrence is not joinable.
  $: joinable = link !== undefined && !hideDetails && (event as ReccuringInstance).isCancelled !== true

  async function join (e: MouseEvent): Promise<void> {
    // The card opens the event editor on click, and Svelte forbids event modifiers on a component,
    // so the badge stops the click here instead of in the template.
    e.stopPropagation()
    if (joining) return
    joining = true
    try {
      // Addressed by the series: an expanded occurrence has no id of its own in the database.
      await joinMeetingBySession(seriesIdOf(event), 'event')
    } finally {
      joining = false
    }
  }
</script>

{#if isPermanent || joinable}
  <span class="meeting-badge">
    {#if isPermanent}
      <span class="permanent-mark" use:tooltip={{ label: love.string.PermanentMeeting }} data-id="event-permanent-meeting">
        <Icon icon={calendar.icon.Repeat} size={iconSize} />
      </span>
    {/if}
    {#if joinable}
      <IconButton
        icon={love.icon.Cam}
        size={narrow || oneRow ? 'min' : 'extra-small'}
        kind="ghost"
        loading={joining}
        tooltip={{ label: love.string.JoinMeeting }}
        data-id="event-meeting-badge"
        on:click={join}
      />
    {/if}
  </span>
{/if}

<style lang="scss">
  .meeting-badge {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    flex-shrink: 0;
  }

  // A muted mark, not a button: it only says "this one repeats" and must not compete with the join
  // action sitting next to it. Accent keeps it recognisable at 12px, where a grey glyph reads as noise.
  .permanent-mark {
    display: flex;
    align-items: center;
    padding: 0 0.125rem;
    color: var(--button-primary-BackgroundColor, var(--theme-content-color));
    flex-shrink: 0;
  }
</style>
