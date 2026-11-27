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
  import calendar, { type Event, type RsvpMembers } from '@hcengineering/calendar'
  import { AddParticipant } from '@hcengineering/calendar-resources'
  import type { Person } from '@hcengineering/contact'
  import contact, { getCurrentEmployee, getCurrentEmployeeSpace, getName } from '@hcengineering/contact'
  import { DateRangeMode, getCurrentAccount, type DocumentUpdate, type Ref } from '@hcengineering/core'
  import {
    defaultMeetingAccess,
    type MeetingAccess,
    type MeetingEventLink,
    type MeetingGroup,
    type MeetingLinkKind,
    type PermanentMeeting,
    type Room
  } from '@hcengineering/love'
  import { getEmbeddedLabel, translate } from '@hcengineering/platform'
  import presentation, { copyTextToClipboard, createQuery, getClient } from '@hcengineering/presentation'
  import ui, {
    EditBox,
    Label,
    TimeZonesPopup,
    convertTimeZone,
    eventToHTMLElement,
    getTimeZoneName,
    getUserTimezone,
    showPopup,
    type IconComponent,
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
    type ChipTone,
    type DropdownItem
  } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'
  import { getCurrentLanguage } from '@hcengineering/theme'
  import love from '../plugin'
  import { findMeetingLink } from '../meetingLink'
  import { getLoveClient } from '../loveClient'
  import {
    findPrimaryCalendarId,
    updatePermanentMeetingWithSchedule,
    type PermanentMeetingInput,
    type ScheduleContext
  } from '../permanentMeetingSchedule'
  import { descriptionMarkup, descriptionText } from '../description'
  import { getEventMeetingLink, notifyCopied, withPassword } from '../utils'
  import { isPermanentMeetingCreator } from '../permissions'
  import MeetingRsvpSummary from './MeetingRsvpSummary.svelte'
  import { openDoc } from '@hcengineering/view-resources'

  export let object: Event
  // Passed by the popup host; declared so the framework does not warn about an unknown prop.
  export let popupOptions: PopupOptions | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const me = getCurrentAccount()
  // The organiser answers nothing, so their own chip carries no answer icon.
  const mePerson = getCurrentEmployee()

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
    // A one-off meeting keeps its room on the meeting itself; a series keeps it in the mixin.
    room ??= permanent?.room ?? link?.room
    inCalendar ??= permanent?.calendar !== false
    applyAccess()
    syncRepeat()
  }

  // The access policy lives where the link resolves: on the meeting when there is one, on the
  // series' mixin otherwise - the same two places the link popup writes.
  function applyAccess (): void {
    access = permanent?.meetingAccess ?? link?.meetingAccess ?? defaultMeetingAccess
    passwordSet = access.guestPassword !== undefined
    linkVersion = permanent?.linkVersion ?? link?.linkVersion ?? 1
    plainPassword = undefined
    void loadLink()
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
    description = descriptionText(event.description)
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
  let description: string = descriptionText(object.description)
  let startDate: number = object.date
  let dueDate: number = object.dueDate
  let allDay: boolean = object.allDay
  let timeZone: string = object.timeZone ?? getUserTimezone()
  let reminders: number[] = [...(object.reminders ?? [])]
  let participants: Ref<Person>[] = [...object.participants]
  let externalParticipants: string[] = [...(object.externalParticipants ?? [])]

  // The picker lists the people of the workspace; the chips read the names back by id.
  let people: Person[] = []
  const peopleQuery = createQuery()
  peopleQuery.query(contact.class.Person, {}, (res) => {
    people = res
  })

  // A guest is addressed by mail: the meeting arrives as a link, no account is needed.
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  let guestOpen = false
  let guestName = ''
  let guestEmail = ''
  $: guestEmailValid = EMAIL.test(guestEmail.trim())

  function guestLabel (value: string): string {
    const parsed = value.match(/^(.*) <(.+)>$/)
    return parsed?.[1] !== undefined && parsed[1] !== '' ? parsed[1] : value
  }

  function addGuest (): void {
    const email = guestEmail.trim()
    if (!EMAIL.test(email)) return
    const name = guestName.trim()
    externalParticipants = [...externalParticipants, name === '' ? email : `${name} <${email}>`]
    guestName = ''
    guestEmail = ''
    guestOpen = false
  }

  function removeGuest (value: string): void {
    externalParticipants = externalParticipants.filter((it) => it !== value)
  }

  // The standard calendar picker: a search over the workspace people, and a typed address becomes a
  // guest - the same control the event editor uses.
  let addOpen = false

  function addParticipant (id: Ref<Person>): void {
    if (id === undefined || participants.includes(id)) return
    participants = [...participants, id]
  }

  function addGuestEmail (value: string): void {
    const email = value.trim()
    if (!EMAIL.test(email) || externalParticipants.includes(email)) return
    externalParticipants = [...externalParticipants, email]
  }

  function removeParticipant (id: string): void {
    participants = participants.filter((it) => (it as string) !== id)
  }

  // The name reads the way every person presenter in the app reads it, not as the raw stored field.
  $: selectedItems = participants.map((id) => {
    const person = people.find((it) => it._id === id)
    return {
      id: id as string,
      label: getEmbeddedLabel(person === undefined ? '' : getName(client.getHierarchy(), person))
    }
  })

  // What each participant answered: the server keeps the answers on the event, so a chip can say
  // it too, with the same icon the calendar puts on the event itself.
  let answers: RsvpMembers | undefined = object.rsvpMembers
  const answerQuery = createQuery()
  $: answerQuery.query(live._class, { _id: live._id }, (res) => {
    const found = res[0] as Event | undefined
    if (found?.rsvpMembers !== undefined) answers = found.rsvpMembers
  })
  $: marks = answerMarks(answers)

  interface AnswerMark {
    tone: ChipTone | undefined
    icon: IconComponent
  }

  // Silence is a state of its own, and the clock is the icon the calendar gives it.
  const silent: AnswerMark = { tone: undefined, icon: ui.icon.Clock }

  function answerMarks (members: RsvpMembers | undefined): Map<string, AnswerMark> {
    const res = new Map<string, AnswerMark>()
    for (const ref of members?.accepted ?? []) {
      res.set(ref, { tone: 'positive', icon: ui.icon.CheckCircle })
    }
    for (const ref of members?.tentative ?? []) {
      res.set(ref, { tone: 'regular', icon: ui.icon.Clock })
    }
    for (const ref of members?.declined ?? []) {
      res.set(ref, { tone: 'negative', icon: ui.icon.CrossCircle })
    }
    return res
  }

  // A participant is a way into their profile, as everywhere else in the app.
  function openPerson (id: string): void {
    const person = people.find((it) => it._id === id)
    if (person === undefined) return
    void openDoc(client.getHierarchy(), person)
  }

  let room: Ref<Room> | undefined
  let group: Ref<MeetingGroup> | undefined
  let inCalendar: boolean | undefined
  let repeatCount = 1
  let repeatUnit: 'day' | 'week' | 'month' = 'week'

  // Link access. The address is minted by the server and is not a stored field: it is asked for
  // once the meeting is resolved, and again after a revoke.
  let access: MeetingAccess = defaultMeetingAccess
  let passwordSet = false
  // The server keeps a hash only, so a password typed here is the only plaintext a copied link can
  // carry; a window reopened later has to ask for it again.
  let plainPassword: string | undefined
  let linkUrl = ''
  let linkBusy = false
  // The version is what the server turns into the address; kept here too, so a second revoke in the
  // same window does not write the same number again and answer with the same link.
  let linkVersion = 1
  let editingPassword = false
  let passwordInput = ''

  // A series built by a meeting is not a target of its own: the link, the password and the revoke
  // all belong to the meeting, otherwise the same meeting answers with two URLs.
  function linkTarget (): { pointer: string | undefined, kind: MeetingLinkKind } {
    return permanent !== undefined
      ? { pointer: permanent._id, kind: 'meeting' }
      : { pointer: live.eventId, kind: 'event' }
  }

  const startItems: Array<DropdownItem<'members' | 'link'>> = [
    { id: 'members', label: love.string.StartMembersOnly },
    { id: 'link', label: love.string.StartAnyoneWithLink }
  ]

  async function loadLink (): Promise<void> {
    const { pointer, kind } = linkTarget()
    linkUrl = pointer === undefined ? '' : await getEventMeetingLink(pointer, kind)
  }

  async function saveAccess (update: Partial<MeetingAccess>): Promise<void> {
    access = { ...access, ...update }
    if (permanent !== undefined) {
      await client.update(permanent, { meetingAccess: access })
      return
    }
    await client.updateMixin(live._id, live._class, live.space, love.mixin.MeetingEventLink, {
      meetingAccess: access
    })
  }

  // The password and the revoke are server calls: one click at a time, or the same request goes twice.
  async function savePassword (): Promise<void> {
    const { pointer, kind } = linkTarget()
    if (linkBusy || pointer === undefined || passwordInput === '') return
    linkBusy = true
    try {
      await getLoveClient().setGuestPassword(pointer, passwordInput, kind)
      plainPassword = passwordInput
      passwordSet = true
      passwordInput = ''
      editingPassword = false
    } finally {
      linkBusy = false
    }
  }

  async function removePassword (): Promise<void> {
    const { pointer, kind } = linkTarget()
    if (linkBusy || pointer === undefined) return
    linkBusy = true
    try {
      await getLoveClient().setGuestPassword(pointer, null, kind)
      plainPassword = undefined
      passwordSet = false
    } finally {
      linkBusy = false
    }
  }

  async function copyLink (): Promise<void> {
    if (linkUrl === '') return
    await copyTextToClipboard(linkUrl)
    await notifyCopied(love.string.LinkCopied)
  }

  async function copyLinkWithPassword (): Promise<void> {
    if (linkUrl === '') return
    if (plainPassword === undefined || plainPassword === '') {
      // Nothing to put into the link yet: ask for the password with the same field the row uses.
      passwordInput = ''
      editingPassword = true
      return
    }
    await copyTextToClipboard(withPassword(linkUrl, plainPassword))
    await notifyCopied(love.string.LinkCopied)
  }

  async function revokeLink (): Promise<void> {
    if (linkBusy) return
    linkBusy = true
    try {
      // The version is what the server hashes into the address, so bumping it replaces the link: a
      // series can be revoked on the document it was opened from, and a meeting on its own.
      linkVersion += 1
      if (permanent !== undefined) {
        await client.update(permanent, { linkVersion })
      } else {
        await client.updateMixin(live._id, live._class, live.space, love.mixin.MeetingEventLink, {
          linkVersion
        })
      }
      await loadLink()
    } finally {
      linkBusy = false
    }
  }

  let groups: MeetingGroup[] = []
  const groupQuery = createQuery()
  groupQuery.query(love.class.MeetingGroup, {}, (res) => {
    groups = res
  })

  // A meeting is configured by its creator, by the rule the card resolver uses as well. A series
  // without a meeting document has no owners to read and keeps the calendar rights.
  $: canEdit =
    permanent === undefined ||
    isPermanentMeetingCreator(permanent, { uuid: me.uuid, primarySocialId: me.primarySocialId })

  // A recurring meeting runs in the workspace room and has no choice of its own; a one-off meeting
  // is placed in a room of its own, so only it offers the list.
  $: isRecurring = (permanent?.repeatEvery ?? 0) > 0

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

  // Read here rather than from the office store: the store is filled when the office page loads,
  // and a meeting opened from the calendar has no office behind it - the room list came out empty.
  let rooms: Room[] = []
  const roomQuery = createQuery()
  roomQuery.query(love.class.Room, {}, (res) => {
    rooms = res
  })

  $: roomItems = rooms
    .filter((it) => it._id !== love.ids.Reception)
    // A personal office carries no name of its own: it reads as the person behind it, otherwise a
    // dozen of them showed up as a dozen identical "Комната" rows.
    .map((it) => {
      if (it.name !== '') return { id: it._id as string, label: getEmbeddedLabel(it.name) }
      const owner = (it as { person?: Ref<Person> }).person
      const person = owner === undefined ? undefined : people.find((p) => p._id === owner)
      return {
        id: it._id as string,
        label: getEmbeddedLabel(person === undefined ? '' : getName(client.getHierarchy(), person))
      }
    })

  // A permanent meeting runs in the workspace room and has no choice of its own: the row reads
  // the room's name instead of offering a list.
  $: scheduledRoom = rooms.find((it) => it._id === love.ids.ScheduledRoom)

  // Labels are translated here, not in the menu: the menu takes one `params` for every item, so a
  // plural label lost its number and came out as a raw string id.
  type ReminderItem = DropdownItem<number>
  let reminderItems: ReminderItem[] = []
  let pickedReminders: ReminderItem[] = []
  $: void loadReminderItems(getCurrentLanguage())

  async function loadReminderItems (lang: string): Promise<void> {
    const labels = await Promise.all([
      translate(calendar.string.DueMinutes, { minutes: 5 }, lang),
      translate(calendar.string.DueMinutes, { minutes: 15 }, lang),
      translate(calendar.string.DueMinutes, { minutes: 30 }, lang),
      translate(calendar.string.DueHours, { hours: 1 }, lang),
      translate(calendar.string.DueDays, { days: 1 }, lang)
    ])
    reminderItems = [
      { id: 5 * MINUTE, label: getEmbeddedLabel(labels[0]) },
      { id: 15 * MINUTE, label: getEmbeddedLabel(labels[1]) },
      { id: 30 * MINUTE, label: getEmbeddedLabel(labels[2]) },
      { id: HOUR, label: getEmbeddedLabel(labels[3]) },
      { id: DAY, label: getEmbeddedLabel(labels[4]) }
    ]
  }

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

  // The times before "all day" was turned on: switching the day off has to bring the slot back,
  // not reset it to midnight plus an hour.
  let timedStart: number | undefined
  let timedDue: number | undefined

  function changeAllDay (value: boolean): void {
    allDay = value
    if (value) {
      timedStart = startDate
      timedDue = dueDate
      startDate = new Date(startDate).setHours(0, 0, 0, 0)
      dueDate = new Date(dueDate).setHours(23, 59, 59, 999)
    } else {
      const start = timedStart ?? startDate
      startDate = start
      dueDate = timedDue ?? start + defaultDuration
      timedStart = undefined
      timedDue = undefined
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

  // The repeat of a meeting lives in two places: the period on the meeting and the rule of its
  // series. Writing only the meeting left the calendar untouched, so a change of the period looked
  // like it did nothing. The schedule helper writes both.
  async function saveSchedule (): Promise<void> {
    if (permanent === undefined) return
    const calendarId = await findPrimaryCalendarId(client)
    if (calendarId === undefined) return
    const account = getCurrentAccount()
    const ctx: ScheduleContext = {
      calendarId,
      space: getCurrentEmployeeSpace(),
      timeZone,
      me: account.uuid,
      primarySocialId: account.primarySocialId,
      language: getCurrentLanguage(),
      setGuestPassword: async (meeting, value) => {
        await getLoveClient().setGuestPassword(meeting, value, 'meeting')
      }
    }
    const input: PermanentMeetingInput = {
      name: title.trim(),
      startDate,
      duration: Math.max(15 * MINUTE, dueDate - startDate),
      description: descriptionMarkup(description),
      allDay,
      timeZone,
      // A recurring meeting keeps its period on the meeting and its rule in the series; a one-off
      // has neither, and owns the room its single session runs in.
      ...(isRecurring
        ? { period: repeatCount * (repeatUnit === 'day' ? DAY : repeatUnit === 'week' ? WEEK : 30 * DAY) }
        : { room }),
      members: permanent.members,
      // The meeting keeps one lead time; the calendar keeps the whole list.
      reminderBefore: reminders.length > 0 ? Math.min(...reminders) : 0,
      reminders,
      group,
      calendar: inCalendar ?? permanent.calendar !== false
    }
    await updatePermanentMeetingWithSchedule(client, permanent, input, ctx)
  }

  // The window owns a meeting, so deleting it belongs here: the series goes, and its meeting
  // document with it - a meeting document left behind would keep the link and the owners.
  async function removeMeeting (): Promise<void> {
    if (!canEdit || saving) return
    saving = true
    try {
      await client.removeDoc(live._class, live.space, live._id)
      if (permanent !== undefined) {
        await client.removeDoc(permanent._class, permanent.space, permanent._id)
      }
      dispatch('close')
    } finally {
      saving = false
    }
  }

  async function save (): Promise<void> {
    if (!canEdit) return
    if (saving || title.trim() === '') return
    saving = true
    try {
      // A permanent meeting is written through its schedule: otherwise the series keeps the old rule.
      if (permanent !== undefined) await saveSchedule()

      const update: DocumentUpdate<Event> = {}
      if (live.title !== title.trim()) update.title = title.trim()
      if (descriptionText(live.description) !== description.trim()) {
        update.description = descriptionMarkup(description)
      }
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
        if (permanent.group !== group) meetingUpdate.group = group
        // The room of a one-off meeting lives on the meeting: its series is the session that runs there.
        if (!isRecurring && room !== undefined && permanent.room !== room) meetingUpdate.room = room
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
  hideSubmit={!canEdit}
  cancelLabel={canEdit ? ui.string.Cancel : ui.string.Close}
  submitKind="brand"
  canSubmit={title.trim() !== ''}
  loading={saving}
  on:submit={save}
  on:cancel={() => dispatch('close')}
  on:close={() => dispatch('close')}
>
  <svelte:fragment slot="footerStart">
    <Button
      kind="negative-ghost"
      size="medium"
      icon={ui.icon.Trash}
      label={ui.string.Remove}
      on:click={() => {
        void removeMeeting()
      }}
    />
  </svelte:fragment>

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
          <TextInput
            bind:value={title}
            placeholder={love.string.MeetingName}
            size="medium"
            fullWidth
            disabled={!canEdit}
            autofocus={canEdit}
          />
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
            readonly={!canEdit}
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
              disabled={!canEdit}
              on:selected={(event) => (group = event.detail)}
            />
          </div>
        </SettingRow>
      {/if}
      <SettingRow label={love.string.MeetingType}>
        <span class="meeting__value">
          <Label label={isRecurring ? love.string.RecurringMeeting : love.string.OneOffMeeting} />
        </span>
      </SettingRow>
    </Section>

    <Section label={calendar.string.When} icon={ui.icon.Clock} level={3}>
      <SettingRow label={love.string.AllDay} hint={love.string.AllDayHint} let:labelId>
        <Toggle
          aria-labelledby={labelId}
          checked={allDay}
          disabled={!canEdit}
          on:change={(event) => {
            changeAllDay(event.detail)
          }}
        />
      </SettingRow>
      <SettingRow label={calendar.string.Date} stacked>
        <div class="meeting__range">
          <DateSelect
            value={startDate}
            mode={timeMode}
            size="medium"
            fullWidth
            disabled={!canEdit}
            on:change={changeStart}
          />
          <span class="meeting__dash">—</span>
          <DateSelect
            value={dueDate}
            mode={timeMode}
            size="medium"
            fullWidth
            disabled={!canEdit}
            on:change={changeDue}
          />
        </div>
      </SettingRow>
      <SettingRow label={love.string.TimeZone}>
        <div class="meeting__field meeting__field--zone">
          <Button kind="secondary" size="medium" hasMenu disabled={!canEdit} on:click={pickTimeZone}>
            {zoneName}
          </Button>
        </div>
      </SettingRow>
      {#if isRecurring}
        <SettingRow label={love.string.RepeatEvery}>
          <div class="meeting__control">
            <div class="meeting__number">
              <NumberInput bind:value={repeatCount} min={1} max={365} size="medium" disabled={!canEdit} />
            </div>
            <div class="meeting__field meeting__field--unit">
              <Dropdown
                items={repeatItems}
                selected={repeatUnit}
                size="medium"
                kind="secondary"
                fullWidth
                disabled={!canEdit}
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
      {#if !isRecurring}
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
              disabled={!canEdit}
              on:selected={(event) => (room = event.detail)}
            />
          </div>
        </SettingRow>
      {:else if scheduledRoom !== undefined}
        <!-- A recurring meeting runs in the workspace room: there is nothing to pick. -->
        <SettingRow label={love.string.Room}>
          <span class="meeting__value"><Label label={getEmbeddedLabel(scheduledRoom.name)} /></span>
        </SettingRow>
      {/if}
      {#if permanent !== undefined}
        <SettingRow label={love.string.ShowInCalendar} let:labelId>
          <Toggle
            aria-labelledby={labelId}
            checked={inCalendar ?? true}
            disabled={!canEdit}
            on:change={(event) => (inCalendar = event.detail)}
          />
        </SettingRow>
      {/if}
    </Section>

    <Section label={calendar.string.Participants} icon={ui.icon.People} level={3}>
      <SettingRow label={calendar.string.Participants}>
        <div class="meeting__control">          {#if canEdit}
            <Button
              kind="secondary"
              size="medium"
              icon={ui.icon.PersonPlus}
              label={getEmbeddedLabel('Добавить')}
              on:click={() => (addOpen = !addOpen)}
            />
            <Button
              kind="secondary"
              size="medium"
              icon={ui.icon.At}
              label={getEmbeddedLabel('Пригласить')}
              on:click={() => (guestOpen = !guestOpen)}
            />
          {/if}
        </div>
        <svelte:fragment slot="details">
          {#if addOpen}
            <div class="meeting__invite">
              <div class="meeting__invite-email">
                <AddParticipant
                  placeholder={presentation.string.Search}
                  excluded={participants}
                  focusable
                  fullSize
                  autoFocus
                  on:ref={(event) => { addParticipant(event.detail) }}
                  on:enter={(event) => { addGuestEmail(event.detail) }}
                />
              </div>
            </div>
          {/if}
          <MeetingRsvpSummary
            event={live}
            {participants}
            owners={permanent?.owners ?? []}
            guests={externalParticipants}
            expandable={false}
          />
          {#each selectedItems as item (item.id)}
            {@const mark = item.id === mePerson ? undefined : (marks.get(item.id) ?? silent)}
            <button
              class="meeting__chip"
              type="button"
              on:click={() => {
                openPerson(item.id)
              }}
            >
              <Chip
                label={item.label}
                kind={mark === undefined ? 'neutral' : 'tint'}
                tone={mark?.tone}
                icon={mark?.icon}
                size="small"
                removable={canEdit}
                on:remove={() => { removeParticipant(item.id) }}
              />
            </button>
          {/each}
          {#each externalParticipants as guest (guest)}
            <Chip
              label={getEmbeddedLabel(guestLabel(guest))}
              icon={ui.icon.At}
              kind="outline"
              size="small"
              removable={canEdit}
              on:remove={() => { removeGuest(guest) }}
            />
          {/each}
          {#if guestOpen}
            <div class="meeting__invite">
              <div class="meeting__invite-fields">
                <div class="meeting__invite-name">
                  <TextInput
                    bind:value={guestName}
                    placeholder={getEmbeddedLabel('Имя гостя')}
                    size="medium"
                    fullWidth
                  />
                </div>
                <div class="meeting__invite-email">
                  <TextInput
                    bind:value={guestEmail}
                    placeholder={getEmbeddedLabel('Почта')}
                    size="medium"
                    fullWidth
                  />
                </div>
                <Button
                  kind="secondary"
                  size="medium"
                  label={getEmbeddedLabel('Пригласить')}
                  disabled={!guestEmailValid}
                  on:click={addGuest}
                />
                <Button
                  kind="ghost"
                  size="medium"
                  icon={ui.icon.Close}
                  on:click={() => (guestOpen = false)}
                />
              </div>
              <span class="meeting__note">
                <Label label={getEmbeddedLabel('Гость получит приглашение на почту и ссылку на встречу — аккаунт ему не нужен')} />
              </span>
            </div>
          {:else if externalParticipants.length === 0 && participants.length === 0}
            <span class="meeting__note"><Label label={getEmbeddedLabel('Пока никого: встречу можно открыть по ссылке')} /></span>
          {/if}
        </svelte:fragment>
      </SettingRow>
    </Section>

    {#if canEdit}
      <Section label={love.string.MeetingLinkAccess} icon={ui.icon.Link} level={3}>
        <SettingRow label={love.string.WhoCanStart}>
        <div class="meeting__field">
          <Dropdown
            items={startItems}
            selected={access.start}
            size="medium"
            kind="secondary"
            fullWidth
            on:selected={(event) => {
              void saveAccess({ start: event.detail })
            }}
          />
        </div>
      </SettingRow>
      <SettingRow label={love.string.GuestPassword}>
        <div class="meeting__control">
          {#if passwordSet}
            <Chip label={love.string.PasswordSet} tone="positive" kind="neutral" size="small" />
            <Button
              kind="ghost"
              size="medium"
              label={love.string.ChangePassword}
              on:click={() => {
                passwordInput = ''
                editingPassword = true
              }}
            />
            <Button
              kind="negative-ghost"
              size="medium"
              label={love.string.ClearPassword}
              disabled={linkBusy}
              loading={linkBusy}
              on:click={() => {
                void removePassword()
              }}
            />
          {:else}
            <Button
              kind="secondary"
              size="medium"
              label={love.string.SetPassword}
              on:click={() => {
                passwordInput = ''
                editingPassword = true
              }}
            />
          {/if}
        </div>
      </SettingRow>
      {#if editingPassword}
        <SettingRow label={love.string.SetPassword}>
          <div class="meeting__control">
            <div class="meeting__field">
              <EditBox
                bind:value={passwordInput}
                format="password"
                placeholder={love.string.EnterPassword}
                kind="default"
                autoFocus
              />
            </div>
            <Button
              kind="secondary"
              size="medium"
              label={love.string.SetPassword}
              disabled={passwordInput === '' || linkBusy}
              loading={linkBusy}
              on:click={() => {
                void savePassword()
              }}
            />
          </div>
        </SettingRow>
      {/if}
      <SettingRow label={love.string.MeetingLink}>
        <div class="meeting__control">
          <div class="meeting__field meeting__field--link">
            <TextInput value={linkUrl} readonly placeholder={love.string.MeetingLink} size="medium" fullWidth />
          </div>
          <Button
            kind="secondary"
            size="medium"
            icon={ui.icon.Copy}
            disabled={linkUrl === ''}
            on:click={() => {
              void copyLink()
            }}
          />
        </div>
        <svelte:fragment slot="details">
          <div class="meeting__links">
            <Button
              kind="ghost"
              size="small"
              icon={ui.icon.Copy}
              label={love.string.CopyLink}
              disabled={linkUrl === ''}
              on:click={() => {
                void copyLink()
              }}
            />
            {#if passwordSet}
              <Button
                kind="ghost"
                size="small"
                icon={ui.icon.Key}
                label={love.string.CopyLinkWithPassword}
                disabled={linkUrl === ''}
                on:click={() => {
                  void copyLinkWithPassword()
                }}
              />
            {/if}
            <Button
              kind="negative-ghost"
              size="small"
              label={love.string.RevokeLink}
              disabled={linkBusy}
              loading={linkBusy}
              on:click={() => {
                void revokeLink()
              }}
            />
          </div>
        </svelte:fragment>
      </SettingRow>
      </Section>
    {/if}

    <Section label={calendar.string.Reminders} icon={ui.icon.Bell} level={3}>
      <SettingRow label={calendar.string.Remember} let:labelId>
        <Toggle
          aria-labelledby={labelId}
          checked={reminders.length > 0}
          disabled={!canEdit}
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
            disabled={!canEdit || reminders.length === 0}
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
              removable={canEdit}
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
      &--link {
        width: 100%;
      }
    }
    // The copy actions under the link: a link is pasted, not retyped, and a password rides with it.
    &__links {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1);
      padding-top: var(--spacing-0_5);
    }
    &__control {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--spacing-1);
      min-width: 0;
    }
    // The invite of a guest takes the whole line under the row: a name, a mail and the action.
    &__invite {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-0_5);
      width: 100%;
      padding-top: var(--spacing-0_5);
    }
    &__invite-fields {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      min-width: 0;
    }
    &__invite-name {
      width: 12rem;
      min-width: 0;
    }
    &__invite-email {
      flex: 1 1 auto;
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
    // A participant chip is also a way into that person's profile: a bare button keeps the look.
    &__chip {
      margin: 0;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
    }
  }
</style>
