<!--
// Copyright © 2026 Intabia Fusion
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
  import { Timestamp } from '@intabiafusion/core'
  import { IntlString, getEmbeddedLabel } from '@intabiafusion/platform'
  import ui, {
    Label,
    areDatesEqual,
    ticker,
    Header,
    ButtonIcon,
    ButtonBase,
    IconChevronLeft,
    IconChevronRight,
    getFormattedDate
  } from '@intabiafusion/ui'

  export let currentDate: Date = new Date()
  // Step for navigation: number of days to shift, or 'month' for a calendar-month step.
  export let step: number | 'month' = 1

  function inc (val: number): void {
    if (val === 0) {
      currentDate = new Date()
      return
    }
    const next = new Date(currentDate)
    if (step === 'month') {
      next.setMonth(next.getMonth() + val)
    } else {
      next.setDate(next.getDate() + val * step)
    }
    currentDate = next
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

<Header adaptive={'disabled'}>
  <div class="heading-medium-20 line-height-auto overflow-label pl-2">
    <Label label={getTitle(currentDate, $ticker)} />
  </div>

  <svelte:fragment slot="actions" let:doubleRow>
    <slot />
    <ButtonIcon
      icon={IconChevronLeft}
      kind={'secondary'}
      size={'small'}
      dataId={'btnPrev'}
      on:click={() => {
        inc(-1)
      }}
    />
    <ButtonBase
      label={!doubleRow ? ui.string.Today : undefined}
      title={!doubleRow ? getFormattedDate(todayDate.getTime(), { weekday: 'short', day: 'numeric' }) : undefined}
      type={!doubleRow ? 'type-button' : 'type-button-icon'}
      kind={'secondary'}
      size={'small'}
      dataId={'btnToday'}
      inheritFont
      hasMenu
      disabled={isToday}
      on:click={() => {
        inc(0)
      }}
    />
    <ButtonIcon
      icon={IconChevronRight}
      kind={'secondary'}
      size={'small'}
      dataId={'btnNext'}
      on:click={() => {
        inc(1)
      }}
    />
  </svelte:fragment>
</Header>
