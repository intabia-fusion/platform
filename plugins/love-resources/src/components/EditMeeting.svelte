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
  The window a meeting is opened with: the meeting's own card, not the calendar's event editor. A
  meeting is a document of its own - the series in the calendar only projects it - so its window
  carries the meeting's fields (group, kind, room, calendar) and leaves out what belongs to a plain
  calendar event (place as free text, visibility).
-->
<script lang="ts">
  import calendar, { type Event } from '@hcengineering/calendar'
  import { EventParticipants, EventRsvp } from '@hcengineering/calendar-resources'
  import type { Person } from '@hcengineering/contact'
  import { DateRangeMode, type DocumentUpdate, type Ref } from '@hcengineering/core'
  import type { MeetingEventLink, MeetingGroup, PermanentMeeting, Room } from '@hcengineering/love'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import ui, {
    Label,
    TimeZonesPopup,
    convertTimeZone,
    eventToHTMLElement,
    getTimeZoneName,
    getUserTimezone,
    showPopup,
    type PopupOptions
  } from '@hcengineering/ui'
  import {
    Button,
    Chip,
    DateLabel,
    DateSelect,
    Dialog,
    Dropdown,
    MenuButton,
    NumberInput,
    Section,
    SettingRow,
    TextArea,
    TextInput,
    Toggle,
    type DropdownItem
  } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'
  import love from '../plugin'
  import { findMeetingLink } from '../meetingLink'
  import { rooms } from '../stores'

  export let object: Event
  // Passed by the popup host; declared so the framework does not warn about an unknown prop.
  export let popupOptions: PopupOptions | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()

  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR
  const WEEK = 7 * DAY
  const defaultDuration = HOUR

  // The series, not the occurrence it was opened from: an occurrence is a projection, and a write
  // to it would not be what the calendar and the meetings list show.
  let live: Event = object

  let link: MeetingEventLink | undefined
  let permanent: PermanentMeeting | undefined = undefined

  $: void resolveMeeting(object)

  async function resolveMeeting (event: Event): Promise<void> {
    const series = await resolveSeries(event)
    if (series._id !== live._id) {
      live = series
      applyEvent(series)
    }
    link = await findMeetingLink(client, series)
    const id = link?.permanentMeeting
    permanent =
      id === undefined ? undefined : await client.findOne(love.class.PermanentMeeting, { _id: id })
    group ??= link?.group
    room ??= link?.room
    inCalendar ??= permanent?.calendar !== false
    syncRepeat()
  }

  // An occurrence names its series in `recurringEventId`; the series document is found by that id
  // in its own calendar, the same way the calendar's own updater finds it.
  async function resolveSeries (event: Event): Promise<Event> {
    if (event._class !== calendar.class.ReccuringInstance) return event
    const instance = event as unknown as { recurringEventId?: string }
    if (instance.recurringEventId === undefined) return event
    const found = await client.findOne(calendar.class.ReccuringEvent, {
      calendar: event.calendar,
      eventId: instance.recurringEventId
    })
    return found ?? event
  }

  function applyEvent (event: Event): void {
    title = event.title
    description = event.description ?? ''
    startDate = event.date
    dueDate = event.dueDate
    allDay = event.allDay
    timeZone = event.timeZone ?? timeZone
    reminders = [...(event.reminders ?? [])]
    participants = [...event.participants]
    externalParticipants = [...(event.externalParticipants ?? [])]
  }

  // A series in the calendar names its fields `title`/`description`, a permanent meeting `name`.
  let title: string = object.title
  let description: string = object.description ?? ''
  let startDate: number = object.date
  let dueDate: number = object.dueDate
  let allDay: boolean = object.allDay
  let timeZone: string = object.timeZone ?? getUserTimezone()
  let reminders: number[] = [...(object.reminders ?? [])]
  let participants: Ref<Person>[] = [...object.participants]
  let externalParticipants: string[] = [...(object.externalParticipants ?? [])]
  const busyPersons = new Set<Ref<Person>>()
  let room: Ref<Room> | undefined
  let group: Ref<MeetingGroup> | undefined
  let inCalendar: boolean | undefined
  let repeatCount = 1
  let repeatUnit: 'day' | 'week' | 'month' = 'week'

  let groups: MeetingGroup[] = []
  const groupQuery = createQuery()
  groupQuery.query(love.class.MeetingGroup, {}, (res) => {
    groups = res
  })

  function syncRepeat (): void {
    const period = permanent?.repeatEvery
    if (period === undefined || period <= 0) return
    if (period % WEEK === 0) {
      repeatUnit = 'week'
      repeatCount = period / WEEK
    } else if (period % DAY === 0) {
      repeatUnit = 'day'
      repeatCount = period / DAY
    } else {
      repeatUnit = 'week'
      repeatCount = Math.max(1, Math.round(period / WEEK))
    }
  }

  $: repeatItems = [
    { id: 'day' as const, label: love.string.RepeatDays },
    { id: 'week' as const, label: love.string.RepeatWeeks },
    { id: 'month' as const, label: love.string.RepeatMonths }
  ] as Array<DropdownItem<'day' | 'week' | 'month'>>

  $: groupItems = groups.map((it) => ({ id: it._id as string, label: getEmbeddedLabel(it.name) }))

  $: roomItems = $rooms
    .filter((it) => it._id !== love.ids.Reception)
    .map((it) => ({ id: it._id as string, label: getEmbeddedLabel(it.name) }))

  const reminderItems: Array<DropdownItem<number>> = [
    { id: 5 * MINUTE, label: calendar.string.DueMinutes, labelParams: { minutes: 5 } },
    { id: 15 * MINUTE, label: calendar.string.DueMinutes, labelParams: { minutes: 15 } },
    { id: 30 * MINUTE, label: calendar.string.DueMinutes, labelParams: { minutes: 30 } },
    { id: HOUR, label: calendar.string.DueHours, labelParams: { hours: 1 } },
    { id: DAY, label: calendar.string.DueDays, labelParams: { days: 1 } }
  ]

  $: pickedReminders = reminderItems.filter((it) => reminders.includes(it.id))

  function toggleReminders (on: boolean): void {
    reminders = on ? (reminders.length > 0 ? reminders : [15 * MINUTE]) : []
  }

  $: timeMode = allDay ? DateRangeMode.DATE : DateRangeMode.DATETIME
  $: zoneName = getTimeZoneName(timeZone) === '' ? timeZone : getTimeZoneName(timeZone)

  function changeStart (event: CustomEvent<number | null>): void {
    const value = event.detail
    if (value == null) return
    const length = dueDate - startDate
    startDate = value
    dueDate = startDate + (allDay ? DAY - 1 : length)
  }

  function changeDue (event: CustomEvent<number | null>): void {
    const value = event.detail
    if (value == null) return
    dueDate = value > startDate ? value : startDate + defaultDuration
  }

  function changeAllDay (value: boolean): void {
    allDay = value
    if (value) {
      startDate = new Date(startDate).setHours(0, 0, 0, 0)
      dueDate = new Date(dueDate).setHours(23, 59, 59, 999)
    } else {
      dueDate = startDate + defaultDuration
    }
  }

  function pickTimeZone (event: MouseEvent): void {
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

  let saving = false

  async function save (): Promise<void> {
    if (saving || title.trim() === '') return
    saving = true
    try {
      const update: DocumentUpdate<Event> = {}
      if (live.title !== title.trim()) update.title = title.trim()
      if ((live.description ?? '') !== description.trim()) update.description = description.trim()
      if (live.date !== startDate) update.date = startDate
      if (live.dueDate !== dueDate) update.dueDate = dueDate
      if (live.allDay !== allDay) update.allDay = allDay
      if ((live.timeZone ?? '') !== timeZone) update.timeZone = timeZone
      if (live.participants.join() !== participants.join()) update.participants = participants
      if ((live.externalParticipants ?? []).join() !== externalParticipants.join()) {
        update.externalParticipants = externalParticipants
      }
      if ((live.reminders ?? []).join() !== reminders.join()) update.reminders = reminders
      if (Object.keys(update).length > 0) await client.update(live, update)

      const mixin: DocumentUpdate<MeetingEventLink> = {}
      if (link?.room !== room) mixin.room = room
      if (link?.group !== group) mixin.group = group
      if (Object.keys(mixin).length > 0) {
        await client.updateMixin(live._id, live._class, live.space, love.mixin.MeetingEventLink, mixin)
      }

      if (permanent !== undefined) {
        const meetingUpdate: DocumentUpdate<PermanentMeeting> = {}
        const period = repeatCount * (repeatUnit === 'day' ? DAY : repeatUnit === 'week' ? WEEK : 30 * DAY)
        if (permanent.repeatEvery !== period) meetingUpdate.repeatEvery = period
        if (permanent.group !== group) meetingUpdate.group = group
        if (inCalendar !== undefined && (permanent.calendar !== false) !== inCalendar) {
          meetingUpdate.calendar = inCalendar
        }
        if (Object.keys(meetingUpdate).length > 0) await client.update(permanent, meetingUpdate)
      }

      dispatch('close')
    } finally {
      saving = false
    }
  }
</script>

<Dialog
  label={love.string.MeetingSettings}
  width="large"
  submitLabel={presentation.string.Save}
  cancelLabel={ui.string.Cancel}
  submitKind="brand"
  canSubmit={title.trim() !== ''}
  loading={saving}
  on:submit={save}
  on:cancel={() => dispatch('close')}
  on:close={() => dispatch('close')}
>
  <div class="meeting">
    <!-- What the window is about to do, before the first field: the schedule reads as a sentence. -->
    <p class="meeting__summary">
      <DateLabel value={startDate} mode={timeMode} showIcon={false} />
      <span class="meeting__dash">—</span>
      <DateLabel value={dueDate} mode={timeMode} showIcon={false} />
      <span class="meeting__dash">·</span>
      <span>{zoneName}</span>
    </p>

    <Section label={calendar.string.About} icon={ui.icon.Calendar} level={3}>
      <SettingRow label={love.string.MeetingName}>
        <div class="meeting__field meeting__field--wide">
          <TextInput bind:value={title} placeholder={love.string.MeetingName} size="medium" fullWidth autofocus />
        </div>
      </SettingRow>
      <SettingRow label={love.string.MeetingDescription} stacked>
        <div class="meeting__field meeting__field--wide">
          <TextArea
            bind:value={description}
            placeholder={love.string.MeetingDescription}
            kind="secondary"
            size="small"
            rows={2}
            maxRows={5}
          />
        </div>
      </SettingRow>
      {#if groupItems.length > 0}
        <SettingRow label={love.string.MeetingGroup}>
          <div class="meeting__field">
            <Dropdown
              items={groupItems}
              selected={group}
              placeholder={love.string.MeetingGroup}
              size="medium"
              kind="secondary"
              fullWidth
              withSearch={groupItems.length > 8}
              on:selected={(event) => (group = event.detail)}
            />
          </div>
        </SettingRow>
      {/if}
      <SettingRow label={love.string.MeetingType}>
        <span class="meeting__value">
          <Label label={permanent !== undefined ? love.string.RecurringMeeting : love.string.OneOffMeeting} />
        </span>
      </SettingRow>
    </Section>

    <Section label={calendar.string.When} icon={ui.icon.Clock} level={3}>
      <SettingRow label={love.string.AllDay} hint={love.string.AllDayHint} let:labelId>
        <Toggle
          aria-labelledby={labelId}
          checked={allDay}
          on:change={(event) => {
            changeAllDay(event.detail)
          }}
        />
      </SettingRow>
      <SettingRow label={calendar.string.Date} stacked>
        <div class="meeting__range">
          <DateSelect value={startDate} mode={timeMode} size="medium" fullWidth on:change={changeStart} />
          <span class="meeting__dash">—</span>
          <DateSelect value={dueDate} mode={timeMode} size="medium" fullWidth on:change={changeDue} />
        </div>
      </SettingRow>
      <SettingRow label={love.string.TimeZone}>
        <div class="meeting__field meeting__field--zone">
          <Button kind="secondary" size="medium" hasMenu on:click={pickTimeZone}>
            {zoneName}
          </Button>
        </div>
      </SettingRow>
      {#if permanent !== undefined}
        <SettingRow label={love.string.RepeatEvery}>
          <div class="meeting__control">
            <div class="meeting__number">
              <NumberInput bind:value={repeatCount} min={1} max={365} size="medium" />
            </div>
            <div class="meeting__field meeting__field--unit">
              <Dropdown
                items={repeatItems}
                selected={repeatUnit}
                size="medium"
                kind="secondary"
                fullWidth
                on:selected={(event) => (repeatUnit = event.detail)}
              />
            </div>
          </div>
          <svelte:fragment slot="details">
            <span class="meeting__note">
              <Label label={love.string.NextOccurrence} />:
              <DateLabel value={startDate} mode={timeMode} showIcon={false} />
            </span>
          </svelte:fragment>
        </SettingRow>
      {/if}
    </Section>

    <Section label={calendar.string.Where} icon={ui.icon.DoorOpen} level={3}>
      <SettingRow label={love.string.MeetingRoom}>
        <div class="meeting__field">
          <Dropdown
            items={roomItems}
            selected={room}
            placeholder={love.string.Room}
            size="medium"
            kind="secondary"
            fullWidth
            withSearch={roomItems.length > 8}
            on:selected={(event) => (room = event.detail)}
          />
        </div>
      </SettingRow>
      {#if permanent !== undefined}
        <SettingRow label={love.string.ShowInCalendar} let:labelId>
          <Toggle
            aria-labelledby={labelId}
            checked={inCalendar ?? true}
            on:change={(event) => (inCalendar = event.detail)}
          />
        </SettingRow>
      {/if}
    </Section>

    <Section label={calendar.string.Participants} icon={ui.icon.People} level={3}>
      <EventParticipants
        bind:participants
        bind:externalParticipants
        focusIndex={10006}
        {busyPersons}
      />
      <EventRsvp object={live} indent />
    </Section>

    <Section label={calendar.string.Reminders} icon={ui.icon.Bell} level={3}>
      <SettingRow label={calendar.string.Remember} let:labelId>
        <Toggle
          aria-labelledby={labelId}
          checked={reminders.length > 0}
          on:change={(event) => {
            toggleReminders(event.detail)
          }}
        />
      </SettingRow>
      <SettingRow label={calendar.string.ReminderTime}>
        <div class="meeting__field meeting__field--auto">
          <MenuButton
            kind="secondary"
            size="medium"
            icon={ui.icon.Plus}
            label={calendar.string.AddReminder}
            items={reminderItems}
            selected={reminders}
            multiselect
            disabled={reminders.length === 0}
            on:selected={(event) => (reminders = [...event.detail].sort((a, b) => a - b))}
          />
        </div>
        <svelte:fragment slot="details">
          {#each pickedReminders as item (item.id)}
            <Chip
              label={item.label}
              labelParams={item.labelParams}
              kind="neutral"
              size="small"
              removable
              on:remove={() => (reminders = reminders.filter((id) => id !== item.id))}
            />
          {/each}
          {#if reminders.length === 0}
            <span class="meeting__note"><Label label={calendar.string.NoReminders} /></span>
          {/if}
        </svelte:fragment>
      </SettingRow>
    </Section>
  </div>
</Dialog>

<style lang="scss">
  .meeting {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);

    &__summary {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.125rem;
      color: var(--global-secondary-TextColor);
    }
    &__field {
      width: 12rem;
      min-width: 0;

      &--wide {
        width: 100%;
      }
      &--zone :global(.button) {
        width: 100%;
        justify-content: space-between;
        font-weight: 400;
      }
      // A control that keeps its own width: a button with a name in it.
      &--auto {
        width: max-content;
        max-width: 100%;
      }
      &--unit {
        width: 7rem;
      }
    }
    &__control {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--spacing-1);
      min-width: 0;
    }
    &__number {
      width: 5rem;
    }
    &__range {
      display: flex;
      align-items: center;
      gap: var(--spacing-1_5);
      width: 100%;
      min-width: 0;

      :global(.date-select) {
        flex: 1 1 0;
        min-width: 0;
      }
    }
    &__dash {
      color: var(--global-secondary-TextColor);
    }
    &__value {
      font-size: 0.875rem;
      color: var(--global-primary-TextColor);
    }
    &__note {
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
    }
  }
</style>
