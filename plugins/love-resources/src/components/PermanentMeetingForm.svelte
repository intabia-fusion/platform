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
  The one window that creates and edits a permanent meeting: name, date and time, repeat period,
  participants, reminder and guest password. A meeting is its own entity and belongs to no office
  room, so nothing here picks one - see `createPermanentMeetingWithSchedule`.
-->
<script lang="ts">
  import { EventTimeEditor } from '@hcengineering/calendar-resources'
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import { getCurrentEmployeeSpace } from '@hcengineering/contact'
  import type { AccountUuid } from '@hcengineering/core'
  import core, { getCurrentAccount } from '@hcengineering/core'
  import type { PermanentMeeting } from '@hcengineering/love'
  import { Card, getClient } from '@hcengineering/presentation'
  import { getCurrentLanguage } from '@hcengineering/theme'
  import { EditBox, getUserTimezone, Label, NumberInput } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import love from '../plugin'
  import RepeatEveryEditor from './RepeatEveryEditor.svelte'
  import { getLoveClient } from '../loveClient'
  import {
    createPermanentMeetingWithSchedule,
    findPrimaryCalendarId,
    updatePermanentMeetingWithSchedule,
    type PermanentMeetingInput,
    type ScheduleContext
  } from '../permanentMeetingSchedule'

  export let object: PermanentMeeting | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const timeZone = getUserTimezone()
  const allDay = false

  const HOUR = 60 * 60 * 1000
  const WEEK = 7 * 24 * HOUR

  let name: string = object?.name ?? ''
  // A new meeting starts in half an hour and lasts an hour: the two values a user changes least.
  let startDate: number = Date.now() + 30 * 60 * 1000
  let dueDate: number = startDate + HOUR
  let period: number | undefined = object?.repeatEvery ?? WEEK
  let members: AccountUuid[] = object?.members ?? []
  let reminderMinutes: number = Math.round((object?.reminderBefore ?? 15 * 60 * 1000) / 60000)
  let password: string = ''
  let saving = false

  function membersChanged (value: AccountUuid[]): void {
    members = value
  }

  function changePeriod (value: number): void {
    period = value
  }

  async function save (): Promise<void> {
    if (saving) return
    saving = true
    try {
      const calendarId = await findPrimaryCalendarId(client)
      if (calendarId === undefined) return
      const acc = getCurrentAccount()
      const ctx: ScheduleContext = {
        calendarId,
        space: getCurrentEmployeeSpace(),
        timeZone,
        me: acc.uuid,
        primarySocialId: acc.primarySocialId,
        language: getCurrentLanguage(),
        setGuestPassword: async (meeting, value) => {
          await getLoveClient().setGuestPassword(meeting, value, 'meeting')
        }
      }
      const input: PermanentMeetingInput = {
        name: name.trim(),
        startDate,
        duration: Math.max(15 * 60 * 1000, dueDate - startDate),
        period,
        members,
        // 0 turns the reminder off, absent falls back to the default, so the value is explicit.
        reminderBefore: Math.max(0, Math.round(reminderMinutes)) * 60 * 1000,
        guestPassword: password !== '' ? password : undefined
      }
      const created = object === undefined ? await createPermanentMeetingWithSchedule(client, input, ctx) : undefined
      if (object !== undefined) {
        await updatePermanentMeetingWithSchedule(client, object, input, ctx)
      }
      if (created !== undefined) dispatch('created', created)
      dispatch('close')
    } finally {
      saving = false
    }
  }
</script>

<Card
  label={object === undefined ? love.string.NewMeeting : love.string.MeetingSettings}
  okAction={save}
  canSave={name.trim() !== '' && !saving}
  on:close={() => dispatch('close')}
>
  <div class="antiGrid">
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.PermanentMeeting} /></div>
      <EditBox bind:value={name} placeholder={love.string.PermanentMeeting} kind="large-style" autoFocus focusIndex={1} />
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.Meetings} /></div>
      <EventTimeEditor bind:startDate bind:dueDate {allDay} {timeZone} focusIndex={2} />
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.RepeatEvery} /></div>
      <div class="flex-row-center gap-2">
        <RepeatEveryEditor value={period} onChange={changePeriod} />
      </div>
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.RemindBeforeMinutes} /></div>
      <div class="flex-row-center gap-2">
        <NumberInput bind:value={reminderMinutes} minValue={0} maxValue={1440} maxDigitsAfterPoint={0} maxWidth="4rem" />
        <span class="text-sm content-color"><Label label={love.string.RemindBefore} /></span>
      </div>
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.GuestPassword} /></div>
      <EditBox bind:value={password} format="password" placeholder={love.string.EnterPassword} />
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={core.string.Members} /></div>
      <AccountArrayEditor value={members} label={core.string.Members} onChange={membersChanged} kind="regular" size="large" />
    </div>
  </div>
</Card>
