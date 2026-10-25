<script lang="ts">
  import type { Timestamp } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import ui, { Label, areDatesEqual, ticker, Header, getFormattedDate } from '@hcengineering/ui'
  import { Button, IconButton } from '@hcengineering/ui/kit'

  import time from '../plugin'

  export let currentDate: Date = new Date()

  function inc (val: number): void {
    if (val === 0) {
      currentDate = new Date()
      return
    }
    currentDate.setDate(currentDate.getDate() + val)
    currentDate = currentDate
  }

  function getTitle (day: Date, now: Timestamp): IntlString {
    const isCurrentYear = day.getFullYear() === new Date().getFullYear()
    return getEmbeddedLabel(
      day.toLocaleDateString('default', {
        month: 'long',
        day: 'numeric',
        year: isCurrentYear ? undefined : 'numeric'
      })
    )
  }

  const todayDate = new Date()
  $: isToday = areDatesEqual(currentDate, new Date($ticker))
</script>

<Header adaptive="disabled">
  <div class="heading-medium-20 line-height-auto overflow-label pl-2">
    <Label label={getTitle(currentDate, $ticker)} />
  </div>

  <svelte:fragment slot="actions" let:doubleRow>
    <slot />
    <IconButton
      icon={ui.icon.ChevronLeft}
      kind="secondary"
      size="small"
      data-id="btnPrev"
      tooltip={{ label: ui.string.Back }}
      on:click={() => {
        inc(-1)
      }}
    />
    <Button
      icon={ui.icon.Sun}
      label={!doubleRow ? ui.string.TodayDate : undefined}
      labelParams={{ date: getFormattedDate(todayDate.getTime(), { weekday: 'short', day: 'numeric' }) }}
      tooltip={doubleRow ? { label: time.string.Today } : undefined}
      kind="secondary"
      size="small"
      data-id="btnToday"
      inheritFont
      hasMenu
      disabled={isToday}
      on:click={() => {
        inc(0)
      }}
    />
    <IconButton
      icon={ui.icon.ChevronRight}
      kind="secondary"
      size="small"
      data-id="btnNext"
      tooltip={{ label: ui.string.Next }}
      on:click={() => {
        inc(1)
      }}
    />
  </svelte:fragment>
</Header>
