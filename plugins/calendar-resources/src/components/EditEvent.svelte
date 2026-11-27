<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
<script lang="ts">
  import type { Event, ReccuringEvent, ReccuringInstance, RecurringRule } from '@hcengineering/calendar'
  import type { Person } from '@hcengineering/contact'
  import type { DocumentUpdate, Ref } from '@hcengineering/core'
  import { DateRangeMode } from '@hcengineering/core'
  import presentation, { ComponentExtensions, getClient } from '@hcengineering/presentation'
  import { StyledTextBox } from '@hcengineering/text-editor-resources'
  import ui, {
    Label,
    convertTimeZone,
    eventToHTMLElement,
    getTimeZoneName,
    getUserTimezone,
    showPopup,
    TimeZonesPopup
  } from '@hcengineering/ui'
  import {
    Button as KitButton,
    Chip,
    DateLabel,
    DateSelect,
    Dialog,
    Dropdown,
    MenuButton,
    Section,
    SettingRow,
    TextInput,
    Toggle,
    type DropdownItem
  } from '@hcengineering/ui/kit'
  import { deepEqual } from 'fast-equals'
  import { createEventDispatcher } from 'svelte'

  import calendar from '../plugin'
  import { isReadOnly, saveUTC, updateReccuringInstance } from '../utils'
  import CalendarSelector from './CalendarSelector.svelte'
  import EventParticipants from './EventParticipants.svelte'
  import EventRsvp from './EventRsvp.svelte'
  import ParticipantsBusy from './ParticipantsBusy.svelte'
  import ReccurancePopup from './ReccurancePopup.svelte'
  import RRulePresenter from './RRulePresenter.svelte'

  export let object: Event
  $: readOnly = isReadOnly(object)

  let title = object.title

  const defaultDuration = 60 * 60 * 1000
  const allDayDuration = 24 * 60 * 60 * 1000 - 1

  let busyPersons = new Set<Ref<Person>>()
  // Slots of a recurring series belong to its master event, an instance has an id of its own.
  $: ignoreEventId = (object as ReccuringInstance).recurringEventId ?? object.eventId

  let startDate = object.date
  const duration = object.dueDate - object.date
  let dueDate = startDate + duration
  let allDay = object.allDay
  let visibility = object.visibility ?? 'public'
  let reminders = [...(object.reminders ?? [])]

  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE
  // The lead times offered by the picker: the same five the meeting window offers.
  const reminderItems: Array<DropdownItem<number>> = [
    { id: 5 * MINUTE, label: calendar.string.DueMinutes, labelParams: { minutes: 5 } },
    { id: 15 * MINUTE, label: calendar.string.DueMinutes, labelParams: { minutes: 15 } },
    { id: 30 * MINUTE, label: calendar.string.DueMinutes, labelParams: { minutes: 30 } },
    { id: HOUR, label: calendar.string.DueHours, labelParams: { hours: 1 } },
    { id: 24 * HOUR, label: calendar.string.DueDays, labelParams: { days: 1 } }
  ]
  const visibilityItems: Array<DropdownItem<string>> = [
    { id: 'public', label: calendar.string.Public },
    { id: 'private', label: calendar.string.Private }
  ]
  // A reminder is either on with the leads picked, or off with none: the switch is the whole state.
  function toggleReminders (on: boolean): void {
    if (readOnly) return
    reminders = on ? (reminders.length > 0 ? reminders : [15 * MINUTE]) : []
  }

  $: pickedReminders = reminderItems.filter((item) => reminders.includes(item.id))
  let _calendar = object.calendar
  let timeZone: string = object.timeZone ?? getUserTimezone()

  let description = object.description
  let location = object.location

  let rules: RecurringRule[] = (object as ReccuringEvent).rules ?? []

  let participants: Ref<Person>[] = [...object.participants]
  let externalParticipants: string[] = [...(object.externalParticipants ?? [])]

  const dispatch = createEventDispatcher()
  const client = getClient()

  // A modal must be dismissible: clicking the overlay or pressing Esc is how a user leaves a popup.
  // The previous rule allowed closing only while the title was empty, which for an existing event is
  // never true, so the popup could not be closed at all.
  export function canClose (): boolean {
    return true
  }

  let saving = false

  async function saveEvent () {
    if (readOnly || saving) {
      return
    }
    saving = true
    try {
      const update: DocumentUpdate<Event> = {}
      if (object.title !== title) {
        update.title = title.trim()
      }
      if (object.description !== description) {
        update.description = description.trim()
      }
      if (object.visibility !== visibility) {
        update.visibility = visibility
      }
      if (object.calendar !== _calendar) {
        update.calendar = _calendar
      }
      if (object.location !== location) {
        update.location = location
      }
      if (object.timeZone !== timeZone) {
        update.timeZone = timeZone
      }
      if (allDay !== object.allDay) {
        update.date = allDay ? saveUTC(startDate) : startDate
        update.dueDate = allDay ? saveUTC(dueDate) : dueDate
        update.allDay = allDay
      } else {
        if (object.date !== startDate) {
          update.date = allDay ? saveUTC(startDate) : startDate
        }
        if (object.dueDate !== dueDate) {
          update.dueDate = allDay ? saveUTC(dueDate) : dueDate
        }
      }
      if (!deepEqual(object.participants, participants)) {
        update.participants = participants
      }
      if (!deepEqual(object.externalParticipants, externalParticipants)) {
        update.externalParticipants = externalParticipants
      }
      if (!deepEqual(object.reminders, reminders)) {
        update.reminders = reminders
      }
      if (rules !== (object as ReccuringEvent).rules) {
        ;(update as DocumentUpdate<ReccuringEvent>).rules = rules
      }

      if (Object.keys(update).length > 0) {
        if (object._class === calendar.class.ReccuringInstance) {
          await updateReccuringInstance(update, object as ReccuringInstance)
        } else {
          await client.update(object, update)
        }
      }
      dispatch('close')
    } finally {
      saving = false
    }
  }

  async function allDayChangeHandler () {
    if (allDay) {
      startDate = new Date(startDate).setHours(0, 0, 0, 0)
      if (dueDate - startDate < allDayDuration) dueDate = allDayDuration + startDate
      else dueDate = new Date(dueDate).setHours(23, 59, 59, 999)
    } else {
      dueDate = startDate + defaultDuration
    }
  }

  // One switch drives both the flag and the dates behind it, the way the old pair of handlers did.
  function changeAllDay (value: boolean): void {
    allDay = value
    void allDayChangeHandler()
  }

  // Moving the start carries the length of the event with it; pulling the end before the start
  // keeps the event at its default hour instead of turning it inside out.
  function changeStart (event: CustomEvent<number | null>): void {
    const value = event.detail
    if (value == null) return
    const length = dueDate - startDate
    startDate = value
    dueDate = startDate + (allDay ? allDayDuration : length)
  }

  function changeDue (event: CustomEvent<number | null>): void {
    const value = event.detail
    if (value == null) return
    dueDate = value > startDate ? value : startDate + defaultDuration
    if (allDay) dueDate = new Date(dueDate).setHours(23, 59, 59, 999)
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

  function changeLocation (value: string): void {
    location = value.trim() === '' ? undefined : value
  }

  $: timeMode = allDay ? DateRangeMode.DATE : DateRangeMode.DATETIME
  // `getTimeZoneName` cuts the continent off; `Etc/GMT` has none, so the id itself is shown instead.
  $: zoneName = getTimeZoneName(timeZone) === '' ? timeZone : getTimeZoneName(timeZone)
  $: noRepeat = object._class !== calendar.class.ReccuringInstance

  function setRecurrance () {
    if (readOnly) {
      return
    }
    showPopup(ReccurancePopup, { rules, startDate }, undefined, (res) => {
      if (res) {
        rules = res
      }
    })
  }
</script>

<!-- The card is the kit dialog, the way the meeting window is built: the screen behind it is dimmed
     by the popup host, the card is the only thing on top of it. -->
<Dialog
  label={calendar.string.Event}
  width="large"
  submitLabel={presentation.string.Save}
  cancelLabel={ui.string.Cancel}
  submitKind="brand"
  canSubmit={!readOnly}
  loading={saving}
  on:submit={saveEvent}
  on:cancel={() => dispatch('close')}
  on:close={() => dispatch('close')}
>
  <div class="eventPopup-body">
    <!-- What the event is, in one sentence, before the first field. -->
    <p class="eventPopup-summary">
      <DateLabel value={startDate} mode={timeMode} showIcon={false} />
      <span class="eventPopup-sep">—</span>
      <DateLabel value={dueDate} mode={timeMode} showIcon={false} />
      <span class="eventPopup-sep">·</span>
      <span>{zoneName}</span>
    </p>

    <Section label={calendar.string.About} icon={ui.icon.Calendar} level={3}>
      <SettingRow label={calendar.string.Title}>
        <div class="eventPopup-field eventPopup-field--wide">
          <TextInput
            bind:value={title}
            placeholder={calendar.string.EventTitlePlaceholder}
            size="medium"
            fullWidth
            disabled={readOnly}
            autofocus
            focusIndex={10001}
          />
        </div>
      </SettingRow>

      <SettingRow label={calendar.string.Description} stacked>
        <div class="eventPopup-description" class:eventPopup-description--readonly={readOnly}>
          <StyledTextBox
            alwaysEdit={true}
            isScrollable={false}
            focusIndex={10007}
            showButtons={false}
            readonly={readOnly}
            placeholder={calendar.string.Description}
            bind:content={description}
          />
        </div>
      </SettingRow>
    </Section>

    <Section label={calendar.string.When} icon={ui.icon.Clock} level={3}>
      <SettingRow label={calendar.string.AllDay} let:labelId>
        <Toggle
          aria-labelledby={labelId}
          checked={allDay}
          disabled={readOnly}
          on:change={(event) => changeAllDay(event.detail)}
        />
      </SettingRow>
      <SettingRow label={calendar.string.Date} stacked>
        <div class="eventPopup-range">
          <DateSelect
            value={startDate}
            mode={timeMode}
            size="medium"
            fullWidth
            disabled={readOnly}
            focusIndex={10004}
            on:change={changeStart}
          />
          <span class="eventPopup-dash">—</span>
          <DateSelect
            value={dueDate}
            mode={timeMode}
            size="medium"
            fullWidth
            disabled={readOnly}
            on:change={changeDue}
          />
        </div>
      </SettingRow>
      <SettingRow label={calendar.string.TimeZone}>
        <div class="eventPopup-field">
          <KitButton
            kind="secondary"
            size="medium"
            hasMenu
            iconRight={ui.icon.ChevronDown}
            disabled={readOnly}
            on:click={pickTimeZone}
          >
            {zoneName}
          </KitButton>
        </div>
      </SettingRow>
      {#if !noRepeat}
        <SettingRow label={calendar.string.Repeat}>
          <div class="eventPopup-field">
            <KitButton kind="secondary" size="medium" hasMenu disabled={readOnly} on:click={setRecurrance}>
              {#if rules.length > 0}
                <RRulePresenter {rules} />
              {:else}
                <Label label={calendar.string.Repeat} />
              {/if}
            </KitButton>
          </div>
        </SettingRow>
      {/if}
    </Section>

    <Section label={calendar.string.Where} icon={ui.icon.DoorOpen} level={3}>
      <SettingRow label={calendar.string.Location}>
        <div class="eventPopup-field">
          <TextInput
            value={location ?? ''}
            placeholder={calendar.string.Location}
            size="medium"
            fullWidth
            disabled={readOnly}
            focusIndex={10005}
            on:input={(event) => changeLocation(event.detail)}
          />
        </div>
      </SettingRow>
      <SettingRow label={calendar.string.Calendar}>
        <div class="eventPopup-field">
          <CalendarSelector bind:value={_calendar} focusIndex={10008} appearance="secondary" />
        </div>
      </SettingRow>
      <SettingRow label={calendar.string.Visibility}>
        <div class="eventPopup-field">
          <Dropdown
            items={visibilityItems}
            selected={visibility}
            size="medium"
            kind="secondary"
            fullWidth
            disabled={readOnly}
            focusIndex={10009}
            on:selected={(event) => (visibility = event.detail)}
          />
        </div>
      </SettingRow>
    </Section>

    <ComponentExtensions extension={calendar.extensions.EditEventExtensions} props={{ readOnly, value: object }} />

    <Section label={calendar.string.Participants} icon={ui.icon.People} level={3}>
      <EventParticipants
        bind:participants
        bind:externalParticipants
        disabled={readOnly}
        focusIndex={10006}
        {busyPersons}
      />
      <ParticipantsBusy {participants} date={startDate} {dueDate} {ignoreEventId} bind:busyPersons />
      <EventRsvp {object} indent />
    </Section>

    <Section label={calendar.string.Reminders} icon={ui.icon.Bell} level={3}>
      <SettingRow label={calendar.string.Remember} let:labelId>
        <Toggle
          aria-labelledby={labelId}
          checked={reminders.length > 0}
          disabled={readOnly}
          on:change={(event) => toggleReminders(event.detail)}
        />
      </SettingRow>
      <SettingRow label={calendar.string.ReminderTime}>
        <div class="eventPopup-field">
          <MenuButton
            kind="secondary"
            size="medium"
            icon={ui.icon.Plus}
            label={calendar.string.AddReminder}
            items={reminderItems}
            selected={reminders}
            multiselect
            disabled={readOnly || reminders.length === 0}
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
              removable={!readOnly}
              on:remove={() => (reminders = reminders.filter((id) => id !== item.id))}
            />
          {/each}
          {#if reminders.length === 0}
            <span class="eventPopup-note"><Label label={calendar.string.NoReminders} /></span>
          {/if}
        </svelte:fragment>
      </SettingRow>
    </Section>
  </div>
</Dialog>

<style lang="scss">
  // The card itself is the kit dialog; these are the blocks inside its body.
  .eventPopup-body {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    min-width: 0;
    min-height: 0;
  }

  // The sentence about when the event happens, above the fields that set it.
  .eventPopup-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-1);
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: var(--global-secondary-TextColor);
  }

  .eventPopup-sep {
    color: var(--global-secondary-TextColor);
  }

  // The two ends of the event share the row of the date field.
  .eventPopup-range {
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

  .eventPopup-dash {
    flex-shrink: 0;
    color: var(--global-secondary-TextColor);
  }

  // A control of a row: it keeps the right edge of the row.
  .eventPopup-field {
    display: flex;
    justify-content: flex-end;
    width: 12rem;
    min-width: 0;

    &--wide {
      width: 100%;
    }
  }

  .eventPopup-description {
    min-width: 0;
    padding-top: var(--spacing-0_5);

    // A read-only description is a text, not a field: it loses the editor's empty box.
    &--readonly {
      min-height: 0;
    }
  }

  // A muted line where the row has nothing to show.
  .eventPopup-note {
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--global-secondary-TextColor);
  }
</style>
