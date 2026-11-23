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
  Draft of the meeting creation window: the kind of meeting is chosen with tabs at the top, and the
  fields below follow that choice. Three kinds the product asks for: a permanent meeting that repeats
  and lives in the calendar, a one-off meeting for a single moment, and a hidden meeting that exists
  only as a link - no series, nothing in the calendar or the planner.
-->
<script lang="ts">
  import { DateRangeMode } from '@hcengineering/core'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import ui, {
    Label,
    TimeZonesPopup,
    convertTimeZone,
    eventToHTMLElement,
    getTimeZoneName,
    getUserTimezone,
    showPopup,
    type TimeZone
  } from '@hcengineering/ui'
  import {
    Button,
    Checkbox,
    DateSelect,
    Dialog,
    Dropdown,
    NumberInput,
    Tabs,
    TextArea,
    TextInput,
    Toggle
  } from '@hcengineering/ui/kit'

  export let variant: 'permanent' | 'one-off' = 'permanent'

  type Kind = 'permanent' | 'one-off'
  type Period = 'day' | 'week' | 'month'

  const HOUR = 60 * 60 * 1000

  let selected: Kind = variant
  let name = ''
  let description = ''
  let remind = true
  // One reminder is not a choice: the intervals are picked from a list, and a meeting usually wants a
  // warning before and a nudge on the day.
  type Ahead = '5' | '10' | '15' | '30' | 'hour' | 'day'
  const ahead: Array<{ id: Ahead, label: IntlString }> = [
    { id: '5', label: getEmbeddedLabel('за 5 минут') },
    { id: '10', label: getEmbeddedLabel('за 10 минут') },
    { id: '15', label: getEmbeddedLabel('за 15 минут') },
    { id: '30', label: getEmbeddedLabel('за 30 минут') },
    { id: 'hour', label: getEmbeddedLabel('за 1 час') },
    { id: 'day', label: getEmbeddedLabel('за 1 день') }
  ]
  let aheadSelected: Ahead[] = ['15', 'hour']
  let password = ''
  let guest = ''
  let repeatCount = 1
  let period: Period = 'week'
  let inCalendar = true
  let allDay = false
  let duration = HOUR
  let start: number = Date.now()
  let due: number = Date.now() + HOUR

  // Two kinds are enough: a hidden meeting is a permanent or a one-off one with the calendar switch
  // off, so a third tab would only repeat that switch.
  const tabs = [
    { id: 'permanent', label: getEmbeddedLabel('Постоянная') },
    { id: 'one-off', label: getEmbeddedLabel('Разовая') }
  ]

  const hints: Record<Kind, IntlString> = {
    permanent: getEmbeddedLabel('Повторяется по расписанию; серия появляется в календаре, если показ включён'),
    'one-off': getEmbeddedLabel('Одна встреча в указанное время, без повторения')
  }

  const periods: Array<{ id: Period, label: IntlString }> = [
    { id: 'day', label: getEmbeddedLabel('дни') },
    { id: 'week', label: getEmbeddedLabel('недели') },
    { id: 'month', label: getEmbeddedLabel('месяцы') }
  ]

  // The event keeps an IANA id (`Asia/Novosibirsk`) and the product picks it from the UI kit popup: the
  // whole IANA list grouped by continent with search, not a handful of hardcoded offsets.
  let timeZone: string = getUserTimezone()

  function pickZone (event: MouseEvent): void {
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

  // The two fields keep the length of the meeting: moving the start moves the end, and pulling the end
  // before the start takes the start back with it.
  function setStart (value: number | null): void {
    if (value == null) return
    start = value
    due = start + duration
  }

  function setDue (value: number | null): void {
    if (value == null) return
    if (value > start) {
      due = value
      duration = value - start
    } else {
      due = value
      start = value - duration
    }
  }

  // With the switch on the fields pick whole days: the time stays out of the meeting. The times the
  // form had before the switch come back when it is turned off.
  let times: { start: number, due: number } | undefined
  function toggleAllDay (value: boolean): void {
    if (value) {
      times = { start, due }
      const from = new Date(start)
      from.setHours(0, 0, 0, 0)
      const to = new Date(due)
      to.setHours(0, 0, 0, 0)
      start = from.getTime()
      due = to.getTime()
      duration = due - start
    } else if (times !== undefined) {
      start = times.start
      due = times.due
      duration = due - start
      times = undefined
    }
    allDay = value
  }

  $: repeats = selected === 'permanent'
</script>

<div class="create-meeting">
  <Dialog
    label={getEmbeddedLabel('Новая встреча')}
    width="medium"
    submitLabel={getEmbeddedLabel('Создать')}
    cancelLabel={getEmbeddedLabel('Отмена')}
    submitKind="brand"
    canSubmit={name.trim() !== ''}
    submitOnEnter
    on:submit
    on:cancel
    on:close
  >
    <Tabs items={tabs} bind:selected size="medium" aria-label="Тип встречи" />

    <p class="create-meeting__hint"><Label label={hints[selected]} /></p>

    <div class="create-meeting__form">
      <span class="create-meeting__label">Название</span>
      <TextInput
        bind:value={name}
        placeholder={getEmbeddedLabel('Название встречи')}
        size="medium"
        fullWidth
        autofocus
        focusIndex={1}
      />

      <span class="create-meeting__label">Время</span>
      <div class="create-meeting__stack">
        <Checkbox
          label={getEmbeddedLabel('Весь день')}
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

      <span class="create-meeting__label">Часовой пояс</span>
      <div class="create-meeting__wide">
        <Button kind="secondary" size="medium" hasMenu on:click={pickZone}>
          <span class="create-meeting__zone">{zoneName}</span>
        </Button>
      </div>

      <span class="create-meeting__label">Описание</span>
      <div class="create-meeting__wide">
        <TextArea
          bind:value={description}
          kind="secondary"
          size="small"
          rows={2}
          maxRows={4}
          fullWidth
          placeholder={getEmbeddedLabel('Описание')}
        />
      </div>

      {#if repeats}
        <span class="create-meeting__label">Повторение</span>
        <div class="create-meeting__inline">
          <span class="create-meeting__text">каждые</span>
          <NumberInput bind:value={repeatCount} min={1} max={365} size="medium" aria-label="Каждые" />
          <Dropdown
            items={periods}
            bind:selected={period}
            size="medium"
            kind="secondary"
            fullWidth
            aria-label="Единица повторения"
          />
        </div>
      {/if}

      <span class="create-meeting__label">Календарь</span>
      <Toggle
        label={getEmbeddedLabel('Показывать в календаре')}
        description={inCalendar
          ? getEmbeddedLabel('Встреча появится в календаре')
          : getEmbeddedLabel('Встречи не будет в календаре')}
        labelPosition="start"
        fullWidth
        bind:checked={inCalendar}
      />

      <span class="create-meeting__label">Напоминание</span>
      <div class="create-meeting__inline">
        <Checkbox label={getEmbeddedLabel('Уведомить')} bind:checked={remind} />
        <Dropdown
          items={ahead}
          bind:selected={aheadSelected}
          multiselect
          size="medium"
          kind="secondary"
          fullWidth
          placeholder={getEmbeddedLabel('Когда напомнить')}
          disabled={!remind}
          aria-label="Интервалы напоминания"
        />
      </div>

      <span class="create-meeting__label">Пароль гостя</span>
      <TextInput
        bind:value={password}
        type="password"
        placeholder={getEmbeddedLabel('Введите пароль')}
        size="medium"
        fullWidth
      />

      <span class="create-meeting__label">Участники</span>
      <div class="create-meeting__inline">
        <TextInput bind:value={guest} placeholder={getEmbeddedLabel('Имя или почта гостя')} size="medium" fullWidth />
        <Button kind="secondary" size="medium" icon={ui.icon.Add} label={getEmbeddedLabel('Добавить')} />
      </div>
    </div>
  </Dialog>
</div>

<style lang="scss">
  .create-meeting {
    // Room for the whole shadow: the next story row would otherwise leave a hard band.
    padding: calc(var(--global-modal-ShadowY) + var(--global-modal-ShadowBlur));

    &__hint {
      margin: var(--spacing-1) 0 var(--spacing-3);
      font-size: 0.8125rem;
      line-height: 1.125rem;
      color: var(--global-secondary-TextColor);
    }

    &__form {
      display: grid;
      grid-template-columns: 8.5rem 1fr;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
    }

    &__label {
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

      // The zone is a menu button, which is inline-flex: it takes the field width of the row.
      :global(.button) {
        width: 100%;
        justify-content: flex-start;
      }
    }

    &__zone {
      overflow: hidden;
      min-width: 0;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__text {
      font-size: 0.875rem;
      color: var(--global-secondary-TextColor);
      white-space: nowrap;
    }

    &__dash {
      color: var(--global-secondary-TextColor);
    }
  }
</style>
