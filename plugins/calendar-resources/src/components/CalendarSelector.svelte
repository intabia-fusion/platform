<script lang="ts">
  import type { Calendar, PrimaryCalendar } from '@hcengineering/calendar'
  import { AccessLevel, getPrimaryCalendar } from '@hcengineering/calendar'
  import type { Ref } from '@hcengineering/core'
  import { getCurrentAccount } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { Dropdown, Icon } from '@hcengineering/ui'
  // The card of an event draws its fields with the kit, so the picker of a calendar follows it:
  // the legacy dropdown is a ghost text button, the kit one is the bordered control of a row.
  import { Dropdown as KitDropdown } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'
  import calendar from '../plugin'
  import { getEmbeddedLabel, translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'

  export let value: Ref<Calendar> | undefined
  export let disabled: boolean = false
  export let focusIndex = -1
  export let withIcon: boolean = true
  /** `ghost` - the standalone picker; `secondary` - a row control of the dialog card. */
  export let appearance: 'ghost' | 'secondary' = 'ghost'

  const dispatch = createEventDispatcher()

  let calendars: Calendar[] = []
  let preference: PrimaryCalendar | undefined = undefined
  const me = getCurrentAccount()
  const q = createQuery()
  const prefQ = createQuery()

  let prefsLoaded = false
  let calendarsLoaded = false

  q.query(
    calendar.class.Calendar,
    { user: { $in: me.socialIds }, hidden: false, access: { $in: [AccessLevel.Owner, AccessLevel.Writer] } },
    (res) => {
      calendarsLoaded = true
      calendars = res
      setCalendar(calendars, preference)
    }
  )

  prefQ.query(calendar.class.PrimaryCalendar, {}, (res) => {
    prefsLoaded = true
    preference = res[0]
    setCalendar(calendars, preference)
  })

  function setCalendar (calendars: Calendar[], primary: PrimaryCalendar | undefined): void {
    if (value) return
    if (!calendarsLoaded || !prefsLoaded) return
    const target = getPrimaryCalendar(calendars, primary, getCurrentAccount().uuid)
    change(target)
  }

  let personalCalendarLabel: string = ''

  $: translateCB(calendar.string.PersonalCalendar, {}, $themeStore.language, (r) => {
    personalCalendarLabel = r
  })

  $: items = calendars.map((p) => {
    return {
      _id: p._id,
      label: p._id === me.uuid + '_calendar' ? personalCalendarLabel : p.name
    }
  })

  $: selected = value !== undefined ? items.find((p) => p._id === value) : undefined

  function change (id: Ref<Calendar>) {
    if (value !== id) {
      dispatch('change', { _id: id })
      value = id
    }
  }

  // The kit dropdown takes an IntlString per item; the names here are already read from the model.
  $: kitItems = items.map((it) => ({ id: it._id, label: getEmbeddedLabel(it.label) }))
</script>

{#if calendars.length > 0}
  {#if appearance === 'secondary'}
    <KitDropdown
      items={kitItems}
      selected={value}
      kind="secondary"
      size="medium"
      fullWidth
      withSearch={false}
      placeholder={calendar.string.Calendar}
      {disabled}
      {focusIndex}
      on:selected={(e) => change(e.detail)}
    />
  {:else}
    <div class="flex-row-center flex-gap-1">
      {#if withIcon}
        <Icon icon={calendar.icon.Calendar} size="small" />
      {/if}
      <Dropdown
        kind="ghost"
        size="medium"
        placeholder={calendar.string.Calendar}
        {items}
        withSearch={false}
        {selected}
        {disabled}
        {focusIndex}
        on:selected={(e) => {
          change(e.detail._id)
        }}
      />
    </div>
  {/if}
{/if}
