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
<script lang="ts">
  import { DateRangeMode } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import { tooltip as tooltipAction } from '../../tooltips'
  import type { IconComponent, LabelAndProps } from '../../types'
  import { getDueState } from './due'
  import DateValue from './DateValue.svelte'
  import type { DateLabelProps, DateTone } from './types'

  type $$Props = DateLabelProps

  export let value: number | null | undefined = undefined
  export let mode: DateRangeMode = DateRangeMode.DATE
  export let placeholder: IntlString = ui.string.NoDate
  export let icon: IconComponent | undefined = undefined
  export let showIcon: boolean = true
  export let tone: DateTone | undefined = undefined
  export let due: boolean = false
  export let ignoreOverdue: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined

  $: dueState = due ? getDueState(value, ignoreOverdue) : undefined
  $: shownTone = tone ?? dueState?.tone
</script>

<span
  class="date-label date-label--{shownTone ?? 'normal'}"
  class:date-label--empty={value === null || value === undefined}
  use:tooltipAction={tooltip ?? dueState?.tooltip}
>
  {#if showIcon}
    <span class="date-label__icon" aria-hidden="true">
      <Icon icon={icon ?? (shownTone === 'overdue' ? ui.icon.CalendarX : ui.icon.Calendar)} size="small" />
    </span>
  {/if}
  <span class="date-label__text">
    {#if value === null || value === undefined}
      <Label label={placeholder} />
    {:else}
      <DateValue {value} {mode} />
    {/if}
  </span>
</span>

<style lang="scss">
  // Text in the line of the place: its font and color, no button box.
  .date-label {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-0_5);
    min-width: 0;
    line-height: 1.25rem;
    white-space: nowrap;

    &__icon {
      display: inline-flex;
      flex-shrink: 0;
      color: var(--global-secondary-TextColor);
    }
    &__text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    &--empty .date-label__text {
      color: var(--global-secondary-TextColor);
    }
    &--warning .date-label__icon {
      color: var(--theme-warning-color);
    }
    &--critical .date-label__icon,
    &--overdue .date-label__icon {
      color: var(--global-error-TextColor);
    }
  }
</style>
