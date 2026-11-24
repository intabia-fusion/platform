<!--
//
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
  The one window that creates a meeting: the kind is picked with tabs at the top and the fields below
  follow that choice. A permanent meeting is a standing meeting with its series in the calendar; a
  one-off is a single calendar meeting in a picked room and gets no standing meeting document.
-->
<script lang="ts">
  import { getCurrentEmployeeSpace } from '@hcengineering/contact'
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import type { AccountUuid, Ref, Space } from '@hcengineering/core'
  import core, { DateRangeMode, getCurrentAccount } from '@hcengineering/core'
  import type { MeetingGroup, Room } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import { getCurrentLanguage } from '@hcengineering/theme'
  import {
    Button,
    EditBox,
    Label,
    TimeZonesPopup,
    convertTimeZone,
    eventToHTMLElement,
    getTimeZoneName,
    getUserTimezone,
    showPopup,
    type DropdownIntlItem,
    type TimeZone
  } from '@hcengineering/ui'
  import { Checkbox, DateSelect, Dialog, Dropdown, Tabs, TextArea, TextInput, Toggle } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'
  import love from '../plugin'
  import { getLoveClient } from '../loveClient'
  import {
    createOneOffMeeting,
    createPermanentMeetingWithSchedule,
    findPrimaryCalendarId,
    type PermanentMeetingInput,
    type ScheduleContext,
    withOwners
  } from '../permanentMeetingSchedule'
  import { REMINDER_PRESETS, reminderItem } from '../reminderOptions'
  import { myOffice } from '../stores'
  import RepeatEveryEditor from './RepeatEveryEditor.svelte'
  import RoomSelector from './RoomSelector.svelte'

  type Kind = 'permanent' | 'one-off'

  const HOUR = 60 * 60 * 1000
  const WEEK = 7 * 24 * HOUR

  export let space: Ref<Space> | undefined = undefined
  // A meeting created from a group header is born in that group.
  export let group: Ref<MeetingGroup> | undefined = undefined
  // Only the permanent meetings list may create a meeting without a calendar series.
  export let allowNoCalendar: boolean = false
  // Set by the calendar grid: the moment the user clicked, and whether that row was an hour or a day.
  export let date: Date | number | undefined = undefined
  export let withTime: boolean | undefined = undefined
  export let initialKind: Kind | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()

  // A meeting is a one-off unless the user says it repeats: a standing meeting is the deliberate
  // choice, so the tab starts on the plain meeting and the period fields stay out of the way.
  let kind: Kind = initialKind ?? 'one-off'
  let name = ''
  let description = ''
  let allDay: boolean = withTime === false
  let start: number = startOf(date, withTime)
  let due: number = start + HOUR
  // The zone the meeting is written with. The picker below is the calendar's own, the id is IANA.
  let timeZone: string = getUserTimezone()
  // A one-off meeting is held somewhere: the own office is the place it usually is, as in the
  // calendar form. A permanent one owns no office room at all.
  let room: Ref<Room> | undefined = $myOffice?._id
  let period: number = WEEK
  // The flag the toggle sets: whether the meeting is meant to be shown in the calendar. It is not what
  // creates the series - only the planner grid does that, so a meeting from the section never reaches
  // the Planner, with the toggle on or off.
  let inCalendar = true
  let remind = true
  // The calendar keeps every lead time, the meeting itself only the earliest one.
  let reminders: number[] = [15 * 60 * 1000]
  let password = ''
  let members: AccountUuid[] = []
  let saving = false

  function startOf (moment: Date | number | undefined, time: boolean | undefined): number {
    if (moment === undefined) return Date.now() + 30 * 60 * 1000
    const value = moment instanceof Date ? moment.getTime() : moment
    // A click on the all-day row creates a whole-day meeting, not one that starts at midnight.
    return time === false ? new Date(value).setHours(0, 0, 0, 0) : value
  }

  $: permanent = kind === 'permanent'

  const tabs = [
    { id: 'permanent', label: love.string.PermanentMeeting },
    { id: 'one-off', label: love.string.OneOffMeeting }
  ]

  // Said once under the tabs, so the form itself stays a list of fields.
  $: hint = permanent ? love.string.MeetingHintPermanent : love.string.MeetingHintOneOff

  const reminderItems: Array<DropdownIntlItem<number>> = REMINDER_PRESETS.map(reminderItem)

  // The two fields keep the length of the meeting: moving the start moves the end, and pulling the end
  // before the start takes the start back with it.
  function setStart (value: number | null): void {
    if (value == null) return
    const duration = due - start
    start = value
    due = start + duration
  }

  function setDue (value: number | null): void {
    if (value == null) return
    due = value > start ? value : start + (start - value)
  }

  // With the switch on the fields pick whole days: the meeting covers the whole day.
  function toggleAllDay (value: boolean): void {
    if (value) {
      start = new Date(start).setHours(0, 0, 0, 0)
      due = new Date(due).setHours(0, 0, 0, 0)
      if (due < start) due = start
    }
    allDay = value
  }

  function styleZone (event: MouseEvent): void {
    const zones = Intl.supportedValuesOf?.('timeZone') ?? []
    showPopup(
      TimeZonesPopup,
      { timeZones: zones.map(convertTimeZone), withAdd: false, selected: timeZone, count: 1, reset: null },
      eventToHTMLElement(event),
      (result) => {
        if (result !== undefined) timeZone = result
      }
    )
  }

  // `getTimeZoneName` cuts the continent off; `Etc/GMT` has none, so the id itself is shown instead.
  $: zoneName = getTimeZoneName(timeZone) === '' ? timeZone : getTimeZoneName(timeZone)

  function membersChanged (value: AccountUuid[]): void {
    // An owner stays a member: the server pushes them back anyway.
    members = withOwners(value, [])
  }

  function changeRoom (value: Ref<Room> | undefined): void {
    room = value
  }

  async function save (): Promise<void> {
    if (saving || name.trim() === '') return
    saving = true
    try {
      const calendarId = await findPrimaryCalendarId(client)
      if (calendarId === undefined) return
      const acc = getCurrentAccount()
      const ctx: ScheduleContext = {
        calendarId,
        space: space ?? getCurrentEmployeeSpace(),
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
        description: description.trim(),
        startDate: start,
        duration: Math.max(15 * 60 * 1000, due - start),
        allDay,
        timeZone,
        // No period is what makes the meeting a one-off: the series gets no rules then.
        period: permanent ? period : undefined,
        // A one-off meeting runs in the room the form picked; a permanent one never has one.
        room: permanent ? undefined : room,
        members,
        // 0 turns the reminder off, absent falls back to the default, so the value is explicit.
        reminderBefore: remind ? Math.min(...reminders, Number.MAX_SAFE_INTEGER) : 0,
        reminders: remind ? [...reminders].sort((a, b) => a - b) : [0],
        guestPassword: password !== '' ? password : undefined,
        calendar: inCalendar,
        // A series belongs to the planner grid: the dialog opened there is the only one that asks for it.
        series: date !== undefined,
        group
      }
      if (permanent) {
        const created = await createPermanentMeetingWithSchedule(client, input, ctx)
        dispatch('created', created)
      } else {
        // A one-off is a calendar meeting: no standing meeting document is created for it.
        const created = await createOneOffMeeting(client, input, ctx)
        dispatch('created', created)
      }
      dispatch('close')
    } finally {
      saving = false
    }
  }
