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
  Draft of the meeting window as it opens over the calendar and the planner: the dimmed screen
  behind it, the card on top, every field of the meeting in one place, and the guest link next to
  the password and the members instead of in a second popup.

  Two modes share one window - `create` from the planner grid or the calendar, and `edit` of an
  existing meeting - because the fields are the same and the user should not learn a second form
  for the meeting they already own. `origin` decides the kind: a meeting from the planner grid is a
  standing one with a series and no room of its own, a meeting from the calendar is a single one
  held in an office room, and in the settings window that room is the field the user changes.
-->
<script lang="ts">
  import { DateRangeMode } from '@hcengineering/core'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import ui from '@hcengineering/ui'
  import {
    Button,
    Callout,
    Chip,
    DateSelect,
    Dialog,
    Dropdown,
    IconButton,
    MenuButton,
    NumberInput,
    Section,
    SegmentedControl,
    SettingRow,
    TextArea,
    TextInput,
    Toggle,
    type DropdownItem
  } from '@hcengineering/ui/kit'

  /** `create` - a new meeting; `edit` - the same window for a meeting that already exists. */
  export let mode: 'create' | 'edit' = 'create'
  /** `planner` - a standing meeting from the planner grid; `calendar` - a single meeting in a room. */
  export let origin: 'planner' | 'calendar' = 'planner'
  /** Demo state of the footer: a plain form, a submit in flight, a name the form cannot take. */
  export let state: 'ready' | 'saving' | 'invalid' = 'ready'
  /** `owner` - the meeting can be changed; `member` - the card of someone who was invited to it. */
  export let role: 'owner' | 'member' = 'owner'
  /** Opens the mail invite of a guest at once: the state the window is judged by. */
  export let invite: boolean = false

  type Kind = 'one-off' | 'permanent'
  type Period = 'day' | 'week' | 'month'
  type Answer = 'yes' | 'maybe' | 'no'

  const HOUR = 60 * 60 * 1000
  const editing = mode === 'edit'
  // Who opened the window decides what of it is a field and what is a value: an invited person
  // reads the meeting and sets their own reminder, the organiser changes everything.
  const owner = role === 'owner'
  const organizer = 'Анна Зайцева'
  // Enough to tell an address from a typo: the real check is the letter that arrives.
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  // A meeting keeps the kind it was created with: the series of a standing one and the room of a
  // single one do not mix, so the window only follows the origin.
  let kind: Kind = origin === 'planner' ? 'permanent' : 'one-off'
  let name =
    state === 'invalid'
      ? ''
      : !editing
          ? 'Еженедельная встреча команды'
          : kind === 'permanent'
            ? 'Еженедельный синк команды'
            : 'Разбор инцидента'
  let description = editing
    ? kind === 'permanent'
      ? 'Прогресс, блокеры и планы на неделю. Протокол ведёт дежурный.'
      : 'Что случилось, что делаем, кто отвечает.'
    : ''
  let group = 'weekly'
  let allDay = false
  let start: number = Date.now()
  let due: number = start + HOUR
  const zone = 'Asia/Novosibirsk'
  let repeatCount = 1
  let period: Period = 'week'
  let inCalendar = true
  let remember = true
  let reminders: number[] = editing ? [15, 60] : [15]
  let members = editing ? ['Анна Зайцева', 'Игорь Волков', 'Мария Лебедева'] : []
  // A guest is addressed by mail: no account in the workspace, the meeting arrives as a link.
  interface Guest { id: string, name: string, email: string }
  let guests: Guest[] = editing ? [{ id: 'guest-1', name: 'Ирина Смирнова', email: 'i.smirnova@acme.io' }] : []
  let inviteOpen = invite
  let guestName = ''
  let guestEmail = ''
  let guestSeq = guests.length
  let access: 'link' | 'members' = 'link'
  let passwordSet = editing
  let password = ''
  let editingPassword = false
  let ttl: 'day' | 'week' | 'month' | 'forever' = 'forever'
  let past: 'last' | 'none' = 'last'

  const link = 'https://huly.app/link/7f3c2a'

  // The summary is read as a sentence, so the period brings its own preposition with it.
  const repeats: Record<Period, string> = {
    day: 'каждый день',
    week: 'каждую неделю',
    month: 'каждый месяц'
  }

  const groups: Array<DropdownItem<string>> = [
    { id: 'none', label: getEmbeddedLabel('Без группы') },
    { id: 'weekly', label: getEmbeddedLabel('Еженедельные') },
    { id: 'product', label: getEmbeddedLabel('Продуктовые') }
  ]

  const rooms: Array<DropdownItem<string>> = [
    { id: 'love-qa', label: getEmbeddedLabel('Love QA') },
    { id: 'meeting-1', label: getEmbeddedLabel('Meeting Room 1') },
    { id: 'voice-1', label: getEmbeddedLabel('Voice Room 1') }
  ]
  let room = 'love-qa'
  // Values the reader sees as text: a label resolves only through a component, not in a sentence.
  const roomNames: Record<string, string> = {
    'love-qa': 'Love QA',
    'meeting-1': 'Meeting Room 1',
    'voice-1': 'Voice Room 1'
  }
  const groupNames: Record<string, string> = {
    none: 'Без группы',
    weekly: 'Еженедельные',
    product: 'Продуктовые'
  }

  const accessItems: Array<DropdownItem<'link' | 'members'>> = [
    { id: 'link', label: getEmbeddedLabel('Любой по ссылке') },
    { id: 'members', label: getEmbeddedLabel('Только участники') }
  ]

  // The calendar keeps every lead time, the meeting itself only the earliest one.
  const reminderItems: Array<DropdownItem<number>> = [
    { id: 5, label: getEmbeddedLabel('за 5 минут') },
    { id: 15, label: getEmbeddedLabel('за 15 минут') },
    { id: 30, label: getEmbeddedLabel('за 30 минут') },
    { id: 60, label: getEmbeddedLabel('за 1 час') },
    { id: 1440, label: getEmbeddedLabel('за 1 день') }
  ]

  const ttlItems: Array<DropdownItem<'day' | 'week' | 'month' | 'forever'>> = [
    { id: 'day', label: getEmbeddedLabel('День') },
    { id: 'week', label: getEmbeddedLabel('Неделя') },
    { id: 'month', label: getEmbeddedLabel('Месяц') },
    { id: 'forever', label: getEmbeddedLabel('Бессрочно') }
  ]

  const pastItems: Array<DropdownItem<'last' | 'none'>> = [
    { id: 'last', label: getEmbeddedLabel('Оставить встречу') },
    { id: 'none', label: getEmbeddedLabel('Отключить ссылку') }
  ]

  // An invited person answers for themselves: the pick is a draft until it is saved, so the action
  // says what it does and stays off while there is nothing to save.
  const answerItems: Array<{ id: Answer, label: IntlString }> = [
    { id: 'yes', label: getEmbeddedLabel('Пойду') },
    { id: 'maybe', label: getEmbeddedLabel('Может быть') },
    { id: 'no', label: getEmbeddedLabel('Не смогу') }
  ]
  let answer: Answer = 'yes'
  let savedAnswer: Answer = 'yes'

  $: answerChanged = answer !== savedAnswer

  function saveAnswer (): void {
    savedAnswer = answer
  }

  const kindItems: Array<{ id: Kind, label: IntlString }> = [
    { id: 'one-off', label: getEmbeddedLabel('Разовая') },
    { id: 'permanent', label: getEmbeddedLabel('Повторяющаяся') }
  ]

  const captions = {
    title: getEmbeddedLabel(editing ? (owner ? 'Настройки встречи' : 'Встреча') : 'Новая встреча'),
    about: getEmbeddedLabel('О встрече'),
    when: getEmbeddedLabel('Когда'),
    where: getEmbeddedLabel('Где'),
    who: getEmbeddedLabel('Участники'),
    access: getEmbeddedLabel('Доступ по ссылке'),
    reminders: getEmbeddedLabel('Напоминания'),
    name: getEmbeddedLabel('Название'),
    description: getEmbeddedLabel('Описание'),
    organizer: getEmbeddedLabel('Организатор'),
    group: getEmbeddedLabel('Группа'),
    kind: getEmbeddedLabel('Тип'),
    allDay: getEmbeddedLabel('Весь день'),
    time: getEmbeddedLabel('Время'),
    zone: getEmbeddedLabel('Часовой пояс'),
    repeat: getEmbeddedLabel('Повторять каждые'),
    repeatView: getEmbeddedLabel('Повторение'),
    room: getEmbeddedLabel('Комната'),
    calendar: getEmbeddedLabel('Календарь'),
    members: getEmbeddedLabel('Участники'),
    canStart: getEmbeddedLabel('Кто может начать'),
    password: getEmbeddedLabel('Пароль гостя'),
    link: getEmbeddedLabel('Ссылка'),
    ttl: getEmbeddedLabel('Срок жизни ссылки'),
    past: getEmbeddedLabel('После последней встречи'),
    remember: getEmbeddedLabel('Напоминать'),
    reminderTimes: getEmbeddedLabel('Когда напомнить')
  }

  const formatDay = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
  const formatTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

  $: permanent = kind === 'permanent'
  $: hours = Math.round((due - start) / HOUR)
  $: duration = hours === 1 ? '1 ч' : `${hours} ч`
  // One line that says what the window is about to do, in the words the user would use themselves.
  $: when = allDay
    ? `${formatDay.format(start)} · весь день`
    : `${formatDay.format(start)}, ${formatTime.format(start)}–${formatTime.format(due)}, ${duration}`
  $: summary = permanent ? `${repeats[period]} · ${when} · ${zone}` : `Одна встреча · ${when} · ${zone}`
  $: repeatValue = repeats[period].charAt(0).toUpperCase() + repeats[period].slice(1)
  // The planner reads the same events: a meeting is in it only through its series in the calendar.
  const calendarHint = getEmbeddedLabel('Серия встречи попадает в календарь, и только оттуда — в планировщик')
  $: canSubmit = name.trim() !== '' && state !== 'saving'
  $: picked = reminderItems.filter((it) => reminders.includes(it.id))
  $: invalidName = state === 'invalid'
  $: guestEmailValid = EMAIL.test(guestEmail.trim())

  // The two fields keep the length of the meeting: moving the start moves the end.
  function setStart (value: number | null): void {
    if (value == null) return
    const length = due - start
    start = value
    due = value + length
  }

  function setDue (value: number | null): void {
    if (value == null) return
    due = value > start ? value : start + (value - start)
  }

  function removeMember (who: string): void {
    members = members.filter((it) => it !== who)
  }

  // The invite of a guest sits next to the people picker: one place for both kinds of participant.
  function addGuest (): void {
    const email = guestEmail.trim()
    if (!EMAIL.test(email)) return
    guests = [...guests, { id: `guest-${++guestSeq}`, name: guestName.trim(), email }]
    guestName = ''
    guestEmail = ''
    inviteOpen = false
  }

  function removeGuest (id: string): void {
    guests = guests.filter((it) => it.id !== id)
  }
