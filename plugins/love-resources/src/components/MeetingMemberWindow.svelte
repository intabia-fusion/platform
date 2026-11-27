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
  The window an invitee opens a meeting with: what the organiser agreed, and the one thing a guest
  owns - their own answer. Everything here is read-only on purpose; the settings live in
  `EditMeeting`, which only an organiser gets.
-->
<script lang="ts">
  import calendar, { type Event, type RsvpStatus } from '@hcengineering/calendar'
  import type { Person } from '@hcengineering/contact'
  import contact, { getName } from '@hcengineering/contact'
  import { DateRangeMode, getCurrentAccount, type Ref } from '@hcengineering/core'
  import type { MeetingEventLink, MeetingGroup, MeetingMinutes, PermanentMeeting, Room } from '@hcengineering/love'
  import { getEmbeddedLabel, translate } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import ui, { Label, getTimeZoneName, getUserTimezone, type PopupOptions } from '@hcengineering/ui'
  import { Button, Callout, Chip, DateLabel, Dialog, MenuButton, Section, SegmentedControl, SettingRow, Toggle } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'
  import { getCurrentLanguage } from '@hcengineering/theme'
  import love from '../plugin'
  import { descriptionText } from '../description'
  import { findMeetingLink } from '../meetingLink'
  import MeetingRsvpSummary from './MeetingRsvpSummary.svelte'
  import { openDoc } from '@hcengineering/view-resources'

  export let object: Event
  // Passed by the popup host; declared so the framework does not warn about an unknown prop.
  export let popupOptions: PopupOptions | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const me = getCurrentAccount()

  const DAY = 24 * 60 * 60 * 1000
  const HOUR = 60 * 60 * 1000
  const MINUTE = 60 * 1000

  // The series, not the occurrence it was opened from: the title, the rule and the room are kept on
  // the master, and an occurrence carries only its own moved slot.
  let liveEvent: Event = object
  let link: MeetingEventLink | undefined
  let permanent: PermanentMeeting | undefined

  let title: string = object.title
  let description: string = ''
  let startDate: number = object.date
  let dueDate: number = object.dueDate
  let allDay: boolean = object.allDay
  let timeZone: string = object.timeZone ?? getUserTimezone()
  let group: Ref<MeetingGroup> | undefined
  let room: Ref<Room> | undefined

  $: void resolveMeeting(object)

  async function resolveMeeting (event: Event): Promise<void> {
    const series = await resolveSeries(event)
    liveEvent = series
    title = series.title
    description = descriptionText(series.description)
    startDate = series.date
    dueDate = series.dueDate
    allDay = series.allDay
    timeZone = series.timeZone ?? getUserTimezone()
    link = await findMeetingLink(client, series)
    permanent =
      link?.permanentMeeting === undefined
        ? undefined
        : await client.findOne(love.class.PermanentMeeting, { _id: link.permanentMeeting })
    group = link?.group
    room = permanent?.room ?? link?.room
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

  // Recurring is read from the period on the meeting: an occurrence alone cannot tell.
  $: isRecurring = (permanent?.repeatEvery ?? 0) > 0

  let groups: MeetingGroup[] = []
  const groupQuery = createQuery()
  groupQuery.query(love.class.MeetingGroup, {}, (res) => {
    groups = res
  })

  let rooms: Room[] = []
  const roomQuery = createQuery()
  roomQuery.query(love.class.Room, {}, (res) => {
    rooms = res
  })

  // The guest list of the meeting: the people of the series and the guests addressed by mail.
  let people: Person[] = []
  const peopleQuery = createQuery()
  peopleQuery.query(contact.class.Person, {}, (res) => {
    people = res
  })

  let attendees: Ref<Person>[] = []
  let guests: string[] = []
  $: attendees = [...(liveEvent.participants ?? [])]
  $: guests = [...(liveEvent.externalParticipants ?? [])]

  function personName (id: Ref<Person>): string {
    const person = people.find((it) => it._id === id)
    return person === undefined ? '' : getName(client.getHierarchy(), person)
  }

  function guestLabel (value: string): string {
    const parsed = value.match(/^(.*) <(.+)>$/)
    return parsed?.[1] !== undefined && parsed[1] !== '' ? parsed[1] : value
  }

  // A recurring meeting runs in the workspace room; a one-off one names the room it was placed in.
  // A personal office carries no name of its own and reads as the person behind it.
  let roomLabel = ''
  $: void resolveRoomLabel(isRecurring, rooms, room)

  async function resolveRoomLabel (recurring: boolean, all: Room[], own: Ref<Room> | undefined): Promise<void> {
    const target = recurring ? all.find((it) => it._id === love.ids.ScheduledRoom) : all.find((it) => it._id === own)
    if (target === undefined) {
      roomLabel = ''
      return
    }
    if (target.name !== '') {
      roomLabel = target.name
      return
    }
    // An office room keeps its owner in `person` and has no name of its own.
    const owner = (target as { person?: Ref<Person> }).person
    const person = owner === undefined ? undefined : await client.findOne(contact.class.Person, { _id: owner })
    roomLabel = person?.name ?? ''
  }

  // The meeting is open while the service holds a session for it. Read with a targeted query, not
  // with the office store: that one is a module with its own startup work, and pulling it into the
  // plugin's import path broke the plugin's own load.
  let liveSessionId: Ref<MeetingMinutes> | undefined
  const sessionQuery = createQuery()
  $: sessionQuery.query(
    love.class.MeetingMinutes,
    permanent === undefined
      ? { eventId: liveEvent.eventId, meetingEnd: { $exists: false } }
      : ({ meeting: permanent._id, meetingEnd: { $exists: false } } as any),
    (res) => {
      liveSessionId = res[0]?._id
    }
  )
  $: live = liveSessionId !== undefined

  // Seats taken in the open session: what the callout counts, and the guest list does not.
  let liveCount = 0
  const seatsQuery = createQuery()
  $: if (liveSessionId !== undefined) {
    seatsQuery.query(love.class.ParticipantInfo, { meeting: liveSessionId }, (res) => {
      liveCount = res.length
    })
  }

  // Loaded on click only: the meeting module carries LiveKit, and the window is opened far more
  // often than a person joins.
  async function joinMeeting (): Promise<void> {
    const { joinMeetingBySession, seriesIdOf } = await import('../meetings')
    if (permanent !== undefined) {
      void joinMeetingBySession(permanent._id, 'meeting')
    } else {
      void joinMeetingBySession(seriesIdOf(liveEvent), 'event')
    }
    dispatch('close')
  }

  $: groupName = groups.find((it) => it._id === group)?.name

  // The organisers of the meeting, read the same way the members editor reads them.
  let organisers: Array<{ id: Ref<Person>, label: string }> = []
  $: void loadOrganisers(permanent)

  async function loadOrganisers (meeting: PermanentMeeting | undefined): Promise<void> {
    const owners = meeting?.owners ?? []
    if (owners.length === 0) {
      organisers = []
      return
    }
    const persons = await client.findAll(contact.class.Person, { personUuid: { $in: owners } })
    // The same format the person presenters use: "Андрей Зайцев", not the raw stored field.
    organisers = persons.map((it) => ({ id: it._id, label: getName(client.getHierarchy(), it) }))
  }

  // A name in a card opens the person's profile, the way every presenter of a person does.
  function openPerson (id: Ref<Person>): void {
    const person = people.find((it) => it._id === id)
    if (person === undefined) return
    void openDoc(client.getHierarchy(), person)
  }

  // The name of the meeting is the way into its card: the series document opens as a panel, and a
  // person reads it without joining - the call starts from "Присоединиться" only.
  function openMeetingCard (): void {
    if (permanent === undefined) return
    void openDoc(client.getHierarchy(), permanent)
    dispatch('close')
  }

  $: zoneName = getTimeZoneName(timeZone) === '' ? timeZone : getTimeZoneName(timeZone)
  $: mode = allDay ? DateRangeMode.DATE : DateRangeMode.DATETIME
  $: hours = Math.max(1, Math.round(((dueDate - startDate) / HOUR) * 10) / 10)

  // The slot read as a sentence: what the mock prints under the title and in the "Время" row.
  let when = ''
  $: void buildWhen(startDate, dueDate, allDay, hours, getCurrentLanguage())

  async function buildWhen (start: number, due: number, whole: boolean, h: number, lang: string): Promise<void> {
    const day = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' })
    const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' })
    when = whole
      ? `${day.format(start)} · ${await translate(love.string.AllDay, {}, lang)}`
      : `${day.format(start)}, ${time.format(start)}–${time.format(due)}, ${await translate(love.string.HoursShort, { hours: h }, lang)}`
  }

  // The rule reads as a phrase ("Every week"), not as a number of days: the period itself is an
  // implementation of the rule, not something a guest has to translate in their head.
  $: repeatDays = Math.max(1, Math.round((permanent?.repeatEvery ?? 0) / DAY))
  $: repeatLabel =
    repeatDays % 30 === 0 ? love.string.EveryMonth : repeatDays % 7 === 0 ? love.string.EveryWeek : love.string.EveryDay

  // The line under the title, in the words the reader would use themselves.
  let summary = ''
  $: void buildSummary(when, isRecurring, repeatLabel, zoneName)

  async function buildSummary (slot: string, recurring: boolean, rule: typeof love.string.EveryDay, zone: string): Promise<void> {
    const lang = getCurrentLanguage()
    const head = await translate(recurring ? rule : love.string.OneOffMeeting, {}, lang)
    summary = `${head} · ${slot} · ${zone}`
  }

  // Reminders are the second field an invitee owns: they live on the person's own copy of the
  // event, so the window writes them straight there. A plural label carries its number, so it is
  // translated here and not in the chip or the menu.
  const REMINDER_STEPS = [5, 15, 30, 60, 1440]
  let reminders: number[] = []
  let remindersLoaded = false
  $: if (!remindersLoaded && liveEvent.reminders !== undefined) {
    reminders = [...liveEvent.reminders]
    remindersLoaded = true
  }
  let reminderOptions: Array<{ id: number, label: string }> = []
  $: void loadReminderOptions(getCurrentLanguage())

  async function loadReminderOptions (lang: string): Promise<void> {
    reminderOptions = await Promise.all(
      REMINDER_STEPS.map(async (minutes) => ({
        id: minutes * MINUTE,
        label:
          minutes % 60 === 0
            ? await translate(calendar.string.DueHours, { hours: minutes / 60 }, lang)
            : await translate(calendar.string.DueMinutes, { minutes }, lang)
      }))
    )
  }

  // Chips are derived from the translated list, so they appear in the interface language and not
  // as a bare cross while the list is still loading.
  $: reminderChips = reminders.map((id) => ({
    id,
    label: reminderOptions.find((it) => it.id === id)?.label ?? ''
  }))

  async function setReminders (value: number[]): Promise<void> {
    reminders = value
    await client.update(liveEvent, { reminders: value })
  }

  // The invitee owns exactly one field of the meeting: their answer, kept on their own copy.
  let rsvp: RsvpStatus | undefined = object.rsvp

  async function answer (status: RsvpStatus): Promise<void> {
    const previous = rsvp
    rsvp = status
    try {
      await client.update(liveEvent, { rsvp: status })
    } catch (err) {
      rsvp = previous
    }
  }

  const answers: Array<[RsvpStatus, typeof love.string.Going]> = [
    ['accepted', love.string.Going],
    ['tentative', love.string.Maybe],
    ['declined', love.string.NotGoing]
  ]

  // The mock's segmented pick: the same three answers, in one control instead of three buttons.
  const answerItems = answers.map(([id, label]) => ({ id, label }))
  // The pick is a draft until it is saved: the action says what it does, and stays off while there
  // is nothing to save.
  let savedAnswer: RsvpStatus | undefined = object.rsvp
  $: answerChanged = rsvp !== savedAnswer

  async function saveAnswer (): Promise<void> {
    if (rsvp === undefined) return
    await answer(rsvp)
    savedAnswer = rsvp
  }
</script>

<!--
  `footerActions` holds the answer row: it is the only action an invitee has, so it sits where a
  save button sits in the organiser's window.
-->
<Dialog
  label={love.string.Meeting}
  width="large"
  hideSubmit={true}
  hideCancel={true}
  on:cancel={() => dispatch('close')}
  on:close={() => dispatch('close')}
>
  <div class="member">
    <p class="member__summary">{summary}</p>

    {#if live}
      <Callout
        tone="info"
        title={love.string.MeetingLive}
        label={liveCount > 0 ? love.string.ParticipantsLive : undefined}
        labelParams={{ count: liveCount }}
      >
        <svelte:fragment slot="actions">
          <Button kind="secondary" size="small" label={love.string.Join} on:click={joinMeeting} />
        </svelte:fragment>
      </Callout>
    {/if}

    <Section label={calendar.string.About} icon={ui.icon.Calendar} level={3}>
      {#if organisers.length > 0}
        <SettingRow label={love.string.Organizer}>
          <span class="member__value">
            {#each organisers as person, index (person.id)}
              {#if index > 0}<span class="member__dash">, </span>{/if}
              <button
                class="member__link"
                type="button"
                on:click={() => {
                  openPerson(person.id)
                }}>{person.label}</button
              >
            {/each}
          </span>
        </SettingRow>
      {/if}
      <SettingRow label={love.string.MeetingName}>
        {#if permanent !== undefined}
          <button class="member__heading member__heading--link" type="button" on:click={openMeetingCard}>
            {title}
          </button>
        {:else}
          <span class="member__heading">{title}</span>
        {/if}
      </SettingRow>
      {#if description !== ''}
        <SettingRow label={love.string.MeetingDescription} stacked>
          <span class="member__text">{description}</span>
        </SettingRow>
      {/if}
      {#if groupName !== undefined}
        <SettingRow label={love.string.MeetingGroup}>
          <span class="member__value"><Label label={getEmbeddedLabel(groupName)} /></span>
        </SettingRow>
      {/if}
    </Section>

    <Section label={calendar.string.When} icon={ui.icon.Clock} level={3}>
      {#if isRecurring}
        <SettingRow label={love.string.MeetingType}>
          <span class="member__value">
            <Label label={love.string.RecurringMeeting} />
          </span>
        </SettingRow>
      {/if}
      <SettingRow label={love.string.Time}>
        <span class="member__value">{when}</span>
      </SettingRow>
      <SettingRow label={love.string.TimeZone}>
        <span class="member__value">{zoneName}</span>
      </SettingRow>
      {#if isRecurring}
        <SettingRow label={love.string.RepeatView}>
          <span class="member__value"><Label label={repeatLabel} /></span>
          <svelte:fragment slot="details">
            <span class="member__note">
              <Label label={love.string.NextOccurrence} />:
              <DateLabel value={startDate} mode={mode} showIcon={false} />
            </span>
          </svelte:fragment>
        </SettingRow>
      {/if}
    </Section>

    {#if roomLabel !== ''}
      <Section label={calendar.string.Where} icon={ui.icon.DoorOpen} level={3}>
        <SettingRow label={love.string.Room} hint={isRecurring ? love.string.ScheduledRoomHint : undefined}>
          <span class="member__value"><Label label={getEmbeddedLabel(roomLabel)} /></span>
        </SettingRow>
      </Section>
    {/if}

    {#if attendees.length > 0 || guests.length > 0}
      <Section label={calendar.string.Participants} icon={ui.icon.People} level={3}>
        <MeetingRsvpSummary
          event={liveEvent}
          participants={attendees}
          owners={permanent?.owners ?? []}
          {guests}
        />
      </Section>
    {/if}

    <Section label={calendar.string.Reminders} icon={ui.icon.Bell} level={3}>
      <SettingRow label={calendar.string.Remember} let:labelId>
        <Toggle
          aria-labelledby={labelId}
          checked={reminders.length > 0}
          on:change={(event) => {
            void setReminders(event.detail ? [15 * MINUTE] : [])
          }}
        />
      </SettingRow>
      <SettingRow label={calendar.string.ReminderTime}>
        <div class="member__field">
          <MenuButton
            kind="secondary"
            size="medium"
            icon={ui.icon.Plus}
            label={calendar.string.AddReminder}
            items={reminderOptions.map((it) => ({ id: it.id, label: getEmbeddedLabel(it.label) }))}
            selected={reminders}
            multiselect
            disabled={reminders.length === 0}
            on:selected={(event) => {
              void setReminders([...event.detail].sort((a, b) => a - b))
            }}
          />
        </div>
        <svelte:fragment slot="details">
          {#each reminderChips as item (item.id)}
            <Chip
              label={getEmbeddedLabel(item.label)}
              kind="neutral"
              size="small"
              removable
              on:remove={() => {
                void setReminders(reminders.filter((it) => it !== item.id))
              }}
            />
          {/each}
        </svelte:fragment>
      </SettingRow>
    </Section>
  </div>

  <svelte:fragment slot="footerStart">
    <div class="member__answer">
      <span class="member__caption"><Label label={love.string.MyResponse} /></span>
      <SegmentedControl
        items={answerItems}
        selected={rsvp}
        size="medium"
        aria-label="Мой ответ"
        on:select={(event) => {
          rsvp = event.detail
        }}
      />
    </div>
  </svelte:fragment>

  <svelte:fragment slot="footerActions">
    <Button kind="secondary" size="medium" icon={ui.icon.Play} label={love.string.Join} on:click={joinMeeting} />
    {#if answerChanged}
      <Button
        kind="brand"
        size="medium"
        label={love.string.SaveAnswer}
        on:click={() => {
          void saveAnswer()
        }}
      />
    {:else}
      <Button kind="secondary" size="medium" icon={ui.icon.Check} label={love.string.ResponseSaved} disabled />
    {/if}
  </svelte:fragment>
</Dialog>

<style lang="scss">
  .member {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);

    &__summary {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.125rem;
      color: var(--global-secondary-TextColor);
    }
    &__value {
      font-size: 0.875rem;
      text-align: end;
      color: var(--global-primary-TextColor);
    }
    // The name of the meeting opens its card, so it behaves as a link while keeping the heading's
    // look: the type comes from `__heading` below, this rule only resets the button.
    &__heading--link {
      margin: 0;
      padding: 0;
      border: none;
      background: none;
      font: inherit;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }
    // The name of the meeting reads a step louder than its caption, as the mock has it.
    &__heading {
      font-size: 0.875rem;
      font-weight: 600;
      text-align: end;
      color: var(--global-primary-TextColor);
    }
    &__text {
      font-size: 0.875rem;
      white-space: pre-wrap;
      color: var(--global-primary-TextColor);
    }
    // The caption never breaks: beside the segments it has to stay on one line, as in the mock.
    &__caption {
      flex: 0 0 auto;
      font-size: 0.875rem;
      white-space: nowrap;
      color: var(--global-secondary-TextColor);
    }
    // A name is a way into the person's profile: a plain button, so the row keeps its look.
    &__link {
      margin: 0;
      padding: 0;
      border: none;
      background: none;
      font: inherit;
      color: var(--global-primary-TextColor);
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }
    &__chip {
      margin: 0;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
    }
    &__dash {
      color: var(--global-secondary-TextColor);
    }
    &__note {
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
    }
    &__field {
      width: auto;
      min-width: 0;
    }
    // The meeting is open right now: one line with the only action that matters while it runs.
    &__live {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-2_5);
      border-radius: var(--medium-BorderRadius);
      background-color: var(--theme-state-positive-background-color);
    }
    &__live-text {
      font-size: 0.875rem;
      color: var(--theme-state-positive-color);
    }
    &__saved {
      font-size: 0.75rem;
      color: var(--button-disabled-LabelColor);

      &--on {
        color: var(--theme-state-positive-color);
      }
    }
    // One row, as in the mock: the caption sits beside the segments, not above them. The dialog
    // footer brings its own padding and divider, so this rule adds neither.
    &__answer {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: var(--spacing-2);
      font-size: 0.875rem;
      color: var(--global-secondary-TextColor);
    }
  }
</style>