</script>

<div class="create-meeting">
  <Dialog
    label={love.string.NewMeeting}
    width="medium"
    submitLabel={love.string.CreateMeeting}
    cancelLabel={love.string.Cancel}
    submitKind="brand"
    canSubmit={name.trim() !== '' && !saving}
    submitOnEnter
    on:submit={save}
    on:cancel={() => dispatch('close')}
    on:close={() => dispatch('close')}
  >
    <Tabs items={tabs} bind:selected={kind} size="medium" aria-label="Meeting kind" />

    <p class="create-meeting__hint"><Label label={hint} /></p>

    <div class="create-meeting__form">
      <span class="create-meeting__label"><Label label={love.string.MeetingName} /></span>
      <TextInput
        bind:value={name}
        placeholder={love.string.PermanentMeeting}
        size="medium"
        fullWidth
        autofocus
        focusIndex={1}
      />

      <span class="create-meeting__label"><Label label={love.string.Time} /></span>
      <div class="create-meeting__stack">
        <Checkbox
          label={love.string.AllDay}
          checked={allDay}
          on:change={(e) => {
            toggleAllDay(e.detail)
          }}
        />
        <div class="create-meeting__dates">
          <DateSelect
            value={start}
            mode={allDay ? DateRangeMode.DATE : DateRangeMode.DATETIME}
            size="medium"
            fullWidth
            on:change={(e) => {
              setStart(e.detail)
            }}
          />
          <span class="create-meeting__dash">—</span>
          <DateSelect
            value={due}
            mode={allDay ? DateRangeMode.DATE : DateRangeMode.DATETIME}
            size="medium"
            fullWidth
            on:change={(e) => {
              setDue(e.detail)
            }}
          />
        </div>
      </div>

      <span class="create-meeting__label"><Label label={love.string.TimeZone} /></span>
      <div class="create-meeting__wide">
        <Button
          kind="secondary"
          justify="left"
          flex="1 1 0"
          on:click={(e) => {
            styleZone(e)
          }}
        >
          <svelte:fragment slot="content">
            <span class="create-meeting__zone">{zoneName}</span>
          </svelte:fragment>
        </Button>
      </div>

      <!-- A permanent meeting owns no office room: its sessions run in the workspace meeting room. -->
      {#if !permanent}
        <span class="create-meeting__label"><Label label={love.string.Room} /></span>
        <div class="create-meeting__inline">
          <RoomSelector
            value={room}
            on:change={(e) => {
              changeRoom(e.detail)
            }}
          />
        </div>
      {/if}

      <span class="create-meeting__label"><Label label={love.string.MeetingDescription} /></span>
      <div class="create-meeting__wide">
        <TextArea
          bind:value={description}
          kind="secondary"
          size="small"
          rows={2}
          maxRows={4}
          fullWidth
          placeholder={love.string.MeetingDescription}
        />
      </div>

      {#if permanent}
        <span class="create-meeting__label"><Label label={love.string.RepeatEvery} /></span>
        <div class="create-meeting__inline">
          <span class="create-meeting__text"><Label label={love.string.EachPeriod} /></span>
          <RepeatEveryEditor value={period} onChange={(value) => (period = value)} />
        </div>
      {/if}

      <!-- From the calendar grid the series is what the click creates, so there is nothing to choose.
           From the meetings section the toggle only marks the intent to show the meeting in a
           calendar: the section itself creates no event, so nothing lands in the Planner. -->
      {#if date === undefined}
        <span class="create-meeting__label"><Label label={love.string.CalendarMeetingView} /></span>
        <div class="create-meeting__inline">
          <Toggle
            label={love.string.ShowInCalendar}
            description={inCalendar ? love.string.ShowInCalendarOn : love.string.ShowInCalendarHint}
            labelPosition="start"
            fullWidth
            bind:checked={inCalendar}
          />
        </div>
      {/if}

      <span class="create-meeting__label"><Label label={love.string.RemindBefore} /></span>
      <div class="create-meeting__inline">
        <Checkbox
          label={love.string.Notify}
          checked={remind}
          on:change={(e) => {
            remind = e.detail
          }}
        />
        <Dropdown
          items={reminderItems}
          bind:selected={reminders}
          multiselect
          size="medium"
          kind="secondary"
          fullWidth
          disabled={!remind}
          aria-label="Reminder times"
        />
      </div>

      <span class="create-meeting__label"><Label label={love.string.GuestPassword} /></span>
      <div class="create-meeting__wide">
        <EditBox bind:value={password} format="password" placeholder={love.string.EnterPassword} />
      </div>

      <span class="create-meeting__label"><Label label={core.string.Members} /></span>
      <div class="create-meeting__wide">
        <AccountArrayEditor
          value={members}
          label={core.string.Members}
          onChange={membersChanged}
          kind="regular"
          size="large"
        />
      </div>
    </div>
  </Dialog>
</div>

<style lang="scss">
  .create-meeting {
    &__form {
      display: grid;
      grid-template-columns: 8.5rem 1fr;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
      margin-top: var(--spacing-3);
    }

    &__label {
      font-size: 0.875rem;
      color: var(--global-secondary-TextColor);
    }

    &__hint {
      margin: var(--spacing-1) 0 var(--spacing-3);
      font-size: 0.8125rem;
      line-height: 1.125rem;
      color: var(--global-secondary-TextColor);
    }

    &__text {
      flex-shrink: 0;
      font-size: 0.875rem;
      color: var(--global-secondary-TextColor);
    }

    &__inline {
      display: flex;
      align-items: center;
      gap: var(--spacing-1_5);
      min-width: 0;
    }

    // The switch sits above the dates: side by side, both fields lost the room for their own text.
    &__stack {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      min-width: 0;
    }

    // The switch takes its own width, and the two dates share what is left of the row.
    &__dates {
      display: flex;
      align-items: center;
      gap: var(--spacing-1_5);
      flex: 1 1 auto;
      min-width: 0;

      :global(.date-select) {
        flex: 1 1 0;
        min-width: 0;
      }
    }

    // A field that is taller than one line stays at the top of its grid row.
    &__wide {
      align-self: start;
      min-width: 0;
      display: flex;
    }

    &__zone {
      overflow: hidden;
      min-width: 0;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
</style>
