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
  import calendar, { type ReccuringEvent } from '@hcengineering/calendar'
  import { AccountArrayEditor } from '@hcengineering/contact-resources'
  import { getCurrentEmployeeSpace } from '@hcengineering/contact'
  import type { AccountUuid } from '@hcengineering/core'
  import core, { getCurrentAccount } from '@hcengineering/core'
  import type { MeetingGroup, PermanentMeeting, Room } from '@hcengineering/love'
  import { defaultMeetingAccess, type MeetingAccess } from '@hcengineering/love'
  import type { Ref } from '@hcengineering/core'
  import { Card, copyTextToClipboard, createQuery, getClient } from '@hcengineering/presentation'
  import presentation from '@hcengineering/presentation'
  import { getCurrentLanguage } from '@hcengineering/theme'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import ui, {
    convertTimeZone,
    EditBox,
    eventToHTMLElement,
    getTimeZoneName,
    getUserTimezone,
    Label,
    NumberInput,
    showPopup,
    TimeZonesPopup,
    Toggle
  } from '@hcengineering/ui'
  import { Button, Dropdown, TextArea } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'
  import love from '../plugin'
  import { descriptionMarkup, descriptionText } from '../description'
  import RepeatEveryEditor from './RepeatEveryEditor.svelte'
  import RoomSelector from './RoomSelector.svelte'
  import { getLoveClient } from '../loveClient'
  import { getEventMeetingLink, notifyCopied, revokePermanentMeetingLink, withPassword } from '../utils'
  import {
    createPermanentMeetingWithSchedule,
    findPrimaryCalendarId,
    updatePermanentMeetingWithSchedule,
    type PermanentMeetingInput,
    type ScheduleContext,
    withOwners
  } from '../permanentMeetingSchedule'

  export let object: PermanentMeeting | undefined = undefined

  // Offered only where a meeting can be created without a calendar series, and only while creating:
  // an existing meeting keeps the mode it was created with.
  export let allowNoCalendar: boolean = false

  // A meeting created from a group header is born in that group; editing never moves it.
  export let group: Ref<MeetingGroup> | undefined = undefined
  // An existing meeting shows the group it is in, unless the header already passed one.
  if (group === undefined && object?.group !== undefined) group = object.group

  const dispatch = createEventDispatcher()
  const client = getClient()

  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE
  const WEEK = 7 * 24 * HOUR

  // Editing must start from what the document says: a form that defaulted to "half an hour from now"
  // moved a meeting to the present on the first save, and replaced its zone with the reader's own.
  let name: string = object?.name ?? ''
  let description: string = descriptionText(object?.description)
  let startDate: number = object?.startDate ?? Date.now() + 30 * MINUTE
  let dueDate: number = startDate + (object?.duration ?? HOUR)
  const allDay = false
  let timeZone: string = object?.timeZone ?? getUserTimezone()
  // A one-off meeting has no period at all. Defaulting to a week for every edited meeting turned a
  // one-off into a standing one on the first save: that is where "it becomes permanent" came from.
  let period: number | undefined = object === undefined ? WEEK : object.repeatEvery
  // The kind follows the series, not the stored period: a meeting created without a series keeps
  // `repeatEvery` as a leftover of an older build, and reading it made a one-off look repeating.
  let recurring: boolean = object === undefined

  function setRecurring (value: boolean): void {
    kindTouched = true
    recurring = value
    if (value) {
      if (period === undefined) period = WEEK
    } else {
      period = undefined
    }
  }
  // The kind is read from the series after the form is drawn. A click made in the meantime must win:
  // without the flag the answer flipped the switch back under the finger.
  let kindTouched = false

  // A row of a switch is clickable as a whole: only the tiny switch itself used to react, and a click on
  // the caption beside it looked like a dead control.
  function toggleKind (event: Event): void {
    if ((event.target as HTMLElement | null)?.closest('.toggle') != null) return
    setRecurring(!recurring)
  }

  function toggleCalendar (event: Event): void {
    if ((event.target as HTMLElement | null)?.closest('.toggle') != null) return
    inCalendar = !inCalendar
  }
  let inCalendar: boolean = object === undefined ? true : object.event !== undefined || object.calendar !== false
  // The kind comes from the series itself: a repeating event carries rules, a single one does not.
  // One document read by id is enough, and unlike a filter over the link mixin's nested field it
  // always answers - that filter came back empty and the form then called a meeting in the calendar
  // "hidden" and a repeating one "one-off".
  let seriesChecked = object === undefined || object?.event === undefined
  async function initSeriesKind (): Promise<void> {
    if (seriesChecked) return
    seriesChecked = true
    const event = await client.findOne(calendar.class.Event, { _id: object?.event })
    if (event === undefined) return
    const withRules = (event as ReccuringEvent).rules !== undefined
    if (!kindTouched) {
      recurring = withRules
      period = withRules ? (period ?? object?.repeatEvery ?? WEEK) : undefined
    }
  }
  void initSeriesKind()
  // The policy of the guest link lives on the meeting: who may start it, and whether a password is
  // needed. Only `start` is edited here; `past`, `afterTtl` and the password hash stay as they are.
  let startAccess: 'link' | 'members' = object?.meetingAccess?.start ?? defaultMeetingAccess.start
  const startItems = [
    { id: 'link', label: love.string.StartAnyoneWithLink },
    { id: 'members', label: love.string.StartMembersOnly }
  ]
  // Known only for a password set in this window: the server never sends the plaintext back.
  let plainPassword: string | undefined

  function setStart (id: string): void {
    startAccess = id === 'members' ? 'members' : 'link'
  }

  async function copyLink (): Promise<void> {
    if (object === undefined) return
    const link = await getEventMeetingLink(object._id, 'meeting')
    if (link === '') return
    await copyTextToClipboard(link)
    await notifyCopied(love.string.LinkCopied)
  }

  async function copyLinkWithPassword (): Promise<void> {
    if (object === undefined || plainPassword === undefined) return
    const link = await getEventMeetingLink(object._id, 'meeting')
    if (link === '') return
    await copyTextToClipboard(withPassword(link, plainPassword))
    await notifyCopied(love.string.LinkCopied)
  }

  // The link stops being valid for everyone: the meeting itself stays, only the guests lose access.
  async function revokeLink (): Promise<void> {
    if (object === undefined) return
    await revokePermanentMeetingLink(object)
    dispatch('close')
  }

  let members: AccountUuid[] = object?.members ?? []
  let reminderMinutes: number = Math.round((object?.reminderBefore ?? 15 * MINUTE) / MINUTE)
  let password: string = ''
  // The plaintext never comes back from the service: only the hash on the document says whether a
  // password is set. Without that a form would always show an empty field and look broken.
  let passwordSet: boolean = object?.meetingAccess?.guestPassword !== undefined
  let editingPassword = false
  let saving = false

  async function applyPassword (): Promise<void> {
    if (object === undefined || password.trim() === '') return
    await getLoveClient().setGuestPassword(object._id, password.trim(), 'meeting')
    plainPassword = password.trim()
    passwordSet = true
    password = ''
    editingPassword = false
  }

  async function clearPassword (): Promise<void> {
    if (object === undefined) return
    await getLoveClient().setGuestPassword(object._id, null, 'meeting')
    plainPassword = undefined
    passwordSet = false
    password = ''
  }

  $: zoneName = getTimeZoneName(timeZone)

  // The groups a meeting can be moved into, read the way the meeting window reads them.
  const groupQuery = createQuery()
  let groups: MeetingGroup[] = []
  groupQuery.query(love.class.MeetingGroup, {}, (res) => {
    groups = res
  })
  $: groupItems = groups.map((it) => ({ id: it._id as string, label: getEmbeddedLabel(it.name) }))

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

  let room: Ref<Room> | undefined = object?.room

  function membersChanged (value: AccountUuid[]): void {
    // An owner stays a member: the server pushes them back anyway, and a list that shows them gone
    // would be a lie until the next refresh. The creator is an owner on every meeting we write.
    members = withOwners(value, object?.owners ?? [])
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
        duration: Math.max(15 * MINUTE, dueDate - startDate),
        period,
        members,
        description: description.trim(),
        timeZone,
        // A repeating meeting never holds a room: it is an always-open space, and a room would
        // reserve one for every occurrence. A one-off meeting runs in the room it was given.
        ...(room !== undefined && !recurring ? { room } : {}),
        ...(group !== undefined ? { group } : {}),
        // 0 turns the reminder off, absent falls back to the default, so the value is explicit.
        reminderBefore: Math.max(0, Math.round(reminderMinutes)) * MINUTE,
        guestPassword: password !== '' ? password : undefined,
        calendar: inCalendar
      }
      const created = object === undefined ? await createPermanentMeetingWithSchedule(client, input, ctx) : undefined
      if (object !== undefined) {
        await updatePermanentMeetingWithSchedule(client, object, input, ctx)
        // Only the switch is written: the rest of the policy (the password hash, the lifetime) is
        // read back by the server and must survive a save that did not change it.
        await client.update(object, {
          meetingAccess: { ...(object.meetingAccess ?? defaultMeetingAccess), start: startAccess }
        })
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
  okLabel={object === undefined ? presentation.string.Create : presentation.string.Save}
  canSave={name.trim() !== '' && !saving}
  on:close={() => dispatch('close')}
>
  <div class="antiGrid meeting-form">
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.PermanentMeeting} /></div>
      <EditBox
        bind:value={name}
        placeholder={love.string.MeetingName}
        kind="large-style"
        autoFocus
        focusIndex={1}
      />
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.MeetingDescription} /></div>
      <TextArea bind:value={description} placeholder={love.string.MeetingDescription} rows={2} maxRows={5} />
    </div>
    {#if groupItems.length > 0}
      <div class="antiGrid-row">
        <div class="antiGrid-row__header"><Label label={love.string.MeetingGroup} /></div>
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
    {/if}
    <div class="section-divider" />
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.Meetings} /></div>
      <EventTimeEditor bind:startDate bind:dueDate {allDay} {timeZone} focusIndex={2} />
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.TimeZone} /></div>
      <Button kind="secondary" size="medium" hasMenu on:click={pickTimeZone}>{zoneName}</Button>
    </div>
    <div class="antiGrid-row pointer" on:click={toggleKind}>
      <div class="antiGrid-row__header"><Label label={love.string.MeetingType} /></div>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div class="flex-row-center gap-2">
        <Toggle on={recurring} on:change={() => setRecurring(!recurring)} />
        <span class="text-sm content-color">
          <Label label={recurring ? love.string.RecurringMeeting : love.string.OneOffMeeting} />
        </span>
      </div>
    </div>
    {#if recurring}
      <div class="antiGrid-row">
        <div class="antiGrid-row__header"><Label label={love.string.RepeatEvery} /></div>
        <div class="flex-row-center gap-2">
          <RepeatEveryEditor value={period} onChange={changePeriod} />
        </div>
      </div>
    {/if}
    {#if !recurring}
      <div class="antiGrid-row">
        <div class="antiGrid-row__header"><Label label={love.string.MeetingRoom} /></div>
        <RoomSelector
          value={room}
          focusIndex={3}
          on:change={(event) => {
            room = event.detail
          }}
        />
      </div>
    {/if}
    <div class="antiGrid-row pointer" on:click={toggleCalendar}>
      <div class="antiGrid-row__header"><Label label={love.string.ShowInCalendar} /></div>
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div class="flex-row-center gap-2">
        <Toggle
          on={inCalendar}
          on:change={() => {
            inCalendar = !inCalendar
          }}
        />
        {#if !inCalendar}
          <span class="text-sm content-color"><Label label={love.string.ShowInCalendarHint} /></span>
        {/if}
      </div>
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.RemindBeforeMinutes} /></div>
      <div class="flex-row-center gap-2">
        <NumberInput
          bind:value={reminderMinutes}
          minValue={0}
          maxValue={1440}
          maxDigitsAfterPoint={0}
          maxWidth="4rem"
        />
        <span class="text-sm content-color"><Label label={love.string.RemindBefore} /></span>
      </div>
    </div>
    <div class="section-divider" />
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.GuestPassword} /></div>
      {#if object !== undefined && passwordSet && !editingPassword}
        <div class="flex-row-center gap-2">
          <span class="text-sm content-color"><Label label={love.string.PasswordSet} /></span>
          <Button
            kind="ghost"
            size="medium"
            label={love.string.ChangePassword}
            on:click={() => {
              password = ''
              editingPassword = true
            }}
          />
          <Button
            kind="negative-ghost"
            size="medium"
            label={love.string.ClearPassword}
            on:click={() => {
              void clearPassword()
            }}
          />
        </div>
      {:else}
        <div class="flex-row-center gap-2">
          <div class="password-box">
            <EditBox bind:value={password} format="password" placeholder={love.string.EnterPassword} />
          </div>
          {#if object !== undefined}
            <Button
              kind="secondary"
              size="medium"
              label={love.string.SetPassword}
              disabled={password.trim() === ''}
              on:click={() => {
                void applyPassword()
              }}
            />
            {#if editingPassword}
              <Button
                kind="ghost"
                size="medium"
                label={ui.string.Cancel}
                on:click={() => {
                  editingPassword = false
                  password = ''
                }}
              />
            {/if}
          {/if}
        </div>
      {/if}
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.WhoCanStart} /></div>
      <div class="flex-row-center gap-2">
        <!-- The values are saved with the window, the same way the name and the period are. -->
        <Dropdown
          items={startItems}
          selected={startAccess}
          placeholder={love.string.WhoCanStart}
          size="medium"
          kind="secondary"
          on:selected={(event) => {
            setStart(event.detail)
          }}
        />
      </div>
    </div>
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={love.string.GuestLink} /></div>
      <div class="flex-row-center flex-wrap gap-2">
        <Button
          kind="secondary"
          size="medium"
          label={love.string.CopyGuestLink}
          disabled={object === undefined}
          on:click={() => {
            void copyLink()
          }}
        />
        <!-- A password is copied in either form: with the password inside the link and the bare link. -->
        {#if plainPassword !== undefined}
          <Button
            kind="secondary"
            size="medium"
            label={love.string.CopyLinkWithPassword}
            on:click={() => {
              void copyLinkWithPassword()
            }}
          />
        {/if}
        <Button
          kind="negative-ghost"
          size="medium"
          label={love.string.RevokeLink}
          disabled={object === undefined}
          tooltip={{ label: love.string.RevokeLinkTooltip }}
          on:click={() => {
            void revokeLink()
          }}
        />
      </div>
    </div>
    <div class="section-divider" />
    <div class="antiGrid-row">
      <div class="antiGrid-row__header"><Label label={core.string.Members} /></div>
      <AccountArrayEditor
        value={members}
        label={core.string.Members}
        onChange={membersChanged}
        kind="regular"
        size="large"
      />
    </div>
  </div>
</Card>

<style lang="scss">
  // The shared grid puts 8px under every row and gives the caption 15rem: in a form this long the
  // first stacks into uneven gaps and the second pushes every control to the right of one column.
  .meeting-form :global(.antiGrid-row) {
    margin-bottom: 0;
    min-height: 2.25rem;
  }
  .meeting-form :global(.antiGrid-row__header) {
    width: 12rem;
    flex-shrink: 0;
  }
  // A control takes the width it needs instead of stretching across the whole second column.
  .meeting-form :global(.antiGrid-row > :not(.antiGrid-row__header)) {
    max-width: 28rem;
  }
  .meeting-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  // A quiet line between the groups of the window: name, schedule, access, members.
  .section-divider {
    height: 1px;
    margin: 0.5rem 0;
    background-color: var(--theme-divider-color);
    flex-shrink: 0;
  }

  // The password keeps its field next to its button, not across the row.
  .password-box {
    flex: 0 1 16rem;
    min-width: 10rem;
  }
</style>
