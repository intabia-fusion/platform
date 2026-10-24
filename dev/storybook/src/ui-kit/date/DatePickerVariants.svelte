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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { DatePicker, type DatePickerProps, type DatePickerResult } from '@hcengineering/ui/kit'
  import { onMount } from 'svelte'

  // Storybook does not depend on core: the enum values as strings.
  const DATETIME = 'datetime' as unknown as NonNullable<DatePickerProps['mode']>
  const TIMEONLY = 'timeonly' as unknown as NonNullable<DatePickerProps['mode']>

  const value = new Date(2026, 9, 24, 9, 30).getTime()
  const start = new Date(2026, 9, 12).getTime()
  const end = new Date(2026, 10, 3).getTime()

  const variants: Array<{ title: string, props: DatePickerProps }> = [
    { title: 'date', props: { value, label: getEmbeddedLabel('Set due date') } },
    {
      title: 'date and time, shifts, detail',
      props: {
        value,
        mode: DATETIME,
        shifts: true,
        label: getEmbeddedLabel('Edit due date'),
        detail: getEmbeddedLabel('Needs to be completed by this date')
      }
    },
    {
      title: 'only the time, shifts',
      props: { value, mode: TIMEONLY, shifts: true, label: getEmbeddedLabel('Time') }
    },
    { title: 'range', props: { range: true, value: start, end, label: getEmbeddedLabel('Date') } },
    { title: 'compact', props: { value, compact: true } },
    { title: 'empty', props: { value: null } }
  ]

  let last: string = '-'

  function show (result: DatePickerResult | null): void {
    if (result === null) {
      last = 'closed without a change'
      return
    }
    const format = (ts: number | null | undefined): string => (ts == null ? 'null' : new Date(ts).toLocaleString())
    last = result.end !== undefined ? `${format(result.value)} — ${format(result.end)}` : format(result.value)
  }

  let root: HTMLElement | undefined

  // Every picker focuses its input on open; on a page of many the last one would scroll the story down.
  onMount(() => {
    setTimeout(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      root?.scrollIntoView({ block: 'start' })
    }, 100)
  })
</script>

<div bind:this={root} class="date-picker-variants">
  <p class="date-picker-variants__result">close: {last}</p>
  {#each variants as variant}
    <section class="date-picker-variants__item">
      <h3 class="date-picker-variants__title">{variant.title}</h3>
      <div>
        <DatePicker
          {...variant.props}
          on:close={(e) => {
            show(e.detail)
          }}
        />
      </div>
    </section>
  {/each}
</div>

<style lang="scss">
  .date-picker-variants {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--spacing-4);

    &__result {
      flex-basis: 100%;
      margin: 0;
      font-size: 0.75rem;
      color: var(--theme-dark-color);
    }
    &__title {
      margin: 0 0 var(--spacing-1);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--theme-caption-color);
    }
  }
</style>