</script>

<div class="stage">
  <!-- The screen the window covers: a planner grid, dimmed the way the real overlay dims it. -->
  <div class="stage__screen" aria-hidden="true">
    <div class="faux">
      <div class="faux__head">
        {#each ['Пн 23', 'Вт 24', 'Ср 25', 'Чт 26', 'Пт 27', 'Сб 28', 'Вс 29'] as day}
          <span class="faux__day" class:faux__day--today={day === 'Ср 25'}>{day}</span>
        {/each}
      </div>
      <div class="faux__grid">
        {#each ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'] as hour}
          <span class="faux__hour">{hour}</span>
        {/each}
        {#each Array(7) as _, column}
          <div class="faux__column" style={`left: ${(column * 100) / 7}%`} />
        {/each}
        {#each [{ column: 0, top: 9, label: 'Синк команды' }, { column: 2, top: 16, label: 'Демо' }, { column: 3, top: 24, label: 'Ретро' }, { column: 4, top: 10, label: '1:1' }] as event}
          <div
            class="faux__event"
            style={`left: calc(${(event.column * 100) / 7}% + 0.25rem); top: ${event.top}rem`}
          >
            {event.label}
          </div>
        {/each}
      </div>
    </div>
  </div>
  <div class="stage__scrim" />

  <div class="stage__dialog">
    <Dialog
      label={captions.title}
      width="large"
      submitLabel={getEmbeddedLabel(editing ? 'Сохранить' : 'Создать встречу')}
      cancelLabel={getEmbeddedLabel('Отмена')}
      submitKind="brand"
      canSubmit={canSubmit}
      loading={state === 'saving'}
      submitOnEnter={owner}
      hideSubmit={!owner}
      hideCancel={!owner}
      on:submit
      on:cancel
      on:close
    >
      <svelte:fragment slot="footerStart">
        {#if !owner}
          <div class="meeting__answer">
            <span class="meeting__text">Мой ответ</span>
            <SegmentedControl
              items={answerItems}
              selected={answer}
              size="medium"
              aria-label="Мой ответ"
              on:select={(event) => (answer = event.detail)}
            />
          </div>
        {:else if editing}
          <Button kind="negative-ghost" size="medium" icon={ui.icon.Trash} label={getEmbeddedLabel('Удалить')} />
        {/if}
      </svelte:fragment>
      <svelte:fragment slot="footerActions">
        {#if !owner}
          <Button kind="secondary" size="medium" icon={ui.icon.Play} label={getEmbeddedLabel('Присоединиться')} />
          {#if answerChanged}
            <Button kind="brand" size="medium" label={getEmbeddedLabel('Сохранить ответ')} on:click={saveAnswer} />
          {:else}
            <!-- The pick matches what is stored: the button says so instead of only being off. -->
            <Button kind="secondary" size="medium" icon={ui.icon.Check} label={getEmbeddedLabel('Ответ сохранён')} disabled />
          {/if}
        {/if}
      </svelte:fragment>

      <div class="meeting">
        <!-- What the window is about to do, before the first field: the schedule reads as a sentence. -->
        <p class="meeting__summary">{summary}</p>

        {#if editing}
          <Callout
            tone="info"
            title={getEmbeddedLabel('Встреча идёт сейчас')}
            label={getEmbeddedLabel('3 участника в комнате встречи')}
          >
            <svelte:fragment slot="actions">
              <div class="meeting__callout-actions">
                <Button kind="secondary" size="small" icon={ui.icon.Play} label={getEmbeddedLabel('Присоединиться')} />
                {#if owner}
                  <Button kind="negative-ghost" size="small" label={getEmbeddedLabel('Завершить')} />
                {/if}
              </div>
            </svelte:fragment>
          </Callout>
        {/if}

        <Section label={captions.about} icon={ui.icon.Calendar} level={3}>
          {#if !owner}
            <SettingRow label={captions.organizer}>
              <span class="meeting__value">{organizer}</span>
            </SettingRow>
          {/if}
          <SettingRow label={captions.name}>
            {#if owner}
              <div class="meeting__field meeting__field--wide">
                <TextInput
                  bind:value={name}
                  placeholder={getEmbeddedLabel('Название встречи')}
                  size="medium"
                  fullWidth
                  autofocus
                  focusIndex={1}
                />
              </div>
            {:else}
              <span class="meeting__heading">{name}</span>
            {/if}
            <svelte:fragment slot="details">
              {#if invalidName}
                <span class="meeting__error">Название не может быть пустым</span>
              {/if}
            </svelte:fragment>
          </SettingRow>
          <SettingRow label={captions.description} stacked={owner}>
            {#if owner}
              <div class="meeting__field meeting__field--wide">
                <TextArea
                  bind:value={description}
                  placeholder={getEmbeddedLabel('О чём встреча')}
                  kind="secondary"
                  size="small"
                  rows={2}
                  maxRows={5}
                  fullWidth
                />
              </div>
            {:else}
              <p class="meeting__body">{description === '' ? 'Без описания' : description}</p>
            {/if}
          </SettingRow>
          {#if permanent}
            <SettingRow label={captions.group}>
              {#if owner}
                <div class="meeting__field">
                  <Dropdown items={groups} bind:selected={group} size="medium" kind="secondary" fullWidth />
                </div>
              {:else}
                <span class="meeting__value">{groupNames[group]}</span>
              {/if}
            </SettingRow>
          {/if}
        </Section>

        <Section label={captions.when} icon={ui.icon.Clock} level={3}>
          {#if permanent}
            <SettingRow label={captions.kind}>
              {#if editing || !owner}
                <!-- A meeting keeps the kind it was created with: the series and the room do not mix. -->
                <span class="meeting__value">
                  {permanent ? 'Повторяющаяся' : 'Разовая'}
                </span>
              {:else}
                <div class="meeting__field meeting__field--auto">
                  <SegmentedControl
                    items={kindItems}
                    selected={kind}
                    size="medium"
                    aria-label="Тип встречи"
                    on:select={(event) => (kind = event.detail)}
                  />
                </div>
              {/if}
            </SettingRow>
          {/if}
          {#if owner}
            <SettingRow label={captions.allDay} hint={getEmbeddedLabel('Время встречи не показывается')} let:labelId>
              <Toggle aria-labelledby={labelId} bind:checked={allDay} />
            </SettingRow>
          {/if}
          <SettingRow label={captions.time} stacked={owner}>
            {#if owner}
              <div class="meeting__range">
                <DateSelect
                  value={start}
                  mode={allDay ? DateRangeMode.DATE : DateRangeMode.DATETIME}
                  size="medium"
                  fullWidth
                  on:change={(event) => { setStart(event.detail) }}
                />
                <span class="meeting__dash">—</span>
                <DateSelect
                  value={due}
                  mode={allDay ? DateRangeMode.DATE : DateRangeMode.DATETIME}
                  size="medium"
                  fullWidth
                  on:change={(event) => { setDue(event.detail) }}
                />
              </div>
            {:else}
              <span class="meeting__value">{when}</span>
            {/if}
          </SettingRow>
          <SettingRow label={captions.zone}>
            {#if owner}
              <div class="meeting__field meeting__field--zone">
                <Button kind="secondary" size="medium" hasMenu iconRight={ui.icon.ChevronDown}>{zone}</Button>
              </div>
            {:else}
              <span class="meeting__value">{zone}</span>
            {/if}
          </SettingRow>
          {#if permanent}
            <SettingRow label={owner ? captions.repeat : captions.repeatView}>
              {#if owner}
                <div class="meeting__control">
                  <div class="meeting__number">
                    <NumberInput bind:value={repeatCount} min={1} max={365} size="medium" aria-label="Повторять каждые" />
                  </div>
                  <div class="meeting__field meeting__field--unit">
                    <Dropdown
                      items={[
                        { id: 'day', label: getEmbeddedLabel('дни') },
                        { id: 'week', label: getEmbeddedLabel('недели') },
                        { id: 'month', label: getEmbeddedLabel('месяцы') }
                      ]}
                      bind:selected={period}
                      size="medium"
                      kind="secondary"
                      fullWidth
                      aria-label="Единица повторения"
                    />
                  </div>
                </div>
              {:else}
                <span class="meeting__value">{repeatValue}</span>
              {/if}
              <svelte:fragment slot="details">
                <span class="meeting__note">
                  Ближайшая: {formatDay.format(Date.now())}, {formatTime.format(start)}
                </span>
              </svelte:fragment>
            </SettingRow>
          {/if}
        </Section>

        <Section label={captions.where} icon={ui.icon.DoorOpen} level={3}>
          <SettingRow
            label={captions.room}
            hint={permanent
              ? getEmbeddedLabel('Встреча идёт в комнате рабочего пространства')
              : owner
                ? getEmbeddedLabel('Комната офиса, в которой встреча пройдёт; её можно сменить')
                : getEmbeddedLabel('Комната офиса, в которой встреча пройдёт')}
          >
            {#if permanent || !owner}
              <span class="meeting__value">
                {permanent ? 'Комната рабочего пространства' : roomNames[room]}
              </span>
            {:else}
              <div class="meeting__field">
                <Dropdown items={rooms} bind:selected={room} size="medium" kind="secondary" fullWidth />
              </div>
            {/if}
          </SettingRow>
          <!-- A series lives in the calendar, so the switch is a standing meeting's business: the
               planner shows the events made in it, and there is one series behind both - a second
               switch would mean the same thing. -->
          {#if permanent && owner}
            <SettingRow label={captions.calendar} hint={calendarHint} let:labelId>
              <Toggle aria-labelledby={labelId} bind:checked={inCalendar} />
            </SettingRow>
          {/if}
        </Section>

        <Section label={captions.who} icon={ui.icon.People} level={3}>
          <SettingRow
            label={captions.members}
            hint={owner
              ? getEmbeddedLabel('Люди из системы и гости по почте: гость подключится по ссылке, аккаунт ему не нужен')
              : undefined}
          >
            {#if owner}
              <div class="meeting__control">
                <MenuButton
                  kind="secondary"
                  size="medium"
                  icon={ui.icon.PersonPlus}
                  label={getEmbeddedLabel('Добавить')}
                  items={[
                    { id: 'Анна Зайцева', label: getEmbeddedLabel('Анна Зайцева') },
                    { id: 'Игорь Волков', label: getEmbeddedLabel('Игорь Волков') },
                    { id: 'Мария Лебедева', label: getEmbeddedLabel('Мария Лебедева') },
                    { id: 'Пётр Соколов', label: getEmbeddedLabel('Пётр Соколов') }
                  ]}
                  selected={members}
                  multiselect
                  on:selected={(event) => (members = event.detail)}
                />
                <!-- Outside the menu on purpose: a multiselect menu stays open, and the mail invite
                     opens a field of its own instead of picking a value. -->
                <Button
                  kind="secondary"
                  size="medium"
                  icon={ui.icon.At}
                  label={getEmbeddedLabel('Пригласить')}
                  tooltip={{ label: getEmbeddedLabel('Пригласить по почте: гость подключится по ссылке') }}
                  on:click={() => (inviteOpen = true)}
                />
              </div>
            {/if}
            <svelte:fragment slot="details">
              {#each members as member (member)}
                <Chip
                  label={getEmbeddedLabel(member)}
                  kind="neutral"
                  size="small"
                  removable={owner}
                  on:remove={() => { removeMember(member) }}
                />
              {/each}
              {#each guests as guest (guest.id)}
                <Chip
                  label={getEmbeddedLabel(guest.name === '' ? guest.email : guest.name)}
                  kind="outline"
                  size="small"
                  icon={ui.icon.At}
                  removable={owner}
                  tooltip={{ label: getEmbeddedLabel(guest.name === '' ? 'Гость по почте' : guest.email) }}
                  on:remove={() => { removeGuest(guest.id) }}
                />
              {/each}
              {#if inviteOpen && owner}
                <div class="meeting__invite">
                  <div class="meeting__invite-fields">
                    <div class="meeting__invite-name">
                      <TextInput
                        bind:value={guestName}
                        placeholder={getEmbeddedLabel('Имя гостя')}
                        size="medium"
                        fullWidth
                        autofocus
                      />
                    </div>
                    <div class="meeting__invite-email">
                      <TextInput
                        bind:value={guestEmail}
                        placeholder={getEmbeddedLabel('Почта')}
                        size="medium"
                        fullWidth
                        on:keydown={(event) => {
                          // Enter belongs to the invite, not to the window: the meeting is not saved yet.
                          if (event.key !== 'Enter') return
                          event.preventDefault()
                          addGuest()
                        }}
                      />
                    </div>
                    <Button
                      kind="secondary"
                      size="medium"
                      label={getEmbeddedLabel('Пригласить')}
                      disabled={!guestEmailValid}
                      on:click={addGuest}
                    />
                    <IconButton
                      icon={ui.icon.Cross}
                      kind="ghost"
                      size="medium"
                      tooltip={{ label: getEmbeddedLabel('Отменить') }}
                      on:click={() => (inviteOpen = false)}
                    />
                  </div>
                  <span class="meeting__note">
                    Гость получит приглашение на почту и ссылку на встречу — аккаунт ему не нужен
                  </span>
                </div>
              {:else if members.length === 0 && guests.length === 0}
                <span class="meeting__note">Пока никого: встречу можно открыть по ссылке</span>
              {/if}
            </svelte:fragment>
          </SettingRow>
        </Section>

        <!-- The guest link, its password and its policy are the organiser's business: a participant
             joins by the action of the card, and the plaintext of the password never reaches them. -->
        {#if owner}
          <Section label={captions.access} icon={ui.icon.Link} level={3}>
          <SettingRow label={captions.canStart}>
            <div class="meeting__field">
              <Dropdown items={accessItems} bind:selected={access} size="medium" kind="secondary" fullWidth />
            </div>
          </SettingRow>
          <SettingRow label={captions.password}>
            {#if passwordSet && !editingPassword}
              <div class="meeting__inline">
                <Chip label={getEmbeddedLabel('Пароль задан')} kind="outline" tone="positive" size="small" />
                <Button kind="ghost" size="small" label={getEmbeddedLabel('Сменить')} on:click={() => (editingPassword = true)} />
                <Button kind="negative-ghost" size="small" label={getEmbeddedLabel('Снять')} on:click={() => (passwordSet = false)} />
              </div>
            {:else}
              <div class="meeting__inline meeting__inline--wrap">
                <div class="meeting__field">
                  <TextInput
                    bind:value={password}
                    type="password"
                    placeholder={getEmbeddedLabel('Введите пароль')}
                    size="medium"
                    fullWidth
                    autofocus={editingPassword}
                  />
                </div>
                <Button
                  kind="secondary"
                  size="medium"
                  label={getEmbeddedLabel('Задать')}
                  disabled={password === ''}
                  on:click={() => {
                    passwordSet = true
                    editingPassword = false
                  }}
                />
              </div>
            {/if}
          </SettingRow>
          <SettingRow label={captions.link} stacked>
            <div class="meeting__link">
              <div class="meeting__field meeting__field--wide">
                <TextInput value={link} readonly size="medium" fullWidth aria-label="Ссылка на встречу" />
              </div>
              <IconButton icon={ui.icon.Copy} kind="ghost" size="medium" tooltip={{ label: getEmbeddedLabel('Копировать') }} />
            </div>
            <svelte:fragment slot="details">
              <div class="meeting__inline meeting__inline--wrap">
                <Button kind="secondary" size="small" icon={ui.icon.Copy} label={getEmbeddedLabel('Копировать ссылку')} />
                <!-- A password is copied in either form: with the password inside the link and the bare link. -->
                {#if passwordSet}
                  <Button kind="secondary" size="small" icon={ui.icon.Key} label={getEmbeddedLabel('Копировать с паролем')} />
                {/if}
                <Button kind="negative-ghost" size="small" label={getEmbeddedLabel('Отозвать ссылку')} />
              </div>
            </svelte:fragment>
          </SettingRow>
          <!-- A series outlives the meeting; a single one leaves nothing behind, so both settings of
               the link belong to the standing kind only. -->
          {#if permanent}
            <SettingRow label={captions.ttl}>
              <div class="meeting__field">
                <Dropdown items={ttlItems} bind:selected={ttl} size="medium" kind="secondary" fullWidth />
              </div>
            </SettingRow>
            <SettingRow label={captions.past}>
              <div class="meeting__field">
                <Dropdown items={pastItems} bind:selected={past} size="medium" kind="secondary" fullWidth />
              </div>
            </SettingRow>
          {/if}
          </Section>
        {/if}

        <Section label={captions.reminders} icon={ui.icon.Bell} level={3}>
          <SettingRow label={captions.remember} let:labelId>
            <Toggle aria-labelledby={labelId} bind:checked={remember} />
          </SettingRow>
          <SettingRow label={captions.reminderTimes}>
            <MenuButton
              kind="secondary"
              size="medium"
              icon={ui.icon.Plus}
              label={getEmbeddedLabel('Добавить')}
              items={reminderItems}
              selected={reminders}
              multiselect
              disabled={!remember}
              on:selected={(event) => (reminders = event.detail)}
            />
            <svelte:fragment slot="details">
              {#if remember}
                {#each picked as item (item.id)}
                  <Chip
                    label={item.label}
                    kind="neutral"
                    size="small"
                    removable
                    on:remove={() => (reminders = reminders.filter((id) => id !== item.id))}
                  />
                {/each}
              {:else}
                <span class="meeting__note">Напоминания выключены</span>
              {/if}
            </svelte:fragment>
          </SettingRow>
        </Section>
      </div>
    </Dialog>
  </div>
</div>

<style lang="scss">
  .stage {
    position: relative;
    height: 100vh;
    overflow: hidden;
    background-color: var(--theme-bg-color);
  }

  // The window it covers: enough of a planner to read the dialog as an overlay on top of it.
  .stage__screen {
    position: absolute;
    inset: 0;
    padding: var(--spacing-3);
  }
  .faux {
    height: 100%;
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-panel-color);
    overflow: hidden;
  }
  .faux__head {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    padding: var(--spacing-1) 0 var(--spacing-1) 3.5rem;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .faux__day {
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);
    text-align: center;

    &--today {
      color: var(--accent-color-base);
      font-weight: 600;
    }
  }
  .faux__grid {
    position: relative;
    height: calc(100% - 2rem);
    padding-left: 3.5rem;
  }
  .faux__hour {
    position: absolute;
    left: 0.75rem;
    font-size: 0.625rem;
    color: var(--global-secondary-TextColor);

    // Nine rows of one hour each: the label sits on its own line.
    &:nth-child(1) { top: 0.5rem; }
    &:nth-child(2) { top: 4.5rem; }
    &:nth-child(3) { top: 8.5rem; }
    &:nth-child(4) { top: 12.5rem; }
    &:nth-child(5) { top: 16.5rem; }
    &:nth-child(6) { top: 20.5rem; }
    &:nth-child(7) { top: 24.5rem; }
    &:nth-child(8) { top: 28.5rem; }
    &:nth-child(9) { top: 32.5rem; }
  }
  .faux__column {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background-color: var(--theme-divider-color);
  }
  .faux__event {
    position: absolute;
    width: calc(100% / 7 - 0.75rem);
    height: 3.25rem;
    padding: var(--spacing-0_5) var(--spacing-0_75);
    overflow: hidden;
    font-size: 0.75rem;
    color: var(--global-primary-TextColor);
    background-color: color-mix(in srgb, var(--accent-color-base) 24%, transparent);
    border-left: 2px solid var(--accent-color-base);
    border-radius: var(--small-BorderRadius);
  }

  // The overlay itself: the whole screen dimmed, the window centred on the viewport.
  .stage__scrim {
    position: absolute;
    inset: 0;
    background-color: var(--theme-overlay-color);
  }
  .stage__dialog {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-3);
    pointer-events: none;

    :global(.dialog) {
      pointer-events: auto;
    }
  }

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
    // One field of a row; the row keeps the caption column on the left.
    &__field {
      width: 12rem;
      min-width: 0;

      &--wide {
        width: 100%;
      }
      // A control that keeps its own width: a segmented switch, a button with a name in it.
      &--auto {
        width: max-content;
        max-width: 100%;
      }
      // The zone is a menu button: it fills the column, so its right edge is the edge of the row.
      &--zone :global(.button) {
        width: 100%;
        justify-content: space-between;
        font-weight: 400;
      }
      &--unit {
        width: 7rem;
      }
    }
    // Several controls of one setting, read as a single field: the repeat of a meeting.
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
    // The running session: the buttons sit in the middle of the callout, not at its top line. The kit
    // aligns the action block to the top of a two-line callout and pulls it up by its own margin.
    :global(.callout__actions) {
      align-self: center;
      margin: 0;
    }
    // The answer of an invited person: the pick in the footer, next to what it saves.
    &__answer {
      display: flex;
      align-items: center;
      gap: var(--spacing-1_5);
      min-width: 0;
    }
    &__callout-actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
    }
    &__number {
      width: 5rem;
    }
    &__inline {
      display: flex;
      align-items: center;
      gap: var(--spacing-1_5);
      min-width: 0;

      &--wrap {
        flex-wrap: wrap;
      }
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
    &__link {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      width: 100%;
      min-width: 0;
    }
    &__value {
      font-size: 0.875rem;
      color: var(--global-primary-TextColor);
    }
    // The meeting as its participant reads it: the name is a heading, not a field.
    &__heading {
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.375rem;
      color: var(--global-primary-TextColor);
    }
    &__body {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.25rem;
      white-space: pre-line;
      color: var(--theme-content-color);
    }
    &__text {
      flex-shrink: 0;
      font-size: 0.875rem;
      color: var(--global-secondary-TextColor);
    }
    &__dash {
      color: var(--global-secondary-TextColor);
    }
    &__note {
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
    }
    &__error {
      font-size: 0.75rem;
      color: var(--theme-state-negative-color);
    }
  }
</style>
