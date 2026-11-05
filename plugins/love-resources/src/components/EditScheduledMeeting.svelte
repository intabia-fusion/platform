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
<!--
  Panel header of a scheduled meeting. Time and participants belong to the calendar event and are
  edited there; the rest of the panel is the generic one. The document is followed live: the calendar
  editor next to it changes the same event, and a header showing a snapshot would keep an old title
  and an old period.
-->
<script lang="ts">
  import calendar, { type Event, type ReccuringEvent } from '@hcengineering/calendar'
  import { RecurrenceSummary } from '@hcengineering/calendar-resources'
  import type { DocumentUpdate, Timestamp } from '@hcengineering/core'
  import type { MeetingEventLink } from '@hcengineering/love'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import { CheckBox, Label, showPopup } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { createEventDispatcher, onMount } from 'svelte'
  import love from '../plugin'
  import { joinMeetingBySession } from '../meetings'
  import { DEFAULT_MEETING_REMINDER } from '../utils'
  import { retimedRules, ruleToPeriod } from '../period'
  import RepeatEveryEditor from './RepeatEveryEditor.svelte'

  export let object: Event
  export let readonly: boolean = false

  const dispatch = createEventDispatcher()
  const client = getClient()

  let live: Event = object
  const query = createQuery(true)

  $: query.query(object._class, { _id: object._id }, (res) => {
    if (res.length > 0) live = res[0]
  })

  $: rules = (live as ReccuringEvent).rules ?? []
  $: rule = rules[0]
  $: period = ruleToPeriod(rule)

  async function changePeriod (next: number): Promise<void> {
    const update: DocumentUpdate<ReccuringEvent> = { rules: retimedRules(live.date as Timestamp, next, rule) }
    await client.update(live, update)
  }

  // Absent means the default lead, 0 means the meeting keeps quiet.
  $: reminderBefore = (live as MeetingEventLink & Event).reminderBefore ?? DEFAULT_MEETING_REMINDER
  $: reminderOn = reminderBefore > 0

  async function toggleReminder (on: boolean): Promise<void> {
    await client.updateMixin(live._id, live._class, live.space, love.mixin.MeetingEventLink, {
      reminderBefore: on ? DEFAULT_MEETING_REMINDER : 0
    })
  }

  onMount(() => {
    dispatch('open', { ignoreKeys: ['title', 'reminderBefore', 'rules'] })
  })
</script>

<div class="flex-col gap-1 mb-4">
  <div class="flex-row-center flex-between flex-gap-2">
    <div class="title overflow-label flex-grow">{live.title}</div>
    {#if !readonly}
      <Button
        label={presentation.string.Edit}
        size="small"
        on:click={() => showPopup(calendar.component.EditEvent, { object: live }, 'content')}
      />
    {/if}
    <Button
      label={love.string.JoinMeeting}
      size="large"
      kind="primary"
      on:click={() => {
        void joinMeetingBySession(live.eventId, 'event')
      }}
    />
  </div>
  {#if rules.length > 0}
    <RecurrenceSummary {rules} startDate={live.date} />
    {#if !readonly}
      <div class="flex-row-center gap-2">
        <span class="text-sm text-content-color"><Label label={love.string.RepeatEvery} /></span>
        <RepeatEveryEditor value={period} onChange={changePeriod} />
      </div>
    {/if}
  {/if}
  {#if !readonly}
    <div class="flex-row-center gap-1-5">
      <CheckBox
        checked={reminderOn}
        kind="primary"
        on:value={(ev) => {
          void toggleReminder(ev.detail)
        }}
      />
      <span class="text-sm text-content-color"><Label label={love.string.RemindBefore} /></span>
    </div>
  {/if}
</div>

<style lang="scss">
  .title {
    font-weight: 500;
    font-size: 1.25rem;
    color: var(--theme-caption-color);
  }
</style>
